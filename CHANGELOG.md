# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [0.6.0] — 2026-11-15

### Added
- **Journal writer protocol.** Appends run under one lock per journal (exclusive-create lock file with owner, takeover of a dead owner's lock, a bounded wait). `verifyJournal` now checks structure as well as the hash chain — sequence numbers, the logical clock, the writer of each segment, lines cut off mid-write — and answers with a single `intact`. `facet journal repair` sets a torn tail aside in `<segment>.torn`; nothing is repaired silently.
- **Proof packs** (`facet proof create|verify|status`, `facetkit/proof`): one manifest per item tying its rules and evidence to a source state — a hash over the content of the working tree, unchanged by a commit of the same content, changed by any edit. Verification answers VALID, STALE, TAMPERED, MISMATCH or UNKNOWN and is reproducible on another clone.
- **Source-bound evidence.** Every evidence event records the source state it was measured on; evidence from another state is stale (conservative invalidation). `govern.source: "off"` restores time-only staleness; `govern.sourceIgnore` lists paths that are not sources.
- **Experiments** (`facet experiment new|start|stop|report|arm`, `facetkit/experiments`): manifests in `trials/experiments/`, seeded assignment recorded on `step.start`, held-equal model and task class, Wilson intervals with a Bonferroni correction, and exploratory → confirmatory → validated stages.
- **Facet Intelligence Engine** (`facet intel design|start|stop|report|size`, `lib/intelligence.mjs`): multi-arm designs (facet off / on / candidate wording / another model / another position), permuted-block assignment inside strata of role, task class and difficulty, six outcomes read from the journal (clean close, errors, false passes, retries, tokens, minutes), a seeded stratified permutation test with bootstrap intervals, Holm correction, a floor of 30 units per arm and `intel size` for the planned number. Measured on simulated journals: 5 false alarms in 100 experiments where the facet does nothing; a halved failure rate found in 76 of 100 at 75 units per arm and in 22 of 100 at 30.
- **Skill evolution** (`facet evolve scan|list|test|adopt|reject`, `lib/evolve.mjs`): recurring causes → the guarding facet → delivered? followed? → one of six diagnoses (create, load, instrument, reword, change, to-tool) → a proposal → an experiment → adoption only on a confirmed, favourable result and only with `--by`.
- **Route planner** (`facet route`, `lib/planner.mjs`): file classes, dependents from the import graph, owners and their order of work, a risk score with reasons, optional agents chosen by risk, skippable steps for pure documentation or style, and locked security gates. On seven scenarios: fixed route 79 agent calls with 8 unneeded; by file class only 52 calls with 1 required agent missed; adaptive 54 calls, none missed, none unneeded.
- **Trust decay** (`facet proof decay`, `facet check --stale`): per-check scopes (`covers` plus import closure), evidence bound to its scope digest, per-state snapshots, blind spots named.
- **Ownership** (`facet owners`, `facetkit/ownership`): most-specific-pattern resolution, with unowned files, equal claims and foreign edits refused.
- **Guard benchmark** (`facet benchmark [--write]`, `facetkit/benchmark`): adversarial fixtures under `benchmark/fixtures`, expectations in `benchmark/expected.json`, results per version in `benchmark/results/`, regressions named.
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
