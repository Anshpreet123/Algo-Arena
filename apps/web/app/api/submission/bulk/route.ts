import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../db";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { message: "You must be logged in to view submissions" },
      { status: 401 },
    );
  }

  const problemId = new URL(req.url).searchParams.get("problemId");
  if (!problemId) {
    return NextResponse.json({ message: "Invalid problem id" }, { status: 400 });
  }

  const submissions = await db.submission.findMany({
    where: { problemId, userId: session.user.id },
    take: 10,
    orderBy: { createdAt: "desc" },
    // The list view only needs verdict counts. Selecting the full testcase
    // rows would ship every stdout and expected output of every submission
    // to the browser just to render "3/4 passed".
    select: {
      id: true,
      status: true,
      language: true,
      time: true,
      memory: true,
      createdAt: true,
      testcases: {
        orderBy: { index: "asc" },
        select: { index: true, status: true },
      },
    },
  });

  return NextResponse.json({ submissions }, { status: 200 });
}
