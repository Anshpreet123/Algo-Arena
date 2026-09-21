"use client";

import { useEffect, useState } from "react";
import { Button } from "@repo/ui/button";
import { Sparkles, Stethoscope } from "lucide-react";
import { useAiStream } from "../hooks/useAiStream";
import { AiMarkdown } from "./AiMarkdown";

/**
 * Post-submission AI analysis.
 *
 * Which analysis you get is decided by the verdict, not by the user: an
 * accepted submission earns a code review, a failing one earns an
 * explanation of the failure. One button, two meanings.
 */
export function SubmissionAnalysis({
  submissionId,
  accepted,
}: {
  submissionId: string;
  accepted: boolean;
}) {
  const stream = useAiStream();
  const [checkedCache, setCheckedCache] = useState(false);

  // If this submission was analysed before, show it without spending tokens.
  useEffect(() => {
    let cancelled = false;
    stream.reset();
    setCheckedCache(false);

    fetch(`/api/ai/analyze?submissionId=${submissionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.content) stream.setText(data.content);
        setCheckedCache(true);
      })
      .catch(() => !cancelled && setCheckedCache(true));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  const label = accepted ? "Review my solution" : "Explain why it failed";
  const Icon = accepted ? Sparkles : Stethoscope;

  const accent = accepted
    ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900"
    : "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900";

  return (
    <div className={`border rounded-lg p-4 mt-4 ${accent}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Icon
            className={`h-5 w-5 ${accepted ? "text-emerald-500" : "text-rose-500"}`}
          />
          <h3 className="font-semibold">
            {accepted ? "AI Code Review" : "AI Failure Analysis"}
          </h3>
        </div>

        {!stream.text && (
          <Button
            size="sm"
            disabled={stream.isStreaming || !checkedCache}
            onClick={() => stream.run("/api/ai/analyze", { submissionId })}
          >
            {stream.isStreaming ? "Analysing..." : label}
          </Button>
        )}
      </div>

      {!stream.text && !stream.isStreaming && (
        <p className="text-xs text-muted-foreground mt-1">
          {accepted
            ? "Complexity, edge cases the tests missed, and idiomatic rewrites."
            : "Explains the bug from the failing testcase — without handing you the fix."}
        </p>
      )}

      {stream.error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          {stream.error}
        </p>
      )}

      {(stream.text || stream.isStreaming) && (
        <div className="mt-3 p-3 rounded-md bg-white dark:bg-gray-900 border">
          <AiMarkdown content={stream.text} isStreaming={stream.isStreaming} />
          {stream.fromCache && !stream.isStreaming && (
            <p className="text-[11px] text-muted-foreground mt-3 pt-2 border-t">
              Cached from the first time this submission was analysed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
