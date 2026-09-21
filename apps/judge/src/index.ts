import express from "express";
import cors from "cors";
import {
  ExecuteRequest,
  summarise,
  type ExecuteResponse,
  type TestcaseResult,
} from "@repo/common/judge";
import { config } from "./config";
import { Semaphore } from "./queue";
import { DockerDriver } from "./runner/dockerDriver";
import { SubprocessDriver } from "./runner/subprocessDriver";
import { classify } from "./runner/verdict";
import type { Driver, RunLimits } from "./runner/types";

const docker = new DockerDriver();
const subprocess = new SubprocessDriver();
const queue = new Semaphore(config.maxConcurrency);

/**
 * Docker is always preferred. The subprocess driver is only reached when
 * Docker is genuinely unavailable, and only for languages whose toolchain is
 * installed on the host.
 */
async function pickDriver(languageId: string): Promise<Driver> {
  if (await docker.isAvailable()) return docker;

  if (!config.allowSubprocess) {
    throw new HttpError(
      503,
      "Docker is unavailable and the unsandboxed fallback is disabled.",
    );
  }
  if (!(await subprocess.supportedLanguages()).includes(languageId)) {
    throw new HttpError(
      503,
      `Docker is unavailable and no local toolchain was found for "${languageId}".`,
    );
  }
  return subprocess;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const app = express();
app.use(cors());
// Stress testcases are legitimately large — max-element ships a 1.4MB input —
// so the body limit has to cover the whole testcase batch, not just the source.
app.use(express.json({ limit: process.env.JUDGE_BODY_LIMIT ?? "32mb" }));

app.get("/health", async (_req, res) => {
  const dockerUp = await docker.isAvailable();
  res.json({
    ok: true,
    driver: dockerUp ? "docker" : config.allowSubprocess ? "subprocess" : "none",
    dockerAvailable: dockerUp,
    languages: dockerUp
      ? await docker.supportedLanguages()
      : await subprocess.supportedLanguages(),
    queue: { inFlight: queue.inFlight, pending: queue.pending },
  });
});

app.post("/execute", async (req, res) => {
  if (config.token && req.header("x-judge-token") !== config.token) {
    res.status(401).json({ message: "Bad judge token" });
    return;
  }

  const parsed = ExecuteRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request", issues: parsed.error.issues });
    return;
  }

  const { language, sourceCode, testcases } = parsed.data;
  const limits: RunLimits = {
    timeMs: parsed.data.limits?.timeMs ?? config.defaultTimeMs,
    memoryMb: parsed.data.limits?.memoryMb ?? config.defaultMemoryMb,
  };

  try {
    const driver = await pickDriver(language);
    const result = await queue.run(() =>
      driver.execute({
        languageId: language,
        sourceCode,
        inputs: testcases.map((t) => t.input),
        limits,
      }),
    );

    // A compile error is one verdict for the whole submission, not per testcase.
    if (result.compileOutput !== null) {
      const response: ExecuteResponse = {
        verdict: "CE",
        compileOutput: result.compileOutput,
        timeMs: 0,
        memoryKb: 0,
        driver: driver.name,
        testcases: testcases.map((t, index) => ({
          index,
          status: "CE",
          timeMs: 0,
          memoryKb: 0,
          stdout: "",
          stderr: "",
          expectedOutput: t.expectedOutput,
          input: t.input,
        })),
      };
      res.json(response);
      return;
    }

    const results: TestcaseResult[] = result.runs.map((run, index) => ({
      index,
      status: classify(run, testcases[index]?.expectedOutput ?? "", limits),
      timeMs: run.timeMs,
      memoryKb: run.memoryKb,
      stdout: run.stdout,
      stderr: run.stderr,
      expectedOutput: testcases[index]?.expectedOutput ?? "",
      input: testcases[index]?.input ?? "",
    }));

    const response: ExecuteResponse = {
      verdict: summarise(results),
      compileOutput: null,
      timeMs: results.reduce((max, r) => Math.max(max, r.timeMs), 0),
      memoryKb: results.reduce((max, r) => Math.max(max, r.memoryKb), 0),
      driver: driver.name,
      testcases: results,
    };
    res.json(response);
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    console.error("[judge] execution failed:", err);
    res.status(500).json({
      message: err instanceof Error ? err.message : "Execution failed",
    });
  }
});

app.listen(config.port, async () => {
  const dockerUp = await docker.isAvailable();
  console.log(`[judge] listening on :${config.port}`);
  console.log(
    dockerUp
      ? `[judge] driver=docker  languages=${(await docker.supportedLanguages()).join(", ")}`
      : `[judge] driver=subprocess (UNSANDBOXED)  languages=${(
          await subprocess.supportedLanguages()
        ).join(", ") || "none"}`,
  );
  if (!config.token) {
    console.warn("[judge] JUDGE_TOKEN is unset — the execute endpoint is open");
  }
});
