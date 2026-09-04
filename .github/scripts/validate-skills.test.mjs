import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateRepository } from "./validate-skills.mjs";

// Each test copies the real repository to a temporary directory, breaks
// one thing, and asserts that the validator names it. Using the live
// documents rather than hand-written fixtures means the tests also prove
// the validator accepts the repository as it is.

const ROOT = path.resolve(import.meta.dirname, "../..");
const SKILL = "feature-sliced-design/SKILL.md";
const ASSETS = "feature-sliced-design/references/asset-handling.md";
const AUTH = "feature-sliced-design/references/auth-and-api.md";
const CASES = "evals/cases.json";

function problemsAfter(mutate) {
  const dir = mkdtempSync(path.join(tmpdir(), "validate-skills-"));

  try {
    for (const entry of ["feature-sliced-design", "evals"]) {
      cpSync(path.join(ROOT, entry), path.join(dir, entry), { recursive: true });
    }

    mutate?.(dir);

    const quiet = { log() {}, logError() {} };
    return validateRepository(dir, quiet).map((problem) => problem.message);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function replaceIn(dir, relativePath, from, to) {
  const filePath = path.join(dir, relativePath);
  const text = readFileSync(filePath, "utf8");
  assert.ok(text.includes(from), `fixture text not found in ${relativePath}: ${from}`);
  writeFileSync(filePath, text.replace(from, to));
}

function appendTo(dir, relativePath, text) {
  const filePath = path.join(dir, relativePath);
  writeFileSync(filePath, readFileSync(filePath, "utf8") + text);
}

function setRuleOfFirstCase(dir, rule) {
  const filePath = path.join(dir, CASES);
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  parsed.cases[0].rule = rule;
  parsed.cases[0].source = SKILL;
  writeFileSync(filePath, JSON.stringify(parsed, null, 2));
}

function assertOneProblemMatching(problems, pattern) {
  const matching = problems.filter((message) => pattern.test(message));
  assert.equal(
    matching.length,
    1,
    `expected exactly one problem matching ${pattern}, got:\n${problems.join("\n")}`,
  );
}

test("the repository as committed passes", () => {
  assert.deepEqual(problemsAfter(), []);
});

test("a section number with no heading in SKILL.md is reported", () => {
  const problems = problemsAfter((dir) =>
    appendTo(dir, ASSETS, "\nThe rest is in Section 77.\n"),
  );
  assertOneProblemMatching(problems, /"section 77" does not match a numbered heading/);
});

test("each id in a list of rules is checked", () => {
  const problems = problemsAfter((dir) =>
    appendTo(dir, ASSETS, "\nRules 4-1, 4-2, and 4-9 apply here.\n"),
  );
  assertOneProblemMatching(problems, /"rule 4-9" does not match/);
});

test("a package-scoped token with no anchor is reported", () => {
  const problems = problemsAfter((dir) =>
    appendTo(dir, ASSETS, "\nSee Snapshot 9 and Strategy E.\n"),
  );
  assertOneProblemMatching(problems, /"snapshot 9" does not match/);
  assertOneProblemMatching(problems, /"strategy E" does not match/);
});

test("references inside code fences are ignored", () => {
  const problems = problemsAfter((dir) =>
    appendTo(dir, ASSETS, "\n```text\n// Section 77 is only an example here\n```\n"),
  );
  assert.deepEqual(problems, []);
});

test("a named rule cited from several files must be a heading somewhere", () => {
  const problems = problemsAfter((dir) =>
    replaceIn(dir, AUTH, "### Request placement rule", "### Request placement policy"),
  );
  const matching = problems.filter((message) =>
    /"the request placement rule" is cited from \d+ files/.test(message),
  );
  assert.ok(matching.length >= 2, `expected the error once per citing file:\n${problems.join("\n")}`);
});

test("a case whose rule cites a missing rule id is reported", () => {
  const problems = problemsAfter((dir) => setRuleOfFirstCase(dir, "Rule 4-9"));
  assertOneProblemMatching(problems, /rule cites "rule 4-9", which does not exist/);
});

test("a case whose rule quotes text that is not in the source is reported", () => {
  const problems = problemsAfter((dir) =>
    setRuleOfFirstCase(dir, "Section 2, 'no such sentence anywhere'"),
  );
  assertOneProblemMatching(problems, /quotes "no such sentence anywhere", which does not appear/);
});

test("a case whose rule names a heading that does not exist is reported", () => {
  const problems = problemsAfter((dir) => setRuleOfFirstCase(dir, "No such heading"));
  assertOneProblemMatching(problems, /"No such heading" is not a heading, bold label/);
});

test("a case whose rule matches a heading of the source passes", () => {
  const problems = problemsAfter((dir) =>
    setRuleOfFirstCase(dir, "Quick placement table; SKILL.md Rule 4-2"),
  );
  assert.deepEqual(problems, []);
});

test("a reference file pointing at a missing sibling is reported", () => {
  const problems = problemsAfter((dir) =>
    appendTo(dir, ASSETS, "\nMore in `references/gone.md`.\n"),
  );
  assertOneProblemMatching(problems, /references\/gone\.md does not exist/);
});

test("a reference SKILL.md never mentions is reported as orphaned", () => {
  const problems = problemsAfter((dir) =>
    writeFileSync(
      path.join(dir, "feature-sliced-design/references/orphan.md"),
      "# Orphan\n",
    ),
  );
  assertOneProblemMatching(problems, /references\/orphan\.md is never mentioned in SKILL\.md/);
});

test("a SKILL.md body at the line limit is reported", () => {
  const problems = problemsAfter((dir) =>
    appendTo(dir, SKILL, "\nPadding.\n".repeat(10)),
  );
  assertOneProblemMatching(problems, /must stay under 500 lines/);
});

test("a description over the specification limit is reported", () => {
  const problems = problemsAfter((dir) =>
    replaceIn(
      dir,
      SKILL,
      "description: >\n",
      `description: >\n  ${"x".repeat(1100)}\n`,
    ),
  );
  assertOneProblemMatching(problems, /frontmatter description is \d+ characters; the limit is 1024/);
});

test("a frontmatter name that differs from the directory is reported", () => {
  const problems = problemsAfter((dir) =>
    replaceIn(dir, SKILL, "name: feature-sliced-design", "name: fsd"),
  );
  assertOneProblemMatching(problems, /does not match the directory name/);
});
