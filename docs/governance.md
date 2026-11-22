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

## Criteria (0.8)

"Done" is a list of numbered criteria in the brief — in the core, a `criteria` block in the order handoff (`templates/order.md`); in the domains, in `brief.md`. Each criterion has four fields:

- `id` — a number that does not change until the item closes (`A3`);
- `text` — what is true when it is met;
- `check` — a registered tool with a threshold (`unit`, `scene_checks terrain.holes = 0`), or `[user]` when only the requester can judge;
- `by` — the step that must make it true. An optional `chain` names where the value comes from, source first.

The gate refuses a criterion with neither a check nor `[user]`, and more than three `[user]` criteria. It is applied by `facet criteria check`, and by `flow end` of any step whose handoff carries the block. `facet criteria approve --by <person>` records the list with its hash. Changing the list afterwards needs a new approval: `facet criteria check` exits 1 while the brief differs from the approved list. Registered tools are the configured `govern.checks`, the tools that record their own evidence (`scan`, `trace`, `accept`, `mutate`, `neighbours`), and `criteriaTools` in the project settings.

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

A rule can ask for a minimum **isolation** of the evidence at a level: `{ "id": "isolated", "level": 4, "fact": "isolation", "atLeast": "ci" }`.

- The order is `none` < `declared` < `container` < `ci`; a `declared:<name>` sandbox counts as `declared`.
- The fact is the weakest isolation among the item's current evidence.
- Evidence that does not say how it was isolated (recorded before 0.8, or imported from a domain journal) makes the fact unknown, and unknown does not pass.
- The default policy asks for no isolation.
- A proof pack names the isolation it was made in and marks a declared one.

## Assurance levels

| Level | Name | The record shows |
|---|---|---|
| L0 | claimed | agents reported the work done |
| L1 | reproduced | an agent that did not produce the work re-ran the checks and passed it; no step was skipped; the history is intact; the scan is clean; needed approvals exist |
| L2 | specified | every requirement is claimed by a test or scenario; the project's own checks pass on the final state |
| L3 | falsified | at least 80 % of planted breakages of the changed code were noticed; neighbouring tests ran |
| L4 | calibrated | nothing was waived, and the guards themselves have been shown to catch planted defects |

A level is the highest one whose rules — and those of every level below — all hold. **A level states which evidence exists. It is not a statement that the evidence is sufficient for your risk**, and it says nothing about defects no check was looking for.

## The environment of commands

Checks, decision measures, bug reproductions, `facet run`, `facet eval judge` and the test command of `facet mutate` run with part of the environment only: the variables in `BASE_ENV` — `PATH`, `HOME`, `USERPROFILE`, `TEMP`, `TMP`, `LANG`, `SYSTEMROOT`, `COMSPEC`, `PATHEXT`, `TERM` — and the ones the project names (toolchain homes such as `JAVA_HOME` or `VIRTUAL_ENV`, proxies, `TMPDIR` on macOS):

```json
"govern": { "env": ["HTTPS_PROXY", "NODE_OPTIONS", "npm_config_*"] }
```

Some toolchains need more on Windows: Go keeps its build cache under `LOCALAPPDATA` (name it, or `GOCACHE`), npm its cache under `APPDATA`. A name ending in `*` is a prefix. On Windows names compare without case. There is no way to pass everything: `govern.env` must be a list. `FACET_KEY`, `FACET_KEYS` and `FACET_WITNESS_KEY` are never passed.

## Isolation

Every piece of evidence records how far the process that measured it was kept from the developer's machine (`isolation`):

| Value | When |
|---|---|
| `ci` | the environment says it is a CI run (`CI` is set) |
| `container` | the process runs in a container: `/.dockerenv`, `/run/.containerenv`, or a container runtime named in `/proc/1/cgroup` |
| `declared:<name>` | neither is visible, and the project says it runs in `<name>`: `"govern": { "isolation": "claude-code" }`. Use this for a sandbox that does not show itself. It is marked as declared, not observed |
| `none` | nothing of the above |

"Observed" means what the environment says about itself: a `CI` variable can be set by hand. Where that matters, ask for a witness in CI (its record is signed) rather than for an isolation value.

## Waivers and approvals

- `facet waive <rule> --reason "…" --by <person>` records a human decision to close despite a failed rule. The gate opens; the level does not rise; the waiver appears in the attestation and in `facet trust`.
- `facet approve <what> --by <person>` records the approval a scan asked for (for example a new dependency). A file the scan could not read (`not-scanned:<file>`) is taken off only with a reason: `--note "…"`; until then the item does not close, whatever level is required.

