import type { TestcaseStatus } from "@repo/common/judge";
import type { RawRun, RunLimits } from "./types";

/**
 * Competitive-judge output comparison: trailing whitespace on each line and
 * trailing blank lines are insignificant, everything else must match exactly.
 */
export function normalise(output: string): string {
  return output
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

export function outputMatches(actual: string, expected: string): boolean {
  return normalise(actual) === normalise(expected);
}

/**
 * Turns a raw run into a verdict.
 *
 * Exit-code notes: GNU `timeout` reports 124 when it fires, but the process is
 * killed with SIGKILL so we can also see 137. A 137 well inside the time limit
 * is almost always the cgroup OOM killer, so we call that MLE.
 */
export function classify(
  run: RawRun,
  expectedOutput: string,
  limits: RunLimits,
): TestcaseStatus {
  if (run.internalError) return "IE";

  const hitTimeLimit = run.timeMs >= limits.timeMs * 0.95;

  if (run.exitCode === 124) return "TLE";
  if (run.exitCode === 137) return hitTimeLimit ? "TLE" : "MLE";
  if (run.exitCode !== 0) return "RE";

  return outputMatches(run.stdout, expectedOutput) ? "AC" : "WA";
}
