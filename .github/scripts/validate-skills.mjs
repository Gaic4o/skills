#!/usr/bin/env node

/**
 * Validate repository-specific skill package rules.
 * The official skills CLI validates frontmatter and installation.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const SKILL_LINE_LIMIT = 500;
const REFERENCE_PATH_PATTERN = /\breferences\/([A-Za-z0-9._-]+\.md)\b/g;
const IS_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === "true";

let errorCount = 0;

function isFile(filePath) {
  return statSync(filePath, { throwIfNoEntry: false })?.isFile() ?? false;
}

function readLines(filePath) {
  const lines = readFileSync(filePath, "utf8")
    .replace(/\r\n?/g, "\n")
    .split("\n");

  // Do not count the empty value created by a trailing newline.
  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines;
}

function findBodyStart(filePath, lines) {
  if (lines[0] !== "---") {
    recordError(filePath, "SKILL.md is missing its frontmatter block", 1);
    return null;
  }

  const closingDelimiter = lines.indexOf("---", 1);

  if (closingDelimiter === -1) {
    recordError(
      filePath,
      "SKILL.md frontmatter is missing its closing --- delimiter",
      1,
    );
    return null;
  }

  return closingDelimiter + 1;
}

function recordError(filePath, message, lineNumber) {
  errorCount += 1;

  const relativePath = path.relative(ROOT, filePath).split(path.sep).join("/");

  if (IS_GITHUB_ACTIONS) {
    const location =
      lineNumber === undefined
        ? `file=${relativePath}`
        : `file=${relativePath},line=${lineNumber}`;

    console.error(`::error ${location}::${message}`);
    return;
  }

  const location =
    lineNumber === undefined ? relativePath : `${relativePath}:${lineNumber}`;

  console.error(`ERROR  ${location}  ${message}`);
}

function findSkillDirectories() {
  const skillDirectories = [];

  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }

    const skillDirectory = path.join(ROOT, entry.name);
    const skillFile = path.join(skillDirectory, "SKILL.md");

    if (isFile(skillFile)) {
      skillDirectories.push(skillDirectory);
    }
  }

  return skillDirectories.sort();
}

function validateSkill(skillDirectory) {
  const skillFile = path.join(skillDirectory, "SKILL.md");
  const lines = readLines(skillFile);
  const bodyStart = findBodyStart(skillFile, lines);

  // The limit applies to the body, which is what the agent loads when the
  // skill activates. Frontmatter is metadata, so it is excluded.
  const bodyLength =
    bodyStart === null ? lines.length : lines.length - bodyStart;

  console.log(
    `  ${path.basename(skillDirectory)}/SKILL.md: ` +
      `${bodyLength} body lines`,
  );

  if (bodyLength >= SKILL_LINE_LIMIT) {
    recordError(
      skillFile,
      `SKILL.md body contains ${bodyLength} lines; ` +
        `it must stay under ${SKILL_LINE_LIMIT} lines`,
    );
  }

  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(REFERENCE_PATH_PATTERN)) {
      const referenceName = match[1];
      const referenceFile = path.join(
        skillDirectory,
        "references",
        referenceName,
      );

      if (!isFile(referenceFile)) {
        recordError(
          skillFile,
          `references/${referenceName} does not exist`,
          index + 1,
        );
      }
    }
  }
}

function main() {
  const skillDirectories = findSkillDirectories();

  if (skillDirectories.length === 0) {
    console.error("ERROR  no skill packages found; expected */SKILL.md");
    process.exitCode = 1;
    return;
  }

  console.log(`Validating ${skillDirectories.length} skill package(s):`);

  for (const skillDirectory of skillDirectories) {
    validateSkill(skillDirectory);
  }

  if (errorCount > 0) {
    console.error(`\n${errorCount} problem(s) found.`);
    process.exitCode = 1;
    return;
  }

  console.log("\nAll checks passed.");
}

main();
