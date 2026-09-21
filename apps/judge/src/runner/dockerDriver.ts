import { execFile, spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { LANGUAGES, getLanguage } from "../languages";
import { createWorkspace, readIfPresent } from "./workspace";
import type { Driver, DriverResult, RawRun, RunLimits } from "./types";

const execFileAsync = promisify(execFile);

/**
 * The script that actually drives the sandbox. It compiles once, then runs the
 * binary against every input file in turn, writing stdout/stderr/timing to
 * files the host reads back off the bind mount.
 *
 * Doing all testcases in one container is what makes this fast: spawning a
 * fresh container per testcase costs ~400ms each, which dwarfs the programs.
 */
const RUN_SCRIPT = `#!/bin/sh
cd /box || exit 99

if [ -n "\${COMPILE_CMD:-}" ]; then
  if ! sh -c "\$COMPILE_CMD" >compile.log 2>&1; then
    echo CE > status.txt
    exit 0
  fi
fi

peak_bytes() {
  if [ -r /sys/fs/cgroup/memory.peak ]; then
    cat /sys/fs/cgroup/memory.peak
  elif [ -r /sys/fs/cgroup/memory/memory.max_usage_in_bytes ]; then
    cat /sys/fs/cgroup/memory/memory.max_usage_in_bytes
  else
    echo 0
  fi
}

i=0
while [ -f "input_\$i.txt" ]; do
  before=\$(date +%s%N)
  timeout -s KILL "\$TIME_LIMIT_S" sh -c "\$RUN_CMD" < "input_\$i.txt" > "out_\$i.txt" 2> "err_\$i.txt"
  code=\$?
  after=\$(date +%s%N)
  echo "\$code \$(( (after - before) / 1000000 )) \$(peak_bytes)" > "meta_\$i.txt"
  i=\$((i + 1))
done

echo OK > status.txt
`;

/** Docker on Windows takes forward slashes in -v just fine. */
function toMountPath(dir: string): string {
  return dir.split("\\").join("/");
}

export class DockerDriver implements Driver {
  readonly name = "docker" as const;

  private availability: Promise<boolean> | null = null;

  isAvailable(): Promise<boolean> {
    // Cached because the health endpoint and every submission ask.
    if (!this.availability) {
      this.availability = execFileAsync("docker", ["info", "--format", "{{.ServerVersion}}"], {
        timeout: 8000,
      })
        .then(() => true)
        .catch(() => false);
    }
    return this.availability;
  }

  /** Forget a cached "no" so the service recovers when Docker is started later. */
  resetAvailability(): void {
    this.availability = null;
  }

  async supportedLanguages(): Promise<string[]> {
    return (await this.isAvailable()) ? Object.keys(LANGUAGES) : [];
  }

  async execute({
    languageId,
    sourceCode,
    inputs,
    limits,
  }: {
    languageId: string;
    sourceCode: string;
    inputs: string[];
    limits: RunLimits;
  }): Promise<DriverResult> {
    const lang = getLanguage(languageId);
    if (!lang) throw new Error(`Unsupported language: ${languageId}`);

    const ws = await createWorkspace(lang.sourceFile, sourceCode, inputs);
    try {
      await fs.writeFile(path.join(ws.dir, "run.sh"), RUN_SCRIPT, "utf-8");

      const timeLimitSeconds = (limits.timeMs / 1000).toFixed(2);
      const args = [
        "run",
        "--rm",
        // No network at all — submitted code cannot phone home.
        "--network", "none",
        // Memory cap, with swap pinned to the same value so the limit is real.
        "--memory", `${limits.memoryMb}m`,
        "--memory-swap", `${limits.memoryMb}m`,
        "--cpus", "1",
        "--pids-limit", "128",
        "--ulimit", "nofile=256:256",
        "--ulimit", "fsize=16000000",
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        // Only the bind mount and /tmp are writable.
        "--read-only",
        "--tmpfs", "/tmp:rw,exec,size=256m",
        "-e", `COMPILE_CMD=${lang.compile ?? ""}`,
        "-e", `RUN_CMD=${lang.run}`,
        "-e", `TIME_LIMIT_S=${timeLimitSeconds}`,
        "-e", "HOME=/tmp",
        "-v", `${toMountPath(ws.dir)}:/box`,
        "-w", "/box",
        lang.image,
        "sh", "/box/run.sh",
      ];

      // Host-side backstop: compile allowance plus every testcase's budget.
      const hardTimeout = 30_000 + inputs.length * (limits.timeMs + 1_500);
      await runDocker(args, hardTimeout);

      const status = (await readIfPresent(ws.dir, "status.txt")).trim();
      if (status === "CE") {
        return {
          compileOutput: await readIfPresent(ws.dir, "compile.log"),
          runs: [],
        };
      }

      const runs: RawRun[] = [];
      for (let i = 0; i < inputs.length; i++) {
        runs.push(await collectRun(ws.dir, i));
      }
      return { compileOutput: null, runs };
    } finally {
      await ws.cleanup();
    }
  }
}

async function collectRun(dir: string, index: number): Promise<RawRun> {
  const meta = (await readIfPresent(dir, `meta_${index}.txt`)).trim();
  const stdout = await readIfPresent(dir, `out_${index}.txt`);
  const stderr = await readIfPresent(dir, `err_${index}.txt`);

  if (!meta) {
    // The container died before reaching this testcase — usually an OOM kill
    // that took the whole sandbox with it.
    return {
      exitCode: 137,
      timeMs: 0,
      memoryKb: 0,
      stdout,
      stderr: stderr || "sandbox terminated before this testcase ran",
    };
  }

  const [codeRaw, timeRaw, memRaw] = meta.split(/\s+/);
  return {
    exitCode: Number(codeRaw ?? 1),
    timeMs: Number(timeRaw ?? 0),
    memoryKb: Math.round(Number(memRaw ?? 0) / 1024),
    stdout,
    stderr,
  };
}

function runDocker(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { windowsHide: true });
    let stderr = "";
    let killed = false;

    child.stderr.on("data", (chunk) => {
      // Keep only the tail; a runaway program can emit a lot here.
      stderr = (stderr + chunk.toString()).slice(-8192);
    });

    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", () => {
      clearTimeout(timer);
      if (killed) {
        reject(new Error(`sandbox exceeded its overall ${timeoutMs}ms budget`));
        return;
      }
      // A non-zero exit is normal here: it just means the user's program
      // failed. Real docker failures surface as a missing status.txt.
      resolve();
    });
  });
}
