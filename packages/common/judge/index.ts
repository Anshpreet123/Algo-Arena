import { z } from "zod";

/**
 * The wire contract between the web app and the judge service.
 * This replaces the Judge0 REST shape the project used to depend on.
 */

export const TESTCASE_STATUSES = [
  "AC", // accepted
  "WA", // wrong answer
  "TLE", // time limit exceeded
  "MLE", // memory limit exceeded
  "RE", // runtime error
  "CE", // compile error
  "IE", // internal error (our fault, not the user's)
] as const;

export type TestcaseStatus = (typeof TESTCASE_STATUSES)[number];

export const ExecuteRequest = z.object({
  language: z.string(),
  sourceCode: z.string(),
  testcases: z
    .array(
      z.object({
        input: z.string(),
        expectedOutput: z.string(),
      }),
    )
    .min(1)
    .max(100),
  limits: z
    .object({
      timeMs: z.number().int().min(100).max(15_000).optional(),
      memoryMb: z.number().int().min(32).max(1024).optional(),
    })
    .optional(),
});

export type ExecuteRequest = z.infer<typeof ExecuteRequest>;

export interface TestcaseResult {
  index: number;
  status: TestcaseStatus;
  timeMs: number;
  memoryKb: number;
  stdout: string;
  stderr: string;
  expectedOutput: string;
  input: string;
}

export interface ExecuteResponse {
  /** Worst status across all testcases — AC only if every testcase passed. */
  verdict: TestcaseStatus;
  compileOutput: string | null;
  /** Slowest testcase, in milliseconds. */
  timeMs: number;
  /** Peak memory observed, in kilobytes. */
  memoryKb: number;
  /** Which execution driver produced this result. */
  driver: "docker" | "subprocess";
  testcases: TestcaseResult[];
}

/**
 * A run is accepted only when every testcase is. Otherwise the first
 * non-AC status wins, so the UI can say "failed on testcase 3 with TLE".
 */
export function summarise(results: TestcaseResult[]): TestcaseStatus {
  const failed = results.find((r) => r.status !== "AC");
  return failed ? failed.status : "AC";
}

export const STATUS_LABELS: Record<TestcaseStatus, string> = {
  AC: "Accepted",
  WA: "Wrong Answer",
  TLE: "Time Limit Exceeded",
  MLE: "Memory Limit Exceeded",
  RE: "Runtime Error",
  CE: "Compilation Error",
  IE: "Internal Error",
};
