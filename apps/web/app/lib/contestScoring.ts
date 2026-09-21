import { cumulativePenaltyPct } from "@repo/ai";
import { db } from "../db";

const POINT_MAPPING: Record<string, number> = {
  EASY: 250,
  MEDIUM: 500,
  HARD: 1000,
};

/**
 * Contest points decay linearly over the contest window: solving at the bell
 * is worth half of solving at the gun.
 *
 * On top of that, every AI hint the solver unlocked for this problem forfeits
 * a slice of the award. That is the whole point of the hint tiers — they are
 * free to read and expensive to use.
 */
export async function awardContestPoints(submission: {
  id: string;
  userId: string;
  problemId: string;
  activeContestId: string;
}): Promise<number> {
  const [contest, problem, hints] = await Promise.all([
    db.contest.findUnique({ where: { id: submission.activeContestId } }),
    db.problem.findUnique({ where: { id: submission.problemId } }),
    db.aiHint.findMany({
      where: {
        userId: submission.userId,
        problemId: submission.problemId,
        contestId: submission.activeContestId,
      },
      select: { tier: true },
    }),
  ]);

  if (!contest || !problem) return 0;

  const base = POINT_MAPPING[problem.difficulty] ?? 0;
  if (base === 0) return 0;

  const start = contest.startTime.getTime();
  const end = contest.endTime.getTime();
  const now = Date.now();
  const window = Math.abs(end - start) || 1;

  // Half the points are guaranteed; the other half decays with elapsed time.
  const remaining = Math.max(0, Math.min(1, (end - now) / window));
  const timeAdjusted = base / 2 + (base / 2) * remaining;

  const penaltyPct = cumulativePenaltyPct(hints.map((h) => h.tier));
  const points = Math.round(timeAdjusted * (1 - penaltyPct / 100));

  const key = {
    contestId: submission.activeContestId,
    userId: submission.userId,
    problemId: submission.problemId,
  };

  const existing = await db.contestSubmission.findUnique({
    where: { userId_problemId_contestId: key },
    select: { points: true },
  });

  // Re-solving the same problem must never lower an already-earned score,
  // which a plain upsert would do since points decay over the contest.
  const best = Math.max(points, existing?.points ?? 0);

  await db.contestSubmission.upsert({
    where: { userId_problemId_contestId: key },
    create: { ...key, submissionId: submission.id, points: best },
    update: { points: best },
  });

  return best;
}
