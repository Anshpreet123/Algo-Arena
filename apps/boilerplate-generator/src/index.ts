import fs from "fs";
import path from "path";
import { ProblemDefinitionParser } from "./ProblemDefinitionGenerator";
import { FullProblemDefinitionParser } from "./FullProblemDefinitionGenerator";
import dotenv from 'dotenv'
dotenv.config()

function generatePartialBoilerplate(generatorFilePath: string) {
  const inputFilePath = path.join(generatorFilePath, "Structure.md");
  const boilerplatePath = path.join(
    generatorFilePath,
    "boilerplate",
  );

  // Read the input file
  const input = fs.readFileSync(inputFilePath, "utf-8");

  // Parse the input
  const parser = new ProblemDefinitionParser();
  parser.parse(input);

  // Generate the boilerplate code
  const cppCode = parser.generateCpp();
  const jsCode = parser.generateJs();
  const rustCode = parser.generateRust();
  const javaCode = parser.generateJava();

  // Ensure the boilerplate directory exists
  if (!fs.existsSync(boilerplatePath)) {
    fs.mkdirSync(boilerplatePath, { recursive: true });
  }

  // Write the boilerplate code to respective files
  fs.writeFileSync(path.join(boilerplatePath, "function.cpp"), cppCode);
  fs.writeFileSync(path.join(boilerplatePath, "function.js"), jsCode);
  fs.writeFileSync(path.join(boilerplatePath, "function.rs"), rustCode);
  fs.writeFileSync(path.join(boilerplatePath, "function.java"), javaCode);

}

function generateFullBoilerPLate(generatorFilePath: string) {
  const inputFilePath = path.join(generatorFilePath, "Structure.md");
  const boilerplatePath = path.join(
    generatorFilePath,
    "boilerplate-full",
  );

  // Read the input file
  const input = fs.readFileSync(inputFilePath, "utf-8");

  // Parse the input
  const parser = new FullProblemDefinitionParser();
  parser.parse(input);

  // Generate the boilerplate code
  const cppCode = parser.generateCpp();
  const jsCode = parser.generateJs();
  const rustCode = parser.generateRust();
  const javaCode = parser.generateJava();

  // Ensure the boilerplate directory exists
  if (!fs.existsSync(boilerplatePath)) {
    fs.mkdirSync(boilerplatePath, { recursive: true });
  }

  // Write the boilerplate code to respective files
  fs.writeFileSync(path.join(boilerplatePath, "function.cpp"), cppCode);
  fs.writeFileSync(path.join(boilerplatePath, "function.js"), jsCode);
  fs.writeFileSync(path.join(boilerplatePath, "function.rs"), rustCode);
  fs.writeFileSync(path.join(boilerplatePath, "function.java"), javaCode);

}

const DEFAULT_PROBLEMS_DIR = path.join(__dirname, "../../problems");

async function main() {
  const problemsDir = process.env.PROBLEMS_DIR_PATH || DEFAULT_PROBLEMS_DIR;

  if (!fs.existsSync(problemsDir)) {
    console.error(`Problems directory not found: ${problemsDir}`);
    console.error("Set PROBLEMS_DIR_PATH in apps/boilerplate-generator/.env");
    process.exit(1);
  }

  const folders = fs
    .readdirSync(problemsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const folder of folders) {
    const problemPath = path.join(problemsDir, folder);
    if (!fs.existsSync(path.join(problemPath, "Structure.md"))) {
      console.warn(`Skipping ${folder}: no Structure.md`);
      continue;
    }
    generatePartialBoilerplate(problemPath);
    generateFullBoilerPLate(problemPath);
    console.log(`Generated boilerplate for ${folder}`);
  }

  console.log(`
Done: ${folders.length} problem(s) processed.`);
}

main();
