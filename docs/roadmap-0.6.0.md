# Roadmap 0.6.0 — what was asked, what was done

An outside review of 0.5.1 proposed five directions and forty tickets. This page records each ticket's state honestly: **done** means implemented with a test that fails without it; **partly** says what is missing; **open** means not started. Two findings of the review were changed on the way, and the reasons are given.

## Changed on the way

- **Writer identity (JRN-01).** The review proposed a writer id per process or session, so that two processes never share a segment. That would break ownership: `facet` runs as a new process for every command, and "the items I hold" is keyed by the writer. The identity stays stable; what was missing is mutual exclusion. Every append now runs under one lock per journal, so processes that share a writer — or do not — cannot interleave.
- **Proof pack layout (PRF-05).** One `manifest.json` instead of eight files: everything in it is covered by a single digest, and there is no partial state to reason about.

## P0.1 Journal integrity and concurrency

| Ticket | State | Where |
|---|---|---|
| JRN-01 writer identity | done differently — see above | `lib/journal.mjs` |
| JRN-02 atomic segment lock | done | `withJournalLock` |
| JRN-03 safe sequence allocation | done | `record` reads and writes under the lock |
| JRN-04 checks of `n` and `lc` | done | `verifyJournal().structure` |
| JRN-05 crash recovery | done: dead owner's lock taken over; torn tail reported, set aside by `facet journal repair` | `test/journal-concurrency.test.mjs` |
| JRN-06 concurrency tests | done: 20 processes, shared writer, single file, simultaneous open | same |
| JRN-07 file-system limits documented | partly: stated in the module and below; not tested on network or synchronised folders | — |

Limits: the lock is an exclusive-create file. That is atomic on local file systems; network and cloud-synchronised folders do not all honour it. There, give each machine its own `FACET_WRITER` and merge segments through the transport instead of sharing one working copy. The takeover of a stale lock has a narrow window in which two processes could both remove it; the hash chain and `verifyJournal` would show the result.

## P0.2 Proof-carrying development

| Ticket | State | Where |
|---|---|---|
| PRF-01 fail-open removed | done | `factsOf`: `journalIntact ?? null` |
| PRF-02 explicit UNKNOWN | done | `evaluate` results carry `unknown`; the gate does not let a waiver cover it |
| PRF-03 commit and tree recorded | done | `sourceState` |
| PRF-04 hashes of changed files | done | `source.dirty` |
| PRF-05 manifest | done, as one file | `createProof` |
| PRF-06 evidence tied to source state | done | `src` on every evidence event |
| PRF-07 conservative invalidation | done | `evidenceOf(..., { source })` |
| PRF-08 attestation extended | partly: the proof pack carries the source state; `facet attest` itself is unchanged | — |
| PRF-09 `facet proof verify` | done | `bin/ops.mjs` |
| PRF-10 dependency-aware invalidation | done as **trust decay**: scope = declared `covers` + import closure; undeclared scope stays conservative | `decay`, `facet check --stale` |

Independence of the inspector was already fail-closed (no named judge → not independent); a benchmark case now pins it.

## P0.3 Skill Intelligence 2.0

| Ticket | State | Where |
|---|---|---|
| SKI-01 delivery apart from exposure | partly: an experiment compares the arm with the facets actually delivered and declares a mismatch invalid; "followed" is still the footprint of `skillint` | `analyse().misdelivered` |
| SKI-02 experiment manifest | done | `trials/experiments/<id>.json` |
| SKI-03 control and treatment recorded | done | `experiments` on `step.start` |
| SKI-04 model, loadout, task class | partly: model and task class held equal; the loadout version is not hashed yet | — |
| SKI-05 reproducible assignment | done | `assign` |
| SKI-06 analysis | done: Wilson intervals, Bonferroni across experiments read together | `analyse` |
| SKI-07 exploratory vs validated | done | `stage` |
| SKI-08 independent confirmation trials | done as a mechanism (`confirms`); no trial has been run | — |
| SKI-09 recommendations for facet evolution | done: `facet evolve` — pattern, diagnosis, proposal, experiment, gated adoption | `lib/evolve.mjs` |
| multi-arm designs, strata, permutation inference | done: `facet intel` supersedes the two-arm `facet experiment` for new work | `lib/intelligence.mjs` |

No experiment has been run on real work. The 69 facets are still hypotheses; what exists now is the instrument, and its own error rates measured on simulated journals (see the changelog). Simulated journals show that the statistics behave; they say nothing about any facet.

Known limits: "followed" is still the footprint a facet declares — a facet without a footprint is diagnosed as unmeasurable, not guessed at. Difficulty comes from the route plan; an item opened without a plan falls into the stratum of its tier. A model arm changes the model the flow recommends for the step; whether the coordinator obeyed is checked afterwards (a unit on the wrong model is a broken delivery).

## P1.1 Ownership and routing

| Ticket | State |
|---|---|
| ORC-01 manifest, ORC-02 resolver, ORC-03 unassigned, ORC-04 conflicts | done — `lib/ownership.mjs`, `facet owners` |
| ORC-05 dependency mapping | done, through the import graph (`seams`) the atlas is built on |
| ORC-06 risk-based routing | done — `planRoute`, compared with two simpler strategies on scenarios |
| ORC-07 route diagnostics in the CLI | done — `facet route` prints owners, reach, risk, route and every omission with its reason |
| ORC-08 ownership tied into REWORK | open: REWORK already requires an owner; the manifest is not consulted there yet |

Limits: the scenarios are written by hand from the team's rules, seven of them, on a small project — a comparison of strategies, not a field result. File discovery from a task's text is offered as candidates and never assumed; the plan is only as good as the files it is given.

## P1.2 Quality benchmark

| Ticket | State |
|---|---|
| QLT-01 manifest, QLT-03 journal fault injection, QLT-04 independent governance fixtures, QLT-05 history, QLT-06 CI, QLT-07 comparison between releases | done — `facet benchmark`, `benchmark/` |
| QLT-02 mutation result classes (detected, survived, equivalent, invalid, not executed) | open |
| QLT-08 benchmark tied to proof packs | partly: proof cases are in the benchmark; a benchmark run does not yet produce a proof pack |

## Smaller findings

- Version in the READMEs and `package.json` now agree; the plugin is rebuilt from `package.json`.
- Audit reproducibility (exact command and versions of the prior-art collections): open.
- Public exports: four modules added; `journal`, `govern` keep their signatures. The one behavioural change for library users is in the changelog (fail-closed `journalIntact`).

## How to check this page

```bash
npm test                 # every "done" above has a test that fails without it
npm run benchmark        # 17 adversarial cases; none may pass by absence
npm run test:viz         # the domain tools that need no Blender
```
