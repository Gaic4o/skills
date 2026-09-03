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

function readFrontmatterField(lines, bodyStart, field) {
  // Scalar (`name: value`) or folded block (`description: >`) form.
  const pattern = new RegExp(`^${field}:\\s*(.*)$`);

  for (let index = 1; index < bodyStart - 1; index += 1) {
    const match = lines[index].match(pattern);

    if (match === null) {
      continue;
    }

    const inline = match[1].trim();

    if (inline !== "" && inline !== ">" && inline !== "|") {
      return inline;
    }

    // Folded or literal block: collect the indented lines beneath it.
    const block = [];

    for (let next = index + 1; next < bodyStart - 1; next += 1) {
      if (!/^\s+\S/.test(lines[next])) {
        break;
      }

      block.push(lines[next].trim());
    }

    return block.join(" ").trim();
  }

  return null;
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

  if (bodyStart !== null) {
    // The installed skill is addressed by its directory name, so a
    // frontmatter name that disagrees with it routes to nothing.
    const declaredName = readFrontmatterField(lines, bodyStart, "name");
    const directoryName = path.basename(skillDirectory);

    if (declaredName === null) {
      recordError(skillFile, "frontmatter is missing a name field", 1);
    } else if (declaredName !== directoryName) {
      recordError(
        skillFile,
        `frontmatter name "${declaredName}" does not match the ` +
          `directory name "${directoryName}"`,
        1,
      );
    }

    // The description is the only text an agent reads when deciding
    // whether to activate the skill.
    const description = readFrontmatterField(lines, bodyStart, "description");

    if (description === null || description === "") {
      recordError(skillFile, "frontmatter is missing a description", 1);
    }
  }

  const mentionedReferences = new Set();

  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(REFERENCE_PATH_PATTERN)) {
      const referenceName = match[1];
      mentionedReferences.add(referenceName);

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

  // A reference SKILL.md never names is dead weight: it ships with the
  // package but no routing rule can reach it.
  const referencesDirectory = path.join(skillDirectory, "references");

  if (statSync(referencesDirectory, { throwIfNoEntry: false })?.isDirectory()) {
    for (const entry of readdirSync(referencesDirectory)) {
      if (entry.endsWith(".md") && !mentionedReferences.has(entry)) {
        recordError(
          path.join(referencesDirectory, entry),
          `references/${entry} is never mentioned in SKILL.md`,
        );
      }
    }
  }
}

function validateEvals() {
  const evalsFile = path.join(ROOT, "evals", "cases.json");

  if (!isFile(evalsFile)) {
    return;
  }

  let parsed;

  try {
    parsed = JSON.parse(readFileSync(evalsFile, "utf8"));
  } catch (error) {
    recordError(evalsFile, `is not valid JSON: ${error.message}`);
    return;
  }

  const cases = parsed.cases;

  if (!Array.isArray(cases) || cases.length === 0) {
    recordError(evalsFile, "must contain a non-empty cases array");
    return;
  }

  console.log(`  evals/cases.json: ${cases.length} case(s)`);

  const required = ["id", "prompt", "expect", "why", "source", "rule"];
  const seen = new Set();

  for (const [index, testCase] of cases.entries()) {
    const label = testCase?.id ?? `#${index + 1}`;

    for (const field of required) {
      if (typeof testCase?.[field] !== "string" || testCase[field] === "") {
        recordError(evalsFile, `case ${label} is missing "${field}"`);
      }
    }

    if (typeof testCase?.id === "string") {
      if (seen.has(testCase.id)) {
        recordError(evalsFile, `case id "${testCase.id}" is duplicated`);
      }

      seen.add(testCase.id);
    }

    // A case that cites a file which no longer exists silently stops
    // guarding anything, so treat the dangling path as an error.
    if (typeof testCase?.source === "string" && testCase.source !== "") {
      if (!isFile(path.join(ROOT, testCase.source))) {
        recordError(
          evalsFile,
          `case ${label} cites "${testCase.source}", which does not exist`,
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

  validateEvals();

  if (errorCount > 0) {
    console.error(`\n${errorCount} problem(s) found.`);
    process.exitCode = 1;
    return;
  }

  console.log("\nAll checks passed.");
}

main();
