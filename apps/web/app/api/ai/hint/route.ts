import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import {
  HINT_SYSTEM,
  HINT_TIERS,
  MAX_HINT_TIER,
  hintPrompt,
  penaltyForTier,
  streamCompletion,
} from "@repo/ai";
import { db } from "../../../db";
import { authOptions } from "../../../lib/auth";
import { rateLimit } from "../../../lib/rateLimit";
import {
  cachedTextResponse,
  recordInteraction,
  textStreamResponse,
} from "../../../lib/ai";

const HintInput = z.object({
  problemId: z.string(),
  tier: z.number().int().min(1).max(MAX_HINT_TIER),
  code: z.string().max(50_000),
  language: z.string(),
  contestId: z.string().optional(),
});

/**
 * Tiered hints.
 *
 * A hint is unlocked once and then owned: re-reading it is free and replays
 * the stored text. Unlocking a new tier requires having unlocked the ones
 * below it, so nobody skips straight to pseudocode, and each unlock is
 * recorded so the contest scorer can charge for it.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "You must be logged in" }, { status: 401 });
  }
  const userId = session.user.id;

  const parsed = HintInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid input" }, { status: 400 });
  }
  const { problemId, tier, code, language } = parsed.data;
  const contestId = parsed.data.contestId ?? "";

  const existing = await db.aiHint.findUnique({
    where: {
      userId_problemId_contestId_tier: { userId, problemId, contestId, tier },
    },
  });
  if (existing) {
    return cachedTextResponse(existing.content);
  }

  // Tiers are a staircase, not a menu.
  if (tier > 1) {
    const unlocked = await db.aiHint.count({
      where: { userId, problemId, contestId, tier: { lt: tier } },
    });
    if (unlocked < tier - 1) {
      return NextResponse.json(
        { message: `Unlock hint ${tier - 1} first` },
        { status: 409 },
      );
    }
  }

  if (!(await rateLimit(userId, 1, 15, "hint"))) {
    return NextResponse.json(
      { message: "Slow down — one hint every 15 seconds." },
      { status: 429 },
    );
  }

  const problem = await db.problem.findUnique({ where: { id: problemId } });
  if (!problem) {
    return NextResponse.json({ message: "Problem not found" }, { status: 404 });
  }

  const { stream, result } = streamCompletion({
    feature: "HINT",
    system: HINT_SYSTEM,
    prompt: hintPrompt(
      {
        title: problem.title,
        statement: problem.description,
        difficulty: problem.difficulty,
        language,
        code,
      },
      tier,
    ),
  });

  // Persist once generation finishes. The stream is still open at this point,
  // so the request has not been torn down yet.
  result
    .then(async (aiResult) => {
      if (aiResult.stubbed) return;

      await db.aiHint.create({
        data: {
          userId,
          problemId,
          contestId,
          tier,
          content: aiResult.text,
          penaltyPct: penaltyForTier(tier),
        },
      });
      await recordInteraction({ userId, kind: "HINT", result: aiResult, problemId });
    })
    .catch((err) => console.error("[ai/hint] persistence failed:", err));

  return textStreamResponse(stream);
}

/** Which hints this user has already unlocked, for rendering the panel. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "You must be logged in" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const problemId = params.get("problemId");
  if (!problemId) {
    return NextResponse.json({ message: "problemId is required" }, { status: 400 });
  }

  const hints = await db.aiHint.findMany({
    where: {
      userId: session.user.id,
      problemId,
      contestId: params.get("contestId") ?? "",
    },
    orderBy: { tier: "asc" },
    select: { tier: true, content: true, penaltyPct: true },
  });

  return NextResponse.json({ hints, tiers: HINT_TIERS });
}