**Signed events.** `govern.signEvents` is `"off"` (the default), `"on"` — every event this machine writes is signed when it has a key — or `"required"`: every schema-2 event must be signed by a key the project trusts, an unsigned one makes the journal `tampered`, and a machine without a key writes nothing. `facet journal` prints the number of such events on a line of its own.

Test fixtures that contain look-alike secrets are excluded with `"govern": { "scanIgnore": ["test/fixtures/**"] }`. The marker `facet:allow-secret` counts only in a path listed there, which is not searched anyway; anywhere else it is a blocking `allow-outside-ignore` finding with its line number, and the line is searched like any other. Forbidden paths are checked regardless.

Agents are instructed never to issue either on their own (`assured-work:waiver-is-a-record`).

## Who stands behind a proof

`facet proof create` writes a proof pack: the level, every rule with what was found, the evidence with the source state and the environment it was measured in, the guard benchmark of the tool, a SHA-256 digest — and an Ed25519 signature when this machine has a key.

```bash
facet key new                                   # once per person or CI runner; the private key stays in ~/.facet/keys
facet key trust <public key> --name ann --role witness   # a reviewed change of .facet/trust.json — counts once committed
facet proof create --item P07
facet proof witness --item P07                  # somebody else runs the checks again on the same sources
facet proof verify --item P07
```

**Trust comes from a commit.** The keys a project trusts are read from `.facet/trust.json` as committed at `HEAD`, or at the ref `govern.trustRef` names (for example `origin/main`, the reviewed branch). A key added to the working copy and not committed is not trusted; a key removed and not committed still is. Every run that reads trust says so on stderr when the working copy differs. Outside git the file is read as it is and marked *uncommitted*.

| Status | Means |
|---|---|
| VALID | the pack is whole, signed by a trusted key (or signatures are not required), the sources are the ones proven, the journal still gives the same verdict, and no witness that counts (signed by a trusted witness that did not sign the pack) disagreed |
| STALE / DECAYED | the sources moved on — entirely, or only where some checks reach (`rerun` names them) |
| TAMPERED | the pack does not match its digest, or a signature does not match the pack — it was edited after signing, or the signature was copied |
| UNSIGNED | `govern.requireSignature` is set and no trusted key signed the pack |
| MISMATCH | the journal no longer supports the pack, or a witness got another answer on the same sources |
| UNKNOWN | the journal could not be verified |

## Domain journals (0.8)

The domain plugins (arch-flow, viz-flow) keep their own journal, `journal.jsonl` in the project's `_arch` or `_viz` folder. `facet domain import <journal.jsonl> --domain arch|viz` reads it into the core journal:

- the chain of the domain journal is checked first; an edited, removed, reordered or torn line stops the import with its line number, and nothing is written;
- `--anchor n:hash` — the `ANCHOR` line the domain prints at every close, kept outside the project — must still match, or the history was rewritten after it;
- each line becomes one core event with `src: { journal, n, hash }`, pointing back to it: `open`, `start`, `end`, `evidence` (with the tool's receipt), `waive`, `verdict`, `close`, `sign`, `accept` and `answer` become their core kinds; every other line is kept as `domain.<type>` with its fields under `data`;
- an imported item has the steps of its domain route — from `routes.json` beside the journal, or `--routes <file>`, else the steps the item started — and the step of the inspector (`arch-inspector`, `viz-inspector`) is the one that judges;
- a line already imported (by its hash) is not imported again, so the command can run after every session.

A domain item is then proven on the files its domain declares, not on the git tree: `facet proof create --item D1-02 --domain arch` reads `artifacts` from `domain.json` — beside the domain journal if the project has one there, else the one the kit ships (`work/<ITEM>/**` for both domains) — as globs under the folder of the journal the item came from (`--domain-root DIR` names another), with `<ITEM>` for the item's id in the domain. The files are hashed from disk whether git tracks them or not, the declaration itself is part of the state, and a pattern that matches no file is listed as a blind spot. `facet proof verify` checks the pack against the declaration it carries: an edit to a declared file makes it stale, an edit anywhere else does not.

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

## Trust decay (0.6.0)

Conservative invalidation re-runs everything after any edit. Trust decay narrows that without guessing. A check may declare what it covers:

```json
"govern": { "checks": { "unit": { "run": "npm test", "covers": ["test/**"] }, "lint": { "run": "eslint src", "covers": ["src/**"] } } }
```

Its scope is those files plus everything they import, recomputed on every reading — a new import widens it. Evidence stores the digest of its scope; when the digest still matches, the evidence is fresh however much else changed. `facet proof decay` lists each check as fresh, decayed (with the files that reached it) or unbound, gives the share still standing, and names changed files that no check covers. `facet check --stale` runs only the decayed ones.

Two things keep this from becoming a way to skip work: a check without `covers` stands for every file, and the security scan never declares a scope.
