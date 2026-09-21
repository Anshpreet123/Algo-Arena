import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";

/**
 * Every submission gets a throwaway directory holding the source, one file per
 * testcase input, and (after the run) the captured stdout/stderr/meta files.
 * The container driver bind-mounts this directory as /box.
 */
export interface Workspace {
  dir: string;
  cleanup(): Promise<void>;
}

export async function createWorkspace(
  sourceFile: string,
  sourceCode: string,
  inputs: string[],
): Promise<Workspace> {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), `arena-${crypto.randomBytes(6).toString("hex")}-`),
  );

  await fs.writeFile(path.join(dir, sourceFile), sourceCode, "utf-8");
  await Promise.all(
    inputs.map((input, i) =>
      fs.writeFile(path.join(dir, `input_${i}.txt`), input, "utf-8"),
    ),
  );

  return {
    dir,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

/** Reads a file the sandbox may or may not have produced. */
export async function readIfPresent(
  dir: string,
  name: string,
  maxBytes = 64 * 1024,
): Promise<string> {
  try {
    const buf = await fs.readFile(path.join(dir, name));
    if (buf.byteLength > maxBytes) {
      return `${buf.subarray(0, maxBytes).toString("utf-8")}\n... [truncated]`;
    }
    return buf.toString("utf-8");
  } catch {
    return "";
  }
}
