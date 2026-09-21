import { exec, spawn } from "child_process";
import { promisify } from "util";
import { LANGUAGES, getLanguage } from "../languages";
import { createWorkspace } from "./workspace";
import type { Driver, DriverResult, RawRun, RunLimits } from "./types";

const execAsync = promisify(exec);

/**
 * Fallback for machines without Docker. It runs submitted code as a plain
 * child process, so there is NO sandbox: no memory cap, no filesystem
 * isolation, no network isolation. It exists so the app is still usable for
 * local development and demos, and the service refuses to use it in
 * production unless explicitly allowed.
 */
export class SubprocessDriver implements Driver {
  readonly name = "subprocess" as const;

  private probed: Promise<string[]> | null = null;

  async isAvailable(): Promise<boolean> {
    return (await this.supportedLanguages()).length > 0;
  }

  supportedLanguages(): Promise<string[]> {
    if (!this.probed) {
      this.probed = Promise.all(
        Object.values(LANGUAGES).map(async (lang) => {
          if (!lang.local) return null;
          return (await onPath(lang.local.probe)) ? lang.id : null;
        }),
      ).then((ids) => ids.filter((id): id is string => id !== null));
    }
    return this.probed;
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
    if (!lang?.local) {
      throw new Error(`Language ${languageId} cannot run without Docker`);
    }

    const ws = await createWorkspace(lang.sourceFile, sourceCode, inputs);
    try {
      if (lang.local.compile) {
        try {
          await execAsync(lang.local.compile, { cwd: ws.dir, timeout: 30_000 });
        } catch (err) {
          const e = err as { stderr?: string; stdout?: string; message: string };
          return {
            compileOutput: e.stderr || e.stdout || e.message,
            runs: [],
          };
        }
      }

      const runs: RawRun[] = [];
      for (let i = 0; i < inputs.length; i++) {
        runs.push(await runOnce(lang.local.run, ws.dir, inputs[i] ?? "", limits));
      }
      return { compileOutput: null, runs };
    } finally {
      await ws.cleanup();
    }
  }
}

function runOnce(
  command: string,
  cwd: string,
  input: string,
  limits: RunLimits,
): Promise<RawRun> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    child.stdout.on("data", (c) => {
      stdout = (stdout + c.toString()).slice(0, 64 * 1024);
    });
    child.stderr.on("data", (c) => {
      stderr = (stderr + c.toString()).slice(0, 64 * 1024);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, limits.timeMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        timeMs: Date.now() - startedAt,
        memoryKb: 0,
        stdout,
        stderr,
        internalError: err.message,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        // 124 is what GNU timeout would have reported, so the shared
        // classifier treats both drivers the same way.
        exitCode: timedOut ? 124 : (code ?? 1),
        timeMs: Date.now() - startedAt,
        // Not measurable without a cgroup, so MLE is simply never reported here.
        memoryKb: 0,
        stdout,
        stderr,
      });
    });

    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

async function onPath(binary: string): Promise<boolean> {
  const probe = process.platform === "win32" ? `where ${binary}` : `command -v ${binary}`;
  try {
    await execAsync(probe, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
