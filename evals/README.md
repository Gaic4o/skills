# Skill evaluation cases

`cases.json` records the placement answers this skill is supposed to produce.
The validator keeps the file honest; a person or a harness grades the answers.

## Why this exists

The other checks in this repository verify that the documents are well formed:
the body stays under the line limit, every reference path resolves, no
reference is orphaned. None of them verify the thing the skill is for, which
is whether an agent reading it places code correctly.

That gap is not theoretical. Several rules in this skill were changed because
two passages decided the same question on different grounds, and nothing in CI
noticed. A case list is the cheapest way to catch the next one.

## Running the cases

There is no automated grader in CI, because grading requires a model. Run them
by hand, or wire `cases.json` into whatever harness you already use.

1. Start an agent session with only this skill installed.
2. Send one `prompt` verbatim. Do not add context; the point is to see what
   the skill alone produces.
3. Compare the answer to `expect`. Judge the placement, not the wording.
4. On a mismatch, read the file named in `source` and check whether the rule
   is absent, ambiguous, or contradicted somewhere else. Fix the document,
   not the case.

Start a fresh session per case. A previous answer in the same conversation
will steer the next one.

## Adding a case

Add an object to `cases` with all six fields:

| Field | Meaning |
| --- | --- |
| `id` | kebab-case, unique |
| `prompt` | what the user types, verbatim |
| `expect` | the placement, plus what must not happen if that matters |
| `why` | what regression this case guards against |
| `source` | repo-relative path to the file that decides it |
| `rule` | the section or rule inside that file |

`source` must point at a file that exists. `node
.github/scripts/validate-skills.mjs` enforces that, so a case can never
outlive the passage it cites.

Write a case when a rule was ambiguous enough that two readings were
defensible. A case that only restates an obvious rule costs a run and catches
nothing.
