export interface LanguageSpec {
  /** Matches the keys in @repo/common/language. */
  id: string;
  name: string;
  /** Name the source file must have inside the sandbox (Java is picky). */
  sourceFile: string;
  /** Docker image used by the container driver. */
  image: string;
  /** Shell command run once before the testcases. Omit for interpreted languages. */
  compile?: string;
  /** Shell command run once per testcase, with stdin piped in. */
  run: string;
  /**
   * Fallback for when Docker is unavailable: the command is looked up on the
   * host PATH, so the language is only offered if the binary actually exists.
   */
  local?: {
    probe: string;
    compile?: string;
    run: string;
  };
}

export const LANGUAGES: Record<string, LanguageSpec> = {
  js: {
    id: "js",
    name: "JavaScript",
    sourceFile: "Main.js",
    image: "node:22-slim",
    run: "node Main.js",
    local: { probe: "node", run: "node Main.js" },
  },
  cpp: {
    id: "cpp",
    name: "C++",
    sourceFile: "Main.cpp",
    image: "gcc:13",
    compile: "g++ -O2 -std=c++17 -o Main Main.cpp",
    run: "./Main",
    local: { probe: "g++", compile: "g++ -O2 -std=c++17 -o Main Main.cpp", run: "./Main" },
  },
  java: {
    id: "java",
    name: "Java",
    sourceFile: "Main.java",
    image: "eclipse-temurin:21-jdk",
    compile: "javac Main.java",
    // Serial GC keeps the JVM inside a small memory limit; the default
    // collector reserves far more than a 256MB cgroup allows.
    run: "java -XX:+UseSerialGC -Xss64m Main",
    local: { probe: "javac", compile: "javac Main.java", run: "java Main" },
  },
  rs: {
    id: "rs",
    name: "Rust",
    sourceFile: "Main.rs",
    image: "rust:1-slim",
    compile: "rustc -O -o Main Main.rs",
    run: "./Main",
    local: { probe: "rustc", compile: "rustc -O -o Main Main.rs", run: "./Main" },
  },
};

export function getLanguage(id: string): LanguageSpec | undefined {
  return LANGUAGES[id];
}
