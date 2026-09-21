import { db } from ".";

export const getProblem = async (problemId: string, contestId?: string) => {
  if (contestId) {
    const contest = await db.contest.findFirst({
      where: {
        id: contestId,
        hidden: false,
      },
    });

    if (!contest) {
      return null;
    }

    const problem = await db.problem.findFirst({
      where: {
        id: problemId,
        contests: {
          some: {
            contestId: contestId,
          },
        },
      },
      include: {
        defaultCode: true,
      },
    });
    return problem;
  }

  const problem = await db.problem.findFirst({
    where: {
      id: problemId,
    },
    include: {
      defaultCode: true,
    },
  });
  return problem;
};

export const getProblems = async () => {
  // The listing renders a title, a blurb, a difficulty and a solve count.
  // It used to `include: { defaultCode: true }`, which pulled the full
  // boilerplate for all four languages of every problem into a page that
  // never shows a single line of it.
  return db.problem.findMany({
    where: { hidden: false },
    orderBy: [{ difficulty: "asc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      description: true,
      difficulty: true,
      solved: true,
    },
  });
};
