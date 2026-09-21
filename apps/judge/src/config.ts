function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: int("JUDGE_PORT", 4000),
  /** How many sandboxes may run at once. Each one gets a full CPU. */
  maxConcurrency: int("JUDGE_CONCURRENCY", 4),
  defaultTimeMs: int("JUDGE_TIME_LIMIT_MS", 5000),
  defaultMemoryMb: int("JUDGE_MEMORY_LIMIT_MB", 256),
  /** Shared secret the web app sends as x-judge-token. Empty disables the check. */
  token: process.env.JUDGE_TOKEN ?? "",
  /**
   * The subprocess driver has no sandbox, so it is opt-in and refuses to
   * engage in production unless the operator insists.
   */
  allowSubprocess:
    process.env.JUDGE_ALLOW_SUBPROCESS === "true" ||
    process.env.NODE_ENV !== "production",
};
