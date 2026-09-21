import {
  type ExecuteResponse,
  type TestcaseStatus,
} from "@repo/common/judge";

const JUDGE_URL = process.env.JUDGE_URL ?? "http://localhost:4000";
const JUDGE_TOKEN = process.env.JUDGE_TOKEN ?? "";

export class JudgeUnavailableError extends Error {}

/**
 * Calls the sandbox service. This replaces the Judge0 batch submit + polling
 * dance: execution is synchronous, so a submission is already final by the
 * time this returns.
 */
export async function execute(args: {
  language: string;
  sourceCode: string;
  testcases: { input: string; expectedOutput: string }[];
}): Promise<ExecuteResponse> {
  // Generous: a cold container plus a compile plus every testcase.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(`${JUDGE_URL}/execute`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(JUDGE_TOKEN ? { "x-judge-token": JUDGE_TOKEN } : {}),
      },
      body: JSON.stringify(args),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      throw new JudgeUnavailableError(
        `Judge returned ${response.status}: ${body.slice(0, 300)}`,
      );
    }

    return (await response.json()) as ExecuteResponse;
  } catch (err) {
    if (err instanceof JudgeUnavailableError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new JudgeUnavailableError("Judge timed out after 120s");
    }
    throw new JudgeUnavailableError(
      `Cannot reach the judge service at ${JUDGE_URL}. Is it running? (pnpm dev starts it)`,
    );
  }
}

export async function judgeHealth(): Promise<{
  ok: boolean;
  driver?: string;
  languages?: string[];
}> {
  try {
    const response = await fetch(`${JUDGE_URL}/health`, { cache: "no-store" });
    if (!response.ok) return { ok: false };
    return await response.json();
  } catch {
    return { ok: false };
  }
}

/** Maps a judge verdict onto the coarser status stored on Submission. */
export function toSubmissionStatus(
  verdict: TestcaseStatus,
): "AC" | "REJECTED" {
  return verdict === "AC" ? "AC" : "REJECTED";
}
