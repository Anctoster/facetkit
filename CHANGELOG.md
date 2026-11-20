# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed (portability)
- Checks, witness runs, decision measures and bug reproductions run through the platform's own shell (`lib/shell.mjs`: /bin/sh, or cmd.exe on Windows) instead of `sh -c`, which Windows does not have. A timeout stops the whole process tree, and facet stops the trees it started when it is interrupted.
- `{item}` in a configured command is filled only with an id of letters, digits, `.`, `_` and `-`; any other id is refused, and `FACET_ITEM` is set only to such an id — a shell must not read an item id as more than a name.
- Step snapshots give back the exact bytes they took on Windows (git's line-ending conversion is off for them).
- Extensions listed by an absolute path load on Windows.
- `.gitattributes` keeps LF in text files: hashed files no longer change on a Windows checkout.
- CI runs on Linux, macOS and Windows × Node 20 and 22, and every one of them must pass.
- `npm test` works on Windows with Node 20: the test files are listed by `scripts/test.mjs` (cmd.exe and Node 20 expand no `*` pattern).

### Security
- `SECURITY.md` states the threat model: four sources of harm (an agent that errs, an agent that games the record, foreign content, accidents) and what is out of scope (whoever controls the machine or the repository); a table says, for each guarantee, what it rests on and when it does not hold. A test keeps both sections present and complete.

### Fixed
- Adaptive routes: a step the plan asks for before a step that has **already started** no longer goes in front of it (which reset the started work); it goes after it in `REVIEW` mode and reviews that work.
- Adaptive routes escalate a step's model only when most of that agent's reworks had a capability cause (`false-green`, `seam-break`, `spec-gap`, `regression`, `weakened-test`, `lost-work`, `loop`, `repeated-mistake`). Reworks for handoffs and documents are answered by reinforced rules, not by a model five times the price.
- A step ended `DONE` with `--force` over a failed handoff check is still no failed rule, but it is no longer invisible: `facet assure` lists each such step with its `--reason`, and `facet trust` counts them next to forced steps.
- `facet flow end` no longer asks a step to list changed files that another handoff of the item already lists or that belong to another agent's territory. With a team rule "never list another agent's files", every step that ran after another agent's changes could only end with `--force`. The manifest is `owners`, `owners.json`, or `territories` — a team file of agent → paths.

### Added
- The first field report, `trials/field/field-1.json`: what nine closed items of one web application's roadmap say about 37 facets (exposure, adherence, effect, verdict), anonymous — no project name, file names, commands or text. `facet hypotheses --next` ranks by it.
- **Trials of the hypotheses are easier to start and to find**: `facet hypotheses --next [N]` lists the untested facets worth trying first — field reports (knowledge packs in `trials/field/`) first, then rules whose observance leaves a footprint; `facet hypotheses --check FILE` fails on a stale registry and runs in CI; `docs/trial-board.md` is the text of a pinned issue that coordinates who tests what.
- **Testers** (`facetkit/qa`, `facet qa`): `plan` — a risk map of what changed (class, dependents, whether a test reaches it, churn, escaped defects) with the tests each area calls for; `charter new|close|list` — time-boxed exploratory sessions; `bug new|verify|confirm|list|close` — bugs that carry their reproduction, run several times (reproduced, not reproduced, flaky), confirmed by a second person when they are steps, fixed only when the reproduction passes and `verified` only with a test that names the bug; `readiness` — GO/NO-GO with every reason. A bug reported with `--item` in closed work is recorded as that item's escape.
- **Plugin `qa-flow`** (`domains/qa`): test-strategist, exploratory-tester, bug-verifier, release-judge and the `/qa-item` skill.
- **Architecture decisions with measured predictions** (`facetkit/decisions`, `facet decide new|check|list`): a decision record carries fitness rules or commands that must keep holding; a failed measure sends it to review. Records in `docs/decisions/` as JSON and Markdown.
- `facet explain --for client --lang en|pl|ru`.
- **Agent efficiency for building architects** (`arch-flow`, `viz-flow`): `hand ITEM --hours H` — the architect's estimate of the hand work, taken before the agents start (a later one is shown, not used); `spent ITEM --minutes M --on brief|questions|preview|review|fix` — the architect's own time; `efficiency [--route] [--lang en|pl|ru] [--html] [--json]` — per task type: right the first time, accepted as delivered (80 % intervals), time saved against the hand work, agents' time, tokens and cost, questions and preview rounds, what the checks caught, which agent on which model is sent back and whether a cheaper model does as well, and a verdict that refuses to conclude from fewer than five items.
- Docs: `docs/for-testers.md`, `docs/for-architects.md`; `how-it-works.md`, `governance.md` (signatures, witnesses, statuses), `skill-intelligence.md` (withholding modes, per-item units, counterfactual replay), `architecture.md` (fencing), `SECURITY.md` (keys) brought up to date.

### Changed
- Two-arm experiments (`facet experiment`) created from now on also use the item as the unit; manifests from before keep the step so that a running experiment does not change its assignment.

## [0.7.0] — 2026-11-16

Answers to the review of 0.6.0, finding by finding: `docs/roadmap-0.7.0.md`. Plan to 2.0: `docs/roadmap-2.0.md`.

### Added
- **Authorship** (`facetkit/sign`): Ed25519 keys (`facet key new|trust|list`), trusted keys by role in `.facet/trust.json`; proof packs signed on creation; journal events signed with `govern.signEvents`; `govern.requireSignature` refuses unsigned packs (status UNSIGNED).
- **Witnesses**: `facet proof witness` (or `verify --rerun`) runs the checks again on the same sources and compares; a disagreement makes the pack a MISMATCH; witnesses count in the trust graph. Check evidence carries a receipt (hash of command and log).
- **Fencing**: a forced lock takeover raises the journal's epoch; events carry it; a fork is settled for the higher epoch and the late line is fenced (`facet journal repair` moves it to `.fenced`); a fork inside one epoch is damage. `facet journal unlock` for a stuck live owner.
- **Environment** (`facetkit/envinfo`): runtime, platform, tool versions, lock-file hashes, container and CI — no variable values; recorded with evidence, proof packs and benchmark reports, with a comparable digest.
- **Adaptive orchestration** (`facetkit/adapt`): `grow`, `reinforce`, `escalate` — recorded as `route.adapt` events, applied by the flow, shown by `facet flow status`. Never removes a step, a gate or a model rung.
- **Handoff check** (`facetkit/handoff`, `facet handoff check`): `facet flow end --status DONE` refuses a handoff with a missing or empty section, no evidence line, a drifted anchor, or a changed file not listed.
- **Architecture fitness functions** (`facetkit/fitness`, `facet fitness [--accept]`): no-import, layers, no-cycle, max-lines, max-fan-in, tested — as a ratchet against a baseline.
- **Explanations by audience** (`facetkit/explain`, `facet explain --for dev|lead|client|auditor [--html FILE]`); `docs/how-it-works.md`.
- **Counterfactual replay** (`facetkit/counterfactual`, `facet cf candidates|setup|judge|report`): paired replays with and without a rule, sign test.
- **Cross-project learning** (`facetkit/crosslearn`, `facet learn export|import|pool`): anonymous knowledge packs, imported lessons start at 0.55 and must prove themselves, pooled effects with disagreement reported.
- Benchmark: 22 cases (fenced fork, unlocked twin, authorship, source state, withholding rules); reports carry the environment, a suite digest and a result digest.
- Failure modes `handoff-format` and `architecture`.

### Changed
- **Every facet says whether it may be withheld**: `ablatable: no` (16), `replay` (33) or `live` with a `backstop` (20). Unsaid means never; `facet audit` fails it.
- **Withholding is per item**, at most one rule, drawn when the item opens and recorded with its probability; only `live` rules whose backstop the policy enforces at the required level.
- **Experiments use the item as the unit**: one arm per item, steps of an item collapsed into one observation (`clusterByItem`); new designs carry `unit: "item"`.
- **SHA-256** for proof packs, bundles, source state and benchmark digests (`PROOF_SCHEMA` 2, benchmark schema 2). Packs from 0.6 verify as MISMATCH (schema) and must be made again.
- **Source state** records the executable bit, link targets and submodule commits; the hash cache checks ctime, inode and mode; `govern.inputs` adds ignored files a build reads; collisions on folding file systems are listed as `blind`.
- A lock is taken over only when its owner is known to be gone; an owner releases only its own lock.
- `/facet-item`: the coordinator keeps its turns short, follows adapted routes, and sends handoff problems back to their author.

## [0.6.0] — 2026-11-15

- **arch domain 0.2.0 — variant sketching before the drawing sets.** Route `variants` (site plan, layouts, facades, in that order): an agent proposes three to five different ideas with geometry; `variants.py` derives the indicators, tests the architect's limits, refuses near-identical variants, scores by the architect's weights and names variants beaten on every criterion. A variant over a limit is shown and marked, never dropped; the choice is a person's gate. Plan `design` lays out a commission from the first sketch to both drawing sets.

### Added
- **Journal writer protocol.** Appends run under one lock per journal (exclusive-create lock file with owner, takeover of a dead owner's lock, a bounded wait). `verifyJournal` now checks structure as well as the hash chain — sequence numbers, the logical clock, the writer of each segment, lines cut off mid-write — and answers with a single `intact`. `facet journal repair` sets a torn tail aside in `<segment>.torn`; nothing is repaired silently.
- **Proof packs** (`facet proof create|verify|status`, `facetkit/proof`): one manifest per item tying its rules and evidence to a source state — a hash over the content of the working tree, unchanged by a commit of the same content, changed by any edit. Verification answers VALID, STALE, TAMPERED, MISMATCH or UNKNOWN and is reproducible on another clone.
- **Source-bound evidence.** Every evidence event records the source state it was measured on; evidence from another state is stale (conservative invalidation). `govern.source: "off"` restores time-only staleness; `govern.sourceIgnore` lists paths that are not sources.
- **Experiments** (`facet experiment new|start|stop|report|arm`, `facetkit/experiments`): manifests in `trials/experiments/`, seeded assignment recorded on `step.start`, held-equal model and task class, Wilson intervals with a Bonferroni correction, and exploratory → confirmatory → validated stages.
- **Facet Intelligence Engine** (`facet intel design|start|stop|report|size`, `lib/intelligence.mjs`): multi-arm designs (facet off / on / candidate wording / another model / another position), permuted-block assignment inside strata of role, task class and difficulty, six outcomes read from the journal (clean close, errors, false passes, retries, tokens, minutes), a seeded stratified permutation test with bootstrap intervals, Holm correction, a floor of 30 units per arm and `intel size` for the planned number. Measured on simulated journals: 5 false alarms in 100 experiments where the facet does nothing; a halved failure rate found in 76 of 100 at 75 units per arm and in 22 of 100 at 30.
- **Skill evolution** (`facet evolve scan|list|test|adopt|reject`, `lib/evolve.mjs`): recurring causes → the guarding facet → delivered? followed? → one of six diagnoses (create, load, instrument, reword, change, to-tool) → a proposal → an experiment → adoption only on a confirmed, favourable result and only with `--by`.
- **Route planner** (`facet route`, `lib/planner.mjs`): file classes, dependents from the import graph, owners and their order of work, a risk score with reasons, optional agents chosen by risk, skippable steps for pure documentation or style, and locked security gates. On seven scenarios: fixed route 79 agent calls with 8 unneeded; by file class only 52 calls with 1 required agent missed; adaptive 54 calls, none missed, none unneeded.
- **Trust decay** (`facet proof decay`, `facet check --stale`): per-check scopes (`covers` plus import closure), evidence bound to its scope digest, per-state snapshots, blind spots named.
- **Hypotheses** (`facet hypo`), **lessons** — cognitive memory and learning (`facet learn`), **trust graph** (`facet trustgraph`), **self-healing** (`facet heal scan|apply|undo`) and the **capability economy** (`facet economy`): see `docs/cognitive.md`. Lessons recalled for a step change the rules it is given; a weak agent can be put on probation one model up; a contradicted check stops counting.
- **Portable proof bundles** (`facet proof export`, `facet proof verify --bundle FILE [--root DIR]`): the pack, the journal it rests on and the policy in one sealed file, verified with nothing else — VALID, STALE, TAMPERED or MISMATCH, step by step. `npm run demo:proof` plays the whole scenario and runs in CI.
- **Identity**: events carry an id (the hash of their content), and a session and actor when `FACET_SESSION` / `FACET_ACTOR` are set; steps record their run (`--run`, `FACET_RUN`). The judge is independent only if it is another agent *and* another run; with `identity: "required"` a missing run id is unknown. `verifyJournal` answers with a status: empty, intact, torn, tampered, malformed, conflict.
- **Mutation outcomes** are five and never merged: detected, survived, equivalent (declared in a manifest), invalid (the mutant does not load), not executed. A nightly workflow probes the guard files.
- **Benchmark** reports have a schema and a trend across versions (`facet benchmark --trend`); CI stores each run as an artifact with commit and Node version.
- `ROADMAP.md`, `ARCHITECTURE.md`, `GOOD_FIRST_ISSUES.md`, `.github/CODEOWNERS` and a guard-file rule in `CONTRIBUTING.md`; the memory store appends under the journal's lock; designs can be stratified by model and risk (`--strata`).
- **Ownership** (`facet owners`, `facetkit/ownership`): most-specific-pattern resolution, with unowned files, equal claims and foreign edits refused.
- **Guard benchmark** (`facet benchmark [--write]`, `facetkit/benchmark`): adversarial fixtures under `benchmark/fixtures`, expectations in `benchmark/expected.json`, results per version in `benchmark/results/`, regressions named.
- **`domains/arch`** — the method for architectural production in Archicad, as a third plugin (`arch-flow`): task cards, a checked building description read once from texts and raster drawings, model-against-description comparison, drawing-set checks for two stages, and a schedule simulation that reports dates, the chance of missing the deadline and the gain of each measure. The journal engine of the domains is now one file configured by a `domain.json`.
- **`domains/viz`** — the method applied to architectural visualization, as a second plugin (`viz-flow`) in the marketplace. For large scenes: an object index instead of the scene, zones so that cost follows the change, and headless copy-on-write transactions that commit only what an operation declared (`domains/viz/skills/viz-item/scripts/COMPLEX.md`).

### Changed
- **Governance is fail-closed.** `journalIntact` is unknown unless the caller established it, and unknown does not pass (`evaluate` marks such rules `unknown`). Library callers that evaluated in-memory events must now pass `project: { journalIntact: true }` after verifying the journal; `facet` does so itself.
- A waiver no longer opens the gate for an unknown rule; it still never raises the level.
- `readJournal` skips a line that is not an event instead of throwing; `verifyJournal` reports it and `record` refuses to append after it.
- An absent journal is not an intact one: `verifyJournal(...).intact` is false when nothing was recorded.

### Fixed
- Two processes appending at once could take the same sequence number and logical clock, and a reader could meet a half-written line and crash. Measured on 0.5.1 with 20 writers × 100 events: 1910 of 2000 events survived, one writer crashed, 525 events shared a clock value. On 0.6.0: 2000 of 2000, intact.

## [0.5.1] — 2026-11-13

### Changed
- **The Claude Code plugin is now the `plugin/` folder**: agents, commands and skills only — Markdown and a manifest, no `bin/` and no code, so the plugin directory accepts it from any publisher. It is generated by `npm run build:plugin` (a test fails when it is out of date). The marketplace points at `./plugin`; the root `.claude-plugin/plugin.json` is gone.
- The `facet` command comes from npm: `npm i -g facetkit`, or the agents and commands run `npx --yes facetkit` when `facet` is not on the PATH. Every agent and command says so; inside `plugin/` every launcher is pinned to the release (`npx --yes facetkit@0.5.1`), because the directory blocks an unpinned `npx`.
- `/facet-item`: when the agent tool can only run agents in the background, the coordinator waits for the completion notice and then runs `flow end` and `flow next` in the same turn; it never waits for a separate token report (`facet cost import` fills the gaps).
- Team rules: an agent compares its handoff with the template before reporting `DONE`. The proof template lists the allowed rework causes and says that the commit and the progress record are later steps of the flow, not fixes.

### Fixed
- `facet scan` no longer blocks on removing a forbidden path from the repository (`git rm`, or `git rm --cached` with the file ignored) — that is what the rule asks for. Editing or adding the path, or untracking it without ignoring it, still blocks.
- An assist no longer finishes the helper's own step: after a rework, an inspector called to unblock another step left the proof of the round looking done.
- `facet flow verdict` refuses until the judging step and every step before it are done in the current round; a forced verdict is recorded and fails `no-forced-steps`.
- `facet flow next` on an interrupted gates step names the gate agents instead of "Call undefined", and a blocked gates step is named in the question to the user instead of "undefined".
- `/facet-item` calls each agent in the foreground and waits for it: a background call ended the coordinator's turn and the flow stalled after every step.

## [0.5.0] — 2026-11-12

### Added
- **The whole team, project-neutral**: nine agent definitions, three commands (`/facet-item`, `/facet-session`, `/facet-retro`), team rules and handoff templates. Agents answer in the language they are addressed in.
- **Claude Code plugin** packaging (`.claude-plugin/`, `bin/facet` on the PATH).
- **`facet init`** (`--minimal`, `--claude`) and **`facet.json`**: configuration no longer needs a `package.json`. A minimal four-step flow preset.
- **Python, Go and Java** in the import graph, seams, atlas, mutation probe and requirement trace (`facetkit/lang`).
- **`facet demo`**: a board from a synthetic journal. **`facet hypotheses`** and `HYPOTHESES.md`: every facet as an untested claim with its trials; `trials/results.json` for reported results.
- `docs/dogfood.md`: the kit's tools run on the kit; tests added for what the mutation probe found.
- Polish README, an animated diagram, `RELEASING.md`, a composite GitHub Action (`action.yml`).

### Changed
- In typed languages the mutation probe uses only type-preserving operators.
- `facet flow next` prints `facet compose …` as the rules of a step when no rendered loadout file exists.

## [0.4.0] — 2026-11-11

### Added
- **Skill intelligence** (`facetkit/skillint`, `facet skill report | coverage | modes`): per facet — exposure, adherence by a declared footprint, effect on the failure modes it guards — with a diagnosis and one action; failure-mode coverage with trials harvested from real incidents; optional seeded withholding of one non-safety rule per step.
- Facet front matter: `guards`, `footprint`, `ablatable`. Every shipped facet names what it guards; `facet audit` checks both fields.
- Every `facet` command used with `--item` is logged in the item's ledger; `step.start` records the facets a step was given.
- `facet flow verdict --fix agent:cause` and `facet retro hindsight --mode` record a failure mode; `"skillint": { "requireCause": true }` makes it mandatory.
- Skill `skill-sense`; a Skills tab on the board.

## [0.3.0] — 2026-11-11

### Added
- **Segmented journal** for many people and teams: a directory in which every writer appends to its own hash-chained file; events are ordered by a logical clock; merging is copying files. Double claims of an item are detected and resolved by `facet flow yield`. The memory store uses the same scheme.
- **Governance as proof-carrying work** (`facetkit/govern`): evidence events recorded by the measuring tools, a declarative policy over the journal, assurance levels L0–L4, human waivers and approvals on record, attestations that can be recomputed (`facet assure`, `waive`, `approve`, `attest`, `trust`). `facet flow close` enforces the policy.
- **Guard calibration** with planted defects (`facet canary`).
- **Security checks** (`facetkit/secscan`, `facet scan`): secrets in added lines, forbidden paths, new dependencies needing approval, dangerous commands in the run ledger, injected instructions in the text agents read.
- **Evidence-based model routing** (`facetkit/router`): cheaper models only where they have earned it, optional probation.
- **Extensions**: modules that add checks, policy rules, a router or commands.
- **Atlas** (`facetkit/atlas`, `facet atlas`): exports, named imports, tests behind a file, hidden coupling from git history, hot spots, word-budgeted cards.
- **Board** (`facet board`): the whole system on one self-contained HTML page.
- Skill `assured-work`; repository files for release.

### Changed
- `facet journal` reports segments and conflicts; "one item at a time" now holds per writer.
- Memory is append-only (uses, credits and retirements are lines), so it merges without conflicts.

## [0.2.0] — 2026-11-11

### Added
- The journal and everything computed from it: orchestration (`facet flow`), resume cards and checkpoints (`facet note`), territory-bound memory (`facet mem`), timeline and anomalies, cost by step (`facet cost`), the agent × model matrix with replays (`facet eval`), belief-based retrospectives with hindsight (`facet retro`), session schedule (`facet plan`).
- Skills `journal-flow`, `earned-memory`, `hindsight-retro`.

## [0.1.0] — 2026-11-11

### Added
- Facets, loadouts and `facet compose` / `render` / `audit`.
- Tools: `run`, `read`, `ledger`, `capsule`, `mutate`, `seams`, `trace`, `receipt`, `ui`.
- Skills `spec-trace`, `falsifiable-tests`, `slice-seams`, `thrift-loop`, `anchored-handoff`, `doc-receipts`, `evidence-browser`, `claim-ledger`, `facet-forge`.
- Agent definitions `spec-falsifier` and `facet-warden`.
