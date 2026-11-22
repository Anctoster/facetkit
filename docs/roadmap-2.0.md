# From 0.7 to 2.0 — strategic plan

**Where facetkit should be at 2.0:** a team of agents whose results come with proof that a third party can check, whose rules are kept or removed by measurement, and which learns from its own record and from other projects' — without a model judging the work and without a person having to trust anybody's word.

Six capabilities carry that goal. Each section says where it stands at 0.7, what 2.0 means for it, the steps between, and the number that will show it worked. Dates assume one maintainer with agent help and the roadmap of one web application as the first field project; they move if the field data says so.

## Calendar

| Version | Target | Theme | Field gate (what must be true before release) |
|---|---|---|---|
| 0.7.0 | 2026-11-16 | Trust foundations | 185 tests, 22/22 benchmark cases; signatures, witnesses, fencing, source state, environment |
| 0.7.1 | 2026-11-22 | Close the obvious | threat model; CI on three systems, Windows required; journal schema 2; signed, levelled witnesses; trust from a commit; 22/22 benchmark cases |
| 0.8.0 | 2026-12-21 | Measured | ten more items of the first field project closed through the flow; first counterfactual pairs; every guard calibrated at least once |
| 0.9.0 | 2027-02-15 | Adaptive | adaptive routing v2 in use on ≥ 20 items; cost per closed item down ≥ 30 % against P01–P08 at the same level |
| 1.0.0 | 2027-04-26 | Stable | schemas frozen with migrations; three projects besides the first field project; external security review |
| 1.1.0 | 2027-06-28 | Networked learning | knowledge packs from ≥ 5 projects pooled; first rule removed because it helped nowhere |
| 1.2.0 | 2027-08-30 | Architecture that keeps its shape | fitness rules proposed from history and accepted on ≥ 2 projects |
| 1.3.0 | 2027-10-25 | Portable trust | a proof bundle from one organisation accepted by another's CI without contact |
| 2.0.0 | 2028-01-17 | Self-improving team | the team proposes, tests and — with a person's approval — adopts changes to its own rules, end to end, on real work |

## 1. Adaptive orchestration

**At 0.7.** The route grows while an item runs: re-planning of the changed files adds agents and gates; recurring causes reinforce the next agent; weak records escalate its model. It never removes anything.

**At 2.0.** The route is a policy learned from the team's record: which steps an item of this risk and this class needs, on which model, at what cost — and the evidence for every shortening of it.

| Step | Version | What |
|---|---|---|
| Cost-aware routing | 0.8 | a token budget per item from its risk; a step that would exceed it is escalated to a person, not run |
| Learned shortening | 0.9 | a step may be skipped for a class of items only where counterfactual replays show it changes nothing (≥ 10 pairs, sign test), and never a gate or the verdict |
| Parallel steps | 0.9 | steps with disjoint ownership and no dependency run at the same time; the journal orders their events |
| Route policy per project | 1.2 | the planner's weights fitted to the project's own rework and escape record, with the fit and its error shown |
| Multi-team routing | 2.0 | items that cross team boundaries are split by ownership and joined by contract tests |

**Measure.** Tokens per closed item at the same assurance level; rework cycles per item; escapes per item (must not rise).

## 2. Counterfactual replay

**At 0.7.** `facet cf`: a finished step is re-run from its snapshot with and without one rule; pairs decided by a sign test. Manual: the coordinator runs the agent in the worktree.

**At 2.0.** Every rule has a measured effect from replays of real work, refreshed when the model changes; rules that may never be withheld from live work are measured this way at no risk to it.

| Step | Version | What |
|---|---|---|
| Snapshots by default | 0.8 | `eval.snapshot` on for build and red; snapshots kept as hidden refs, pruned by age |
| Replay runner | 0.8 | `facet cf run` drives the agent call through the same harness as the flow (Claude Code headless), so a pair is one command |
| Model drift | 0.9 | when the model of a role changes, the replays of its most-used rules are queued again |
| Replay of whole items | 1.1 | an item re-run end to end under another route or model, for route policies |
| Cost accounting | 1.1 | replay spend tracked apart; a monthly budget the user sets |

**Measure.** Share of facets with ≥ 10 pairs; agreement between replay effects and live-experiment effects where both exist.

## 3. Architecture fitness functions

**At 0.7.** `facet fitness`: forbidden imports, layers, cycles, size, fan-in, untested modules, as a ratchet; evidence `fitness`.

**At 2.0.** The architecture is described by rules that were mostly proposed from the project's own history, checked on every change, and connected to the route: a change that breaks a boundary gets the architect.

