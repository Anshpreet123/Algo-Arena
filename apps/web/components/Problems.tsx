import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@repo/ui/card";
import { getProblems } from "../app/db/problem";
import { PrimaryButton } from "./LinkButton";

export async function Problems() {
  const problems = await getProblems();

  return (
    <section className="bg-white dark:bg-gray-900 py-8 md:py-12 min-h-screen">
      <div className="container mx-auto px-4 md:px-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Popular Problems</h2>
          <p className="text-gray-500 dark:text-gray-400">
            Pick a problem, write a solution, and let the judge run it against every testcase.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {problems.map((problem) => (
            <ProblemCard problem={problem} key={problem.id} />
          ))}
        </div>
      </div>
    </section>
  );
}

const DIFFICULTY_STYLES: Record<string, string> = {
  EASY: "text-green-600 dark:text-green-500",
  MEDIUM: "text-amber-600 dark:text-amber-500",
  HARD: "text-red-600 dark:text-red-500",
};

/** One-line summary, taken from the problem statement itself. */
function blurb(description: string): string {
  const firstProse = description
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));

  if (!firstProse) return "No description yet.";
  return firstProse.length > 90 ? `${firstProse.slice(0, 90)}...` : firstProse;
}

function ProblemCard({ problem }: { problem: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{problem.title}</CardTitle>
        <CardDescription>{blurb(problem.description ?? "")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-500 dark:text-gray-400">Difficulty</p>
            <p
              className={`font-medium ${
                DIFFICULTY_STYLES[problem.difficulty] ?? ""
              }`}
            >
              {problem.difficulty}
            </p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">Solved</p>
            <p>{problem.solved}</p>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <PrimaryButton href={`/problem/${problem.id}`}>
          View Problem
        </PrimaryButton>
      </CardFooter>
    </Card>
  );
}
