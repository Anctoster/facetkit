# Governance: proof-carrying work

Most governance for agents asks "is this action allowed?" at run time. facetkit asks a different question at the end of a piece of work: **"what does the record support?"** — and refuses to close the work when the answer is below what the project requires.

## Evidence

Evidence is an event `{ kind: "evidence", item, name, ok, value }`. It is written by the tool that measured it:

| Evidence | Written by | Means |
|---|---|---|
| `scan` | `facet scan`, and always by `facet flow close` | no secret, forbidden path, dangerous command or injected instruction in what the item changed and did |
| `trace` | `facet trace --spec … --tests …` | every specification clause is claimed by a test; no test claims a clause that does not exist |
| `mutate` | `facet mutate …` | the share of deliberate breakages of the changed code that the tests noticed |
| `neighbours` | `facet run --evidence neighbours -- <tests>` | the tests of neighbouring code ran green after the change |
| `ui` | `facet ui URL --budget …` | the page is within its budgets |
| any name | `facet check <name>` | a command you configured under `govern.checks`, or a check from an extension |

Evidence recorded **before the last producing step ended** is stale and does not count (except evidence that is about the time before the change, such as a red test). An agent cannot make evidence true by writing a sentence; it has to run the tool.

## Facts

Facts are derived from the journal alone: the last verdict; whether the agent that judged also produced (`independent`); how many steps were forced out of order; how many waivers; whether the journal is intact; whether approvals are missing; whether configured checks failed.

## Policy

A policy is a list of rules. A rule names a fact or one-of several pieces of evidence, the condition, and the assurance level it belongs to:

```json
{ "id": "falsified", "level": 3, "evidence": ["mutate"], "min": 0.8, "why": "…" }
{ "id": "independent", "level": 1, "fact": "independent", "equals": true, "why": "…" }
{ "id": "specified", "level": 2, "evidence": ["trace", "accept"], "ok": true, "when": { "route": "spec-falsifier" } }
```

The default policy is in `lib/govern.mjs`; `examples/policy.json` shows a stricter one. Point `"govern": { "policy": "policy.json", "required": 2 }` at your own.

## Assurance levels

| Level | Name | The record shows |
|---|---|---|
| L0 | claimed | agents reported the work done |
| L1 | reproduced | an agent that did not produce the work re-ran the checks and passed it; no step was skipped; the history is intact; the scan is clean; needed approvals exist |
| L2 | specified | every requirement is claimed by a test or scenario; the project's own checks pass on the final state |
| L3 | falsified | at least 80 % of planted breakages of the changed code were noticed; neighbouring tests ran |
| L4 | calibrated | nothing was waived, and the guards themselves have been shown to catch planted defects |

A level is the highest one whose rules — and those of every level below — all hold. **A level states which evidence exists. It is not a statement that the evidence is sufficient for your risk**, and it says nothing about defects no check was looking for.

## Waivers and approvals

- `facet waive <rule> --reason "…" --by <person>` records a human decision to close despite a failed rule. The gate opens; the level does not rise; the waiver appears in the attestation and in `facet trust`.
- `facet approve <what> --by <person>` records the approval a scan asked for (for example a new dependency).

Test fixtures that contain look-alike secrets are excluded with `"govern": { "scanIgnore": ["test/fixtures/**"] }`, or line by line with the marker `facet:allow-secret`. Forbidden paths are checked regardless.

Agents are instructed never to issue either on their own (`assured-work:waiver-is-a-record`).

## Attestation

`facet attest --item <id>` prints a JSON record: the level, each rule with what was found, evidence, waivers, approvals, commits, and a digest. `facet attest --verify <file>` recomputes it from the journal. With `"govern": { "attestations": "attest" }` one is written at every close. It is a digest, not a signature.

## Trust in the team

`facet trust` reports the track record: closed items by level, the share that needed a fix later (from `facet retro hindsight --record`) **with an upper bound**, first-pass share, waivers, forced steps.

It also answers the question a PASS depends on — *do the guards catch anything?* — by experiment:

```bash
facet canary run --files src/price.ts --test "npm test -- price"     # tests as the guard
facet canary plant --files src/price.ts                              # then run an agent guard as usual…
facet canary reveal --guard proof-inspector --caught yes             # …and record whether it noticed
```

A guard that has never been shown a planted defect has an unknown catch rate, and `facet trust` says so.

## Unknown, stale and proof packs (0.6.0)

- **Unknown does not pass.** A fact nobody established — the journal's integrity when nobody verified it — fails its rule and is shown as `UNKNOWN`. A waiver accepts a *known* failure; it does not open the gate for an unknown, and it never raises the level.
- **Evidence belongs to a source state.** `facet` records with every piece of evidence a hash of the working tree's content (records under `.work/` and `.facet/` excluded). Evidence measured on another state is stale. Any edit invalidates everything: conservative by design. Settings: `"govern": { "source": "off" }` to return to time-only staleness, `"sourceIgnore": ["docs/**"]` for paths that are not sources.
- **Proof pack.** `facet proof create --item ID` writes `.work/<ID>/proof/manifest.json`: the source state (commit, tree, uncommitted files with hashes), the policy hash, every rule with its outcome, the evidence with its origin, one digest over all of it. `facet proof verify` answers `VALID`, `STALE` (the sources moved on), `TAMPERED` (the manifest was edited), `MISMATCH` (the journal no longer supports it) or `UNKNOWN` (the journal could not be verified). The same sources and the same journal give the same answer on another clone.
