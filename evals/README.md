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

There is no semantic grader in CI, because comparing an answer to `expect`
needs a model or a person. Run them by hand, or wire `cases.json` into
whatever harness you already use.

1. Start an agent session with only this skill installed.
2. Send one `prompt` verbatim. Do not add context; the point is to see what
   the skill alone produces.
3. Compare the answer to `expect`. Judge the placement, not the wording.
4. On a mismatch, read the file named in `source` and check whether the rule
   is absent, ambiguous, contradicted elsewhere, or whether the case itself
   no longer describes the behavior the skill intends. Fix whichever one is
   wrong. Never edit `expect` just to match what the model said.

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
| `source` | repo-relative path to the primary file that decides it |
| `rule` | the section or rule that decides it; name a rule from another file too when the decision leans on one |

`source` names one file, the one to open first on a mismatch, even where
the decision is settled by more than one passage. It must point at a file
that exists, and `node .github/scripts/validate-skills.mjs` enforces that,
so no case can cite a file that has been deleted. Nothing checks `rule`, so
keep it in sync by hand when a heading or a rule name changes.

Write a case when it guards a mistake that is actually likely: a rule two
readings could defend, a regression that has already happened once, or a
convention from outside FSD that an agent will reach for anyway. Several
cases here are the third kind, where the rule is plain and the pull toward
breaking it is what needs holding down.

Keep a case on one architectural decision where you can. A prompt that
checks several independent placements fails as one result, and then the
failure does not say which rule broke. Split it instead.

A case that restates an obvious rule without guarding a realistic mistake
costs a run and catches nothing.
