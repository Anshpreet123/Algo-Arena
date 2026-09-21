import { spawn } from "child_process";
import { LANGUAGES } from "./languages";
import { DockerDriver } from "./runner/dockerDriver";
import { SubprocessDriver } from "./runner/subprocessDriver";
import { classify } from "./runner/verdict";

/**
 * `pnpm --filter judge doctor` — pulls the sandbox images and runs a
 * hello-world through every language so you find out the toolchain is broken
 * here, not on someone's first submission.
 */

const SAMPLES: Record<string, string> = {
  js: [
    'const input = require("fs").readFileSync(0, "utf-8");',
    "console.log(Number(input.trim()) * 2);",
  ].join("\n"),
  cpp: `#include <iostream>
int main() { long long n; std::cin >> n; std::cout << n * 2 << std::endl; }`,
  java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    System.out.println(sc.nextLong() * 2);
  }
}`,
  rs: `use std::io::Read;
fn main() {
  let mut s = String::new();
  std::io::stdin().read_to_string(&mut s).unwrap();
  let n: i64 = s.trim().parse().unwrap();
  println!("{}", n * 2);
}`,
};

function pull(image: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("docker", ["pull", image], { stdio: "inherit", windowsHide: true });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function main() {
  const docker = new DockerDriver();
  const subprocess = new SubprocessDriver();
  const dockerUp = await docker.isAvailable();

  console.log(`Docker available: ${dockerUp ? "yes" : "no"}`);
  if (!dockerUp) {
    const local = await subprocess.supportedLanguages();
    console.log(`Local toolchains found: ${local.join(", ") || "none"}`);
    console.log("\nStart Docker Desktop for the full sandboxed language set.");
  }

  const driver = dockerUp ? docker : subprocess;
  const limits = { timeMs: 10_000, memoryMb: 256 };
  const available = await driver.supportedLanguages();
  let failures = 0;

  for (const id of Object.keys(LANGUAGES)) {
    const lang = LANGUAGES[id]!;
    if (!available.includes(id)) {
      console.log(`- ${lang.name.padEnd(11)} skipped (no runtime here)`);
      continue;
    }

    if (dockerUp) {
      process.stdout.write(`\nPulling ${lang.image} for ${lang.name}...\n`);
      if (!(await pull(lang.image))) {
        console.log(`x ${lang.name.padEnd(11)} image pull failed`);
        failures++;
        continue;
      }
    }

    const startedAt = Date.now();
    try {
      const result = await driver.execute({
        languageId: id,
        sourceCode: SAMPLES[id]!,
        inputs: ["21\n"],
        limits,
      });

      if (result.compileOutput !== null) {
        console.log(`x ${lang.name.padEnd(11)} compile error\n${result.compileOutput}`);
        failures++;
        continue;
      }

      const status = classify(result.runs[0]!, "42", limits);
      const elapsed = Date.now() - startedAt;
      if (status === "AC") {
        console.log(
          `+ ${lang.name.padEnd(11)} ${status}  ${result.runs[0]!.timeMs}ms run, ` +
            `${result.runs[0]!.memoryKb}KB peak, ${elapsed}ms wall`,
        );
      } else {
        console.log(
          `x ${lang.name.padEnd(11)} ${status}  stdout=${JSON.stringify(
            result.runs[0]!.stdout,
          )} stderr=${JSON.stringify(result.runs[0]!.stderr.slice(0, 200))}`,
        );
        failures++;
      }
    } catch (err) {
      console.log(`x ${lang.name.padEnd(11)} ${(err as Error).message}`);
      failures++;
    }
  }

  console.log(failures === 0 ? "\nAll good." : `\n${failures} language(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
