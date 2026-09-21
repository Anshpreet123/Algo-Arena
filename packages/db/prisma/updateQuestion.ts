import { LANGUAGE_MAPPING } from "@repo/common/language";
import fs from "fs/promises";
import path from "path";
import prismaClient from "../src";

const MOUNT_PATH = process.env.MOUNT_PATH ?? path.join(__dirname, "../../../apps/problems");

type Difficulty = "EASY" | "MEDIUM" | "HARD";

/**
 * Problems are authored as directories on disk. The markdown is the source of
 * truth for the statement; the title and difficulty come from optional
 * front-matter-ish lines so a problem can be added without touching code.
 */
async function readProblemMeta(slug: string) {
  const statement = await fs.readFile(
    path.join(MOUNT_PATH, slug, "Problem.md"),
    "utf-8",
  );

  const headingMatch = statement.match(/^#+\s+(.+)$/m);
  const difficultyMatch = statement.match(/^[ \t]*Difficulty:[ \t]*(EASY|MEDIUM|HARD)[ \t]*$/im);

  return {
    // The Difficulty line is metadata for the seeder, not part of the
    // statement, so it is stripped before the markdown is stored.
    statement: statement
      .replace(/^[ \t]*Difficulty:[ \t]*(EASY|MEDIUM|HARD)[ \t]*$/im, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    title: headingMatch?.[1]?.trim() ?? titleFromSlug(slug),
    difficulty: (difficultyMatch?.[1]?.toUpperCase() ?? "MEDIUM") as Difficulty,
  };
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function upsertProblem(slug: string) {
  const { statement, title, difficulty } = await readProblemMeta(slug);

  const problem = await prismaClient.problem.upsert({
    where: { slug },
    create: { title, slug, description: statement, difficulty, hidden: false },
    update: { title, description: statement, difficulty },
  });

  for (const [language, meta] of Object.entries(LANGUAGE_MAPPING)) {
    const boilerplatePath = path.join(
      MOUNT_PATH,
      slug,
      "boilerplate",
      `function.${meta.extension}`,
    );

    let code: string;
    try {
      code = await fs.readFile(boilerplatePath, "utf-8");
    } catch {
      // A problem that has not been generated for this language yet is fine —
      // it just will not be offered in the editor's language dropdown.
      console.warn(`  no ${language} boilerplate for ${slug}, skipping`);
      continue;
    }

    await prismaClient.defaultCode.upsert({
      where: {
        problemId_languageId: { problemId: problem.id, languageId: meta.internal },
      },
      create: { problemId: problem.id, languageId: meta.internal, code },
      update: { code },
    });
  }

  return { slug, title, difficulty };
}

export async function addProblemsInDB() {
  const entries = await fs.readdir(MOUNT_PATH, { withFileTypes: true });
  const slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  for (const slug of slugs) {
    try {
      const problem = await upsertProblem(slug);
      console.log(`Seeded problem: ${problem.title} (${problem.difficulty})`);
    } catch (err) {
      console.error(`Failed to seed ${slug}:`, (err as Error).message);
    }
  }
}
