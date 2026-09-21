import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import {
  EXPLAIN_SYSTEM,
  REVIEW_SYSTEM,
  explainPrompt,
  reviewPrompt,
  streamCompletion,
  type ProblemContext,
} from "@repo/ai";
import { db } from "../../../db";
import { authOptions } from "../../../lib/auth";
import { rateLimit } from "../../../lib/rateLimit";
import {
  cachedTextResponse,
  recordInteraction,
  textStreamResponse,
} from "../../../lib/ai";

const AnalyzeInput = z.object({
  submissionId: z.string(),
});

/**
 * Post-submission analysis.
 *
 * The kind is derived from the verdict rather than asked for: an accepted
 * submission gets a code review, a failing one gets a failure explanation.
 * Both are cached per submission, because the submission is immutable — the
 * same code can never warrant a different review.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "You must be logged in" }, { status: 401 });
  }
  const userId = session.user.id;

  const parsed = AnalyzeInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid input" }, { status: 400 });
  }

  const submission = await db.submission.findUnique({
    where: { id: parsed.data.submissionId },
    include: {
      problem: true,
      testcases: { orderBy: { index: "asc" } },
    },
  });

  if (!submission) {
    return NextResponse.json({ message: "Submission not found" }, { status: 404 });
  }
  if (submission.userId !== userId) {
    return NextResponse.json({ message: "Not your submission" }, { status: 403 });
  }
  if (submission.status === "PENDING") {
    return NextResponse.json(
      { message: "This submission is still being judged" },
      { status: 409 },
    );
  }

  const kind = submission.status === "AC" ? "REVIEW" : "EXPLAIN";

  const cached = await db.aiAnalysis.findUnique({
    where: { submissionId_kind: { submissionId: submission.id, kind } },
  });
  if (cached) {
    return cachedTextResponse(cached.content);
  }

  if (!(await rateLimit(userId, 3, 60, "analyze"))) {
    return NextResponse.json(
      { message: "Slow down — three analyses per minute." },
      { status: 429 },
    );
  }

  const context: ProblemContext = {
    title: submission.problem.title,
    statement: submission.problem.description,
    difficulty: submission.problem.difficulty,
    language: submission.language,
    code: submission.code,
  };

  const { stream, result } =
    kind === "REVIEW"
      ? streamCompletion({
          feature: "REVIEW",
          system: REVIEW_SYSTEM,
          prompt: reviewPrompt(context, {
            timeMs: submission.time ?? 0,
            memoryKb: submission.memory ?? 0,
            testcases: submission.testcases.length,
          }),
        })
      : streamCompletion({
          feature: "EXPLAIN",
          system: EXPLAIN_SYSTEM,
          prompt: buildExplainPrompt(context, submission),
        });

  result
    .then(async (aiResult) => {
      if (aiResult.stubbed) return;

      // upsert, not create: two tabs hitting this at once should not 500.
      await db.aiAnalysis.upsert({
        where: { submissionId_kind: { submissionId: submission.id, kind } },
        create: {
          submissionId: submission.id,
          kind,
          content: aiResult.text,
          model: aiResult.model,
        },
        update: { content: aiResult.text, model: aiResult.model },
      });
      await recordInteraction({
        userId,
        kind,
        result: aiResult,
        problemId: submission.problemId,
        submissionId: submission.id,
      });
    })
    .catch((err) => console.error("[ai/analyze] persistence failed:", err));

  return textStreamResponse(stream);
}

type SubmissionWithTests = {
  compileOutput: string | null;
  testcases: {
    index: number;
    status: string;
    input: string;
    expectedOutput: string;
    stdout: string;
    stderr: string;
    timeMs: number;
  }[];
};

/**
 * Explanations are built around the FIRST failing testcase. Handing the model
 * every failure at once produces a vague summary; one concrete failing case
 * produces a trace the solver can actually follow.
 */
function buildExplainPrompt(
  context: ProblemContext,
  submission: SubmissionWithTests,
): string {
  const failing =
    submission.testcases.find((t) => t.status !== "AC") ?? submission.testcases[0];

  return explainPrompt(context, {
    status: (failing?.status ?? "IE") as never,
    input: failing?.input ?? "",
    expectedOutput: failing?.expectedOutput ?? "",
    actualOutput: failing?.stdout ?? "",
    stderr: failing?.stderr ?? "",
    compileOutput: submission.compileOutput,
    timeMs: failing?.timeMs ?? 0,
    limitMs: Number(process.env.JUDGE_TIME_LIMIT_MS ?? 5000),
  });
}

/** Returns a cached analysis if one exists, so the UI can render it on load. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "You must be logged in" }, { status: 401 });
  }

  const submissionId = new URL(req.url).searchParams.get("submissionId");
  if (!submissionId) {
    return NextResponse.json({ message: "submissionId is required" }, { status: 400 });
  }

  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: { userId: true, status: true, aiAnalyses: true },
  });

  if (!submission || submission.userId !== session.user.id) {
    return NextResponse.json({ message: "Submission not found" }, { status: 404 });
  }

  const kind = submission.status === "AC" ? "REVIEW" : "EXPLAIN";
  const analysis = submission.aiAnalyses.find((a) => a.kind === kind);

  return NextResponse.json({
    kind,
    content: analysis?.content ?? null,
  });
}
