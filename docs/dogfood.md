# facetkit on facetkit

A tool that asks others for evidence should show its own. This page records what happened when the kit's tools were run on the kit, on 12 November 2026, version 0.5.0. Nothing here is a benchmark; it is a worked example and an honest starting line.

## Mutation probe of our own tests

`facet mutate` was run on eight core modules with ten mutants each (changed-lines-first is irrelevant here, so the sample is the first ten by operator rotation).

```bash
node bin/facet mutate --files lib/govern.mjs --test "node --test test/*.test.mjs" --max 10
```

| Module | First run: noticed | After adding tests | What survived at the end |
|---|---|---|---|
| `journal` | 7 / 10 | 7 / 10 | three equivalent mutants (see below) |
| `flow` | 8 / 10 | 8 / 10 | `return null` → `return undefined`; an object spread reduced to `;` inside a `.map` chain that the probe mis-reads as a statement |
| `govern` | **4 / 10** | 10 / 10 | — |
| `trace` | 8 / 10 | 10 / 10 | — |
| `capsule` | 7 / 10 | 7 / 10 | `return null` → `return undefined` twice; one `||` in a range check |
| `skillint` | 9 / 10 | 9 / 10 | the order of two equal draws |
| `router` | **5 / 10** | 8 / 10 | a default parameter; one `||` on an input the callers never send |
| `secscan` | 7 / 10 | 8 / 10 | digits inside regular-expression character classes |
| **all** | **55 / 80 (69 %)** | **67 / 80 (84 %)** | |

**What it found.** The first run was below the 80 % that facetkit's own default policy asks for at level L3. The worst module was the one that decides whether work may close:

- Nothing checked *which level* a policy rule belongs to: moving `verdict` and `independent` from level 1 to level 2 went unnoticed.
- Nothing checked that evidence recorded **during the inspector's step** stays fresh. Three mutants that made the inspector's own step count as "a change to the product" survived — with any of them, every check the inspector ran would have been reported stale. This is the path every real item takes.
- The router's minimum number of observations and its handling of an unknown model were untested.

The tests added for these are in `test/dogfood.test.mjs`, each named after the survivor it answers.

**What is left, and why it is left.** By the kit's own rule (`falsifiable-tests:mutant-probe`) every survivor needs a test or a one-line reason:

- `journal.mjs:15` — a digit inside `[^a-z0-9]` becomes `[^a-z0-10]`: the same character class. Equivalent.
- `journal.mjs:35` — `!target || !exists(target)` → `&&`: both forms return an empty list for a missing path, by different routes. Equivalent.
- `journal.mjs:38` — the default of a missing logical clock: single-file journals have no clock on any event, segmented ones have it on every event; the two are never mixed. Equivalent in practice.
- `return null` → `return undefined` (flow, capsule): callers test for falsiness. Equivalent for every caller; a stricter contract would be `=== null`, which we do not promise.
- Digits inside regular expressions (secscan) are a known artefact of a textual mutator: the probe cannot tell `{16}` (a length, now tested) from `0-9` (a range).

So the probe did what it is for — it pointed at tests that could not fail — and it also showed its limits: about a quarter of the survivors were artefacts or equivalents that a person had to recognise.

## Assurance level of this release

By its own scale, facetkit 0.5.0 is **not above L1 for its code and L0 for its skills**:

- the code has tests that were probed (above), but no numbered specification traced to them, and no independent agent re-verified it;
- the skills are 69 hypotheses with zero reported trials — see [HYPOTHESES.md](../HYPOTHESES.md).

## Other tools on this repository

```text
$ facet audit --prior <six collections>     14 skills, 69 facets, closest to prior art 23 % (limit 30 %): PASSED
$ facet scan                                 0 blocking findings (test fixtures assemble look-alike secrets at run time)
$ facet atlas stats                          modules, exports and imports of lib/, bin/ and test/
```

To repeat any of this: clone, `npm test`, and run the commands above.

## 0.7.0: the new modules, probed the same way (16 November 2026)

Ten mutants per module, tests of 0.7 (`test/v07`, `test/fencing`, `test/journal-concurrency`).

| Module | First run | After `test/dogfood-07.test.mjs` | Left, and why |
|---|---|---|---|
| `handoff` | 8 / 10 | — | the limit of a template without a limit (`?? 0` → `?? 1`): equivalent for every template that has one; now tested |
| `adapt` | **1 / 10** | 6 / 10 | `have.add` after `add` (the key set is also checked by the journal: each recorded change is skipped next time); a gate inserted by default `true`/`false` in a field nobody reads; `judgeAt >= 0` vs `>= 1` (the verdict is never the first step) |
| `fitness` | 6 / 10 | 8 / 10 | the Tarjan counter starting at 0 or 1: equivalent; a default `isTest` nobody uses without passing one |
| `counterfactual` | **2 / 10** | 8 / 10 | `mkdirSync` of a directory the replay worktree already has |
| `crosslearn` | 5 / 10 | 9 / 10 | `exposed \|\| withheld` with a zero — equivalent for the counts the diagnosis gives |
| `sign` | 5 / 10 | — | file modes and a return value the CLI does not read |
| `journal` | 7 / 10 | — | the fallback of a writer name that slugs to nothing |
| **all** | **34 / 70 (49 %)** | | |

The adaptive orchestrator was the weakest module, as `govern` was in 0.5: its tests showed that it adds the right steps, not that it adds nothing when it must not. The added tests pin exactly that — no growth after a passed verdict, none for a closed item, no escalation below five items, none above the top of the ladder.

## 0.7.1: the new and rewritten modules, first run (22 November 2026)

Ten mutants per module (fewer where fewer are possible), each against the tests written for it. No test was added after this run: what survived is listed as found, to be closed in 0.8.

```bash
node bin/facet mutate --files lib/sign.mjs --test "node --test test/trust-commit.test.mjs test/witness-signature.test.mjs test/journal-sign.test.mjs" --max 10
```

| Module | Noticed | What survived, and what it means |
|---|---|---|
| `canon` | 9 / 10 | the sort comparator returning −2 instead of −1: equivalent — only the sign is read |
| `shell` | 8 / 10 | `SAFE_ITEM` allowing a one-character id to be refused (`{0,63}` → `{1,63}`): no test uses a one-character id; the `SIGKILL` fallback of `killTree` after `taskkill`: no test makes the first kill fail |
| `secscan` | 7 / 10 | `AKIA[0-9A-Z]` → `[1-9A-Z]` and `[A-Za-z0-9]` → `[A-Za-z0-10]` in two secret patterns: the test keys contain no `0`; a hunk start `+ i` → `- i`: no test has a hunk longer than one line |
| `sign` | 6 / 10 | the length of a key id (16 → 17 characters) is not pinned; the fallback when `FACET_KEYS` is unset, the return value of `addTrust` and a `false` from a key check nobody reads alone |
| `docaudit` | 6 / 6 | — |
| `github-context` | 8 / 10 | `before` made of zeros (a new branch pushed) is not tested; an event file that does not exist with a path given |
| `explain-pr` | 8 / 10 | the cut length of the change cell (80 → 81); a comment without a repository name but with a token and a PR number |
| **all** | **52 / 66 (79 %)** | |

The weakest of the new code is the key handling in `sign` — the part the trust from a commit (plan 2.5) was added to. Its new lines were not reached by this sample (the probe takes mutants in operator rotation); a run on changed lines only is the first thing to do in 0.8.

