import type { TestcaseStatus } from "@repo/common/judge";

export interface RunLimits {
  timeMs: number;
  memoryMb: number;
}

/** What a driver reports for a single testcase, before comparison. */
export interface RawRun {
  exitCode: number;
  timeMs: number;
  memoryKb: number;
  stdout: string;
  stderr: string;
  /** Set when the driver itself failed rather than the user's program. */
  internalError?: string;
}

export interface DriverResult {
  compileOutput: string | null;
  runs: RawRun[];
}

export interface Driver {
  readonly name: "docker" | "subprocess";
  isAvailable(): Promise<boolean>;
  supportedLanguages(): Promise<string[]>;
  execute(args: {
    languageId: string;
    sourceCode: string;
    inputs: string[];
    limits: RunLimits;
  }): Promise<DriverResult>;
}

export type { TestcaseStatus };
