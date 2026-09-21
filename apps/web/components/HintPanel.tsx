"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@repo/ui/button";
import { Lightbulb, Lock, AlertTriangle } from "lucide-react";
import { useAiStream } from "../hooks/useAiStream";
import { AiMarkdown } from "./AiMarkdown";

interface HintTier {
  tier: number;
  label: string;
  penaltyPct: number;
}

interface UnlockedHint {
  tier: number;
  content: string;
  penaltyPct: number;
}

const FALLBACK_TIERS: HintTier[] = [
  { tier: 1, label: "Nudge", penaltyPct: 10 },
  { tier: 2, label: "Approach", penaltyPct: 20 },
  { tier: 3, label: "Pseudocode", penaltyPct: 30 },
];

/**
 * Tiered hints.
 *
 * Each tier reveals more and costs more. Tiers unlock in order, and the
 * running penalty is shown up front so taking a hint is a deliberate trade
 * rather than a free click.
 */
export function HintPanel({
  problemId,
  language,
  code,
  contestId,
}: {
  problemId: string;
  language: string;
  code: string;
  contestId?: string;
}) {
  const [tiers, setTiers] = useState<HintTier[]>(FALLBACK_TIERS);
  const [unlocked, setUnlocked] = useState<UnlockedHint[]>([]);
  const [activeTier, setActiveTier] = useState<number | null>(null);
  const stream = useAiStream();

  const query = new URLSearchParams({ problemId });
  if (contestId) query.set("contestId", contestId);
  const listUrl = `/api/ai/hint?${query.toString()}`;

  useEffect(() => {
    let cancelled = false;

    fetch(listUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setUnlocked(data.hints ?? []);
        if (Array.isArray(data.tiers) && data.tiers.length > 0) {
          setTiers(data.tiers);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [listUrl]);

  const nextLockedTier = unlocked.length + 1;
  const totalPenalty = Math.min(
    unlocked.reduce((sum, hint) => sum + hint.penaltyPct, 0),
    60,
  );

  const openTier = useCallback(
    async (tier: number) => {
      setActiveTier(tier);

      const already = unlocked.find((h) => h.tier === tier);
      if (already) {
        // Owned hints replay from state; no request, no charge.
        stream.setText(already.content);
        return;
      }

      await stream.run("/api/ai/hint", {
        problemId,
        tier,
        code,
        language,
        contestId,
      });

      // Refresh so the tier shows as owned and the penalty total updates.
      fetch(listUrl)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setUnlocked(data.hints ?? []))
        .catch(() => {});
    },
    [unlocked, stream, problemId, code, language, contestId, listUrl],
  );

  return (
    <div className="border rounded-lg p-4 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          <h3 className="font-semibold">AI Hints</h3>
        </div>
        {totalPenalty > 0 && (
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            -{totalPenalty}% contest points
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-1">
        Each hint reveals more and costs contest points. They never give you the
        full solution.
      </p>

      <div className="flex gap-2 mt-3 flex-wrap">
        {tiers.map((tier) => {
          const isUnlocked = unlocked.some((h) => h.tier === tier.tier);
          const isAvailable = isUnlocked || tier.tier === nextLockedTier;

          return (
            <Button
              key={tier.tier}
              size="sm"
              variant={activeTier === tier.tier ? "default" : "outline"}
              disabled={!isAvailable || stream.isStreaming}
              onClick={() => openTier(tier.tier)}
              title={
                isAvailable
                  ? undefined
                  : `Unlock hint ${tier.tier - 1} first`
              }
            >
              {!isAvailable && <Lock className="h-3 w-3 mr-1" />}
              {tier.tier}. {tier.label}
              <span className="ml-1.5 opacity-60 text-xs">
                {isUnlocked ? "owned" : `-${tier.penaltyPct}%`}
              </span>
            </Button>
          );
        })}
      </div>

      {stream.error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          {stream.error}
        </p>
      )}

      {(stream.text || stream.isStreaming) && (
        <div className="mt-3 p-3 rounded-md bg-white dark:bg-gray-900 border">
          <AiMarkdown content={stream.text} isStreaming={stream.isStreaming} />
        </div>
      )}
    </div>
  );
}
