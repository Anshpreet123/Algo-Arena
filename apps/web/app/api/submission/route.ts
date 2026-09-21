import { NextRequest, NextResponse } from "next/server";
import { SubmissionInput } from "@repo/common/zod";
import { getProblem } from "../../lib/problems";
import { db } from "../../db";
import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { rateLimit } from "../../lib/rateLimit";
import { verifyTurnstile } from "../../lib/turnstile";
import { execute, JudgeUnavailableError, toSubmissionStatus } from "../../lib/judge";
import { awardContestPoints } from "../../lib/contestScoring";

/**
 * Submissions are judged synchronously.
 *
 * The previous design fired testcases at Judge0, stored the returned tokens,
 * and relied on a separate sweeper process polling Judge0's own Postgres
 * tables to fill in the results. With an in-house judge there is nothing to
 * poll: the sandbox returns a final verdict, so the row is written complete.
 * The existing client-side poll still works, it just succeeds immediately.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { message: "You must be logged in to submit a problem" },
      { status: 401 },
    );
  }
  const userId = session.user.id;

  if (!(await rateLimit(userId, 1, 10, "submit"))) {
    return NextResponse.json(
      { message: "Too many requests. Please wait before submitting again." },
      { status: 429 },
    );
  }

  const submissionInput = SubmissionInput.safeParse(await req.json());
  if (!submissionInput.success) {
    return NextResponse.json({ message: "Invalid input" }, { status: 400 });
  }

  const challenge = await verifyTurnstile(submissionInput.data.token);
  if (!challenge.ok) {
    return NextResponse.json({ message: challenge.reason }, { status: 403 });
  }

  const dbProblem = await db.problem.findUnique({
    where: { id: submissionInput.data.problemId },
  });
  if (!dbProblem) {
    return NextResponse.json({ message: "Problem not found" }, { status: 404 });
  }

  let problem;
  try {
    problem = await getProblem(dbProblem.slug, submissionInput.data.languageId);
  } catch (err) {
    console.error("[submission] could not load problem files:", err);
    return NextResponse.json(
      { message: "Problem files are missing or malformed on the server" },
      { status: 500 },
    );
  }

  const sourceCode = problem.fullBoilerplateCode.replace(
    "##USER_CODE_HERE##",
    submissionInput.data.code,
  );

  const submission = await db.submission.create({
    data: {
      userId,
      problemId: dbProblem.id,
      code: submissionInput.data.code,
      language: submissionInput.data.languageId,
      activeContestId: submissionInput.data.activeContestId,
      status: "PENDING",
    },
  });

  try {
    const result = await execute({
      language: submissionInput.data.languageId,
      sourceCode,
      testcases: problem.inputs.map((input, index) => ({
        input,
        expectedOutput: problem.outputs[index] ?? "",
      })),
    });

    const status = toSubmissionStatus(result.verdict);

    await db.$transaction([
      db.submission.update({
        where: { id: submission.id },
        data: {
          status,
          time: result.timeMs,
          memory: result.memoryKb,
          compileOutput: result.compileOutput,
        },
      }),
      db.testcaseResult.createMany({
        data: result.testcases.map((testcase) => ({
          submissionId: submission.id,
          index: testcase.index,
          status: testcase.status,
          timeMs: testcase.timeMs,
          memoryKb: testcase.memoryKb,
          // Inputs and expected outputs are already visible on the problem
          // page, so storing them keeps AI failure analysis self-contained.
          stdout: truncate(testcase.stdout),
          stderr: truncate(testcase.stderr),
          expectedOutput: truncate(testcase.expectedOutput),
          input: truncate(testcase.input),
        })),
      }),
    ]);

    if (status === "AC") {
      await db.problem.update({
        where: { id: dbProblem.id },
        data: { solved: { increment: 1 } },
      });

      if (submissionInput.data.activeContestId) {
        await awardContestPoints({
          id: submission.id,
          userId,
          problemId: dbProblem.id,
          activeContestId: submissionInput.data.activeContestId,
        });
      }
    }

    return NextResponse.json(
      { message: "Submission judged", id: submission.id, verdict: result.verdict },
      { status: 200 },
    );
  } catch (err) {
    console.error("[submission] judging failed:", err);

    await db.submission.update({
      where: { id: submission.id },
      data: {
        status: "REJECTED",
        compileOutput:
          err instanceof JudgeUnavailableError
            ? err.message
            : "The judge service failed while running this submission.",
      },
    });

    return NextResponse.json(
      {
        message:
          err instanceof JudgeUnavailableError ? err.message : "Judging failed",
        id: submission.id,
      },
      { status: 503 },
    );
  }
}

/** Keeps one pathological testcase from bloating the submissions table. */
function truncate(text: string, max = 8000): string {
  return text.length > max ? `${text.slice(0, max)}\n... [truncated]` : text;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { message: "You must be logged in to view submissions" },
      { status: 401 },
    );
  }

  const submissionId = new URL(req.url).searchParams.get("id");
  if (!submissionId) {
    return NextResponse.json({ message: "Invalid submission id" }, { status: 400 });
  }

  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    include: { testcases: { orderBy: { index: "asc" } } },
  });

  if (!submission) {
    return NextResponse.json({ message: "Submission not found" }, { status: 404 });
  }

  // A submission carries its author's source code, so only the author reads it.
  if (submission.userId !== session.user.id) {
    return NextResponse.json({ message: "Not your submission" }, { status: 403 });
  }

  return NextResponse.json({ submission }, { status: 200 });
}
