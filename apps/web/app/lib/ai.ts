import type { AiKind } from "@prisma/client";
import type { AiResult } from "@repo/ai";
import { db } from "../db";

/**
 * Records what an AI call cost. Every feature writes one of these, so
 * "how much are the AI features actually costing" is a SQL query rather
 * than a guess.
 */
export async function recordInteraction(args: {
  userId: string;
  kind: AiKind;
  result: AiResult;
  problemId?: string;
  submissionId?: string;
}): Promise<void> {
  if (args.result.stubbed) return;

  try {
    await db.aiInteraction.create({
      data: {
        userId: args.userId,
        kind: args.kind,
        problemId: args.problemId,
        submissionId: args.submissionId,
        model: args.result.model,
        inputTokens: args.result.usage.inputTokens,
        outputTokens: args.result.usage.outputTokens,
        cacheReadTokens: args.result.usage.cacheReadTokens,
        cacheWriteTokens: args.result.usage.cacheWriteTokens,
        latencyMs: args.result.latencyMs,
      },
    });
  } catch (err) {
    // Accounting must never take down the feature it is measuring.
    console.error("[ai] failed to record interaction:", err);
  }
}

/** Streams markdown back to the browser as plain text. */
export function textStreamResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      // Stops nginx and friends from buffering the whole answer.
      "x-accel-buffering": "no",
    },
  });
}

/** Replays already-generated markdown without calling the model again. */
export function cachedTextResponse(text: string): Response {
  return new Response(text, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-arena-cached": "1",
    },
  });
}