| Step | Version | What |
|---|---|---|
| Fitness in the policy | 0.8 | `fitness` evidence required at L2 where rules exist; the planner adds the architect when a change touches a boundary |
| Contract rules | 0.9 | rules for public interfaces: an exported signature changes → its consumers' tests are required |
| Proposed rules | 1.2 | hidden coupling, cycles that formed, layers that eroded — turned into proposed rules with the commits that show them |
| Trend | 1.2 | violations over time per rule on the board; a rule that never fires is retired like an unused facet |

**Measure.** New violations per month; time from a proposed rule to its acceptance or rejection; share of rework caused by "architecture".

## 4. Cognitive memory

**At 0.6/0.7.** Lessons from judged hypotheses with recomputed confidence; facts anchored to code; imported lessons start low.

**At 2.0.** Memory with three layers that behave like their names — episodes (the journal), knowledge (anchored facts, lessons) and skills (facets) — with consolidation between them and forgetting that is measured.

| Step | Version | What |
|---|---|---|
| Consolidation | 0.9 | facts recalled and credited in ≥ 3 items become a proposed lesson; lessons confirmed across ≥ 2 projects become a proposed facet |
| Conflict detection | 0.9 | two memories that give opposite advice for one situation are shown together, never silently ranked |
| Calibrated forgetting | 1.1 | the half-life of a lesson fitted to how often lessons of its kind stopped helping |
| Memory budget per step | 1.0 | what an agent recalls is priced like a facet: words against measured help |

**Measure.** Share of recalled memories credited as helpful; stale memories caught by anchors before use.

## 5. Trust graph

**At 0.7.** Agents per model, judges and tools rated by their record (Wilson lower bound); witnesses count for and against checks; a result is as trusted as its weakest support.

**At 2.0.** Trust that travels: a result from another team or project carries its graph — signed, with the environment and the benchmark of its guards — and the receiver decides by its own policy how much of it to accept.

| Step | Version | What |
|---|---|---|
| Witnesses in CI | 0.8 | the CI re-runs the checks of every closed item and signs as witness (role `witness`) |
| Calibration in the graph | 0.8 | `facet canary` results weigh judges and tools; an uncalibrated guard caps the result |
| Trust decay with time and model change | 0.9 | old observations count less; a model change halves an agent's record on the old model |
| Portable trust | 1.3 | proof bundles with the graph excerpt they rest on; a receiving policy can say "accept L2 from keys of org X with calibrated guards" |

**Measure.** Escapes among results above a trust threshold against below it — the graph must separate them.

## 6. Cross-project learning

**At 0.7.** Knowledge packs: per-facet numbers, counterfactual summaries, hypothesis verdicts and lessons — no file names, no handoff text; imported lessons start low; pooled effects with the disagreement shown.

**At 2.0.** An open, signed registry of what rules do on real projects, read by every installation as priors, never as orders.

| Step | Version | What |
|---|---|---|
| Context descriptors | 0.9 | packs describe the project's shape (languages, size, test style, models) so pooling can be restricted to similar projects |
| Registry | 1.1 | packs published as signed files in a public repository; `facet learn pull` fetches and verifies them |
| Hierarchical pooling | 1.1 | effects estimated per context with partial pooling, so a small project borrows strength without being overruled |
| Shared rule removal | 1.1 | a facet that helped nowhere across ≥ 5 projects is proposed for retirement in the kit itself |
| Privacy review | 1.0 | a pack is checked by `facet scan` rules for names and paths before it leaves the project |

**Measure.** Number of independent packs; facets whose pooled effect is known; rules added or removed from the kit because of pooled evidence.

## What stays the same until 2.0

- No model judges the work. Models do the work; tools and people judge it.
- No runtime. Every command reads the journal, computes and exits.
- No dependency in the core. Optional parts (tree-sitter parsers, a replay harness) stay optional.
- A person adopts every change to the rules, and every exception carries their name.

## Risks

| Risk | Sign | Answer |
|---|---|---|
| Too little field data to measure rules | facets stay "thin" after 0.8 | counterfactual replays first; experiments only where volume allows |
| Coordinator cost stays high | orchestration share > 50 % at 0.9 | move the loop into `facet drive` (a headless runner) so the coordinator is a script, not a model |
| Complexity drives users away | issues about "how do I start" | `facet init --minimal`, `facet explain`, one guide per role; every new command must answer a question someone asked |
| Signatures give false comfort | packs trusted because signed | documentation and output say "attributable, not true"; witnesses and calibration stay required for L4 |
