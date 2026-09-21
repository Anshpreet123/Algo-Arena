/**
 * Every AI feature in Algo Arena runs through this config so the model choice
 * and effort level are in one place instead of scattered across routes.
 */

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

export type AiFeature = "HINT" | "REVIEW" | "EXPLAIN";

/**
 * Effort trades thoroughness against tokens within the same model.
 * A hint is two sentences and wants to feel instant; a post-accept review is
 * the one place where being thorough is the whole point.
 */
export const EFFORT: Record<AiFeature, "low" | "medium" | "high"> = {
  HINT: "low",
  EXPLAIN: "medium",
  REVIEW: "high",
};

export const MAX_TOKENS: Record<AiFeature, number> = {
  HINT: 1024,
  EXPLAIN: 2048,
  REVIEW: 4096,
};

/** Hints are progressively more revealing, and progressively more expensive. */
export const HINT_TIERS = [
  { tier: 1, label: "Nudge", penaltyPct: 10 },
  { tier: 2, label: "Approach", penaltyPct: 20 },
  { tier: 3, label: "Pseudocode", penaltyPct: 30 },
] as const;

export const MAX_HINT_TIER = HINT_TIERS.length;

export function penaltyForTier(tier: number): number {
  return HINT_TIERS.find((h) => h.tier === tier)?.penaltyPct ?? 0;
}

/**
 * Total fraction of a problem's contest points forfeited by the hints taken.
 * Capped so a hint-heavy solve is still worth attempting.
 */
export function cumulativePenaltyPct(tiers: number[]): number {
  const total = tiers.reduce((sum, tier) => sum + penaltyForTier(tier), 0);
  return Math.min(total, 60);
}

export function isConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
