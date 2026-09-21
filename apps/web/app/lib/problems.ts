import fs from "fs/promises";
import path from "path";
import { LANGUAGE_MAPPING } from "@repo/common/language";

export type SupportedLanguage = keyof typeof LANGUAGE_MAPPING;

export interface LoadedProblem {
  slug: string;
  /** Boilerplate with the ##USER_CODE_HERE## marker still in place. */
  fullBoilerplateCode: string;
  inputs: string[];
  outputs: string[];
}

const MOUNT_PATH =
  process.env.MOUNT_PATH ?? path.join(process.cwd(), "../../apps/problems");

export const getProblem = async (
  slug: string,
  languageId: SupportedLanguage,
): Promise<LoadedProblem> => {
  const extension = LANGUAGE_MAPPING[languageId]?.extension;
  if (!extension) throw new Error(`Unsupported language: ${languageId}`);

  const [fullBoilerplateCode, inputs, outputs] = await Promise.all([
    fs.readFile(
      path.join(MOUNT_PATH, slug, "boilerplate-full", `function.${extension}`),
      "utf-8",
    ),
    readTestcaseDir(path.join(MOUNT_PATH, slug, "tests", "inputs")),
    readTestcaseDir(path.join(MOUNT_PATH, slug, "tests", "outputs")),
  ]);

  if (inputs.length !== outputs.length) {
    throw new Error(
      `Problem "${slug}" has ${inputs.length} inputs but ${outputs.length} outputs`,
    );
  }
  if (inputs.length === 0) {
    throw new Error(`Problem "${slug}" has no testcases`);
  }

  return { slug, fullBoilerplateCode, inputs, outputs };
};

/**
 * Testcases are named 0.txt, 1.txt, ... — they must be read back in numeric
 * order. Plain readdir order is lexicographic, which silently pairs input
 * 10.txt with output 2.txt once a problem grows past nine testcases.
 */
async function readTestcaseDir(dir: string): Promise<string[]> {
  const files = await fs.readdir(dir);

  const ordered = files
    .filter((file) => file.endsWith(".txt"))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

  return Promise.all(
    ordered.map((file) => fs.readFile(path.join(dir, file), "utf-8")),
  );
}
