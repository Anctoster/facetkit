# Architecture

facetkit has three layers and one rule: **state is a log, everything else is a function of it.**

```
 agents and their coordinator            people
        │  facet <command>                 │  facet waive / approve / board
        ▼                                  ▼
 ┌──────────────────────────────────────────────────────────────┐
 │  skills (facets, loadouts)      what agents are told to do   │
 ├──────────────────────────────────────────────────────────────┤
 │  tools (run, trace, mutate, seams, scan, capsule, atlas …)   │
 │         each one measures something and records evidence     │
 ├──────────────────────────────────────────────────────────────┤
 │  journal (append-only, hash-chained, one segment per writer) │
 └──────────────────────────────────────────────────────────────┘
        │ pure functions over events
        ▼
  flow · resume · memory credit · timeline · cost · evaluation
  retrospective · schedule · policy · assurance · trust · board
```

## The journal

An event is one JSON line: `{ at, kind, item?, step?, … , w, n, lc, prev }`.

| Field | Meaning |
|---|---|
| `w` | the writer (a person's machine): `FACET_WRITER`, or OS user + a hash of the host name |
| `n` | the position in the writer's own segment |
| `lc` | a logical clock: one more than the highest clock the writer had seen when appending |
| `prev` | the hash of the previous line of the same segment (`00000000` for the first) |

A journal is either one file (`journal.jsonl`) or a directory (`journal/<writer>.jsonl`, optionally `journal/<team>/<writer>.jsonl`). In a directory:

- **No two clones ever edit the same file**, so any transport that moves files merges journals without conflicts: git, a shared folder, an object store.
- **Order** across writers is by `lc`, then time, then writer. Events of one item are almost always written by one writer, so their order is exact; `lc` only has to keep causality across writers (a close seen before an open that depends on it).
- **Integrity** is per segment: `facet journal` reports the first line of any segment that does not follow its predecessor.
- **Claims.** Opening an item is a claim. Two people who open the same item in separate clones produce a conflict that `facet journal` reports after the merge; the earlier claim wins and the other writer runs `facet flow yield`. "One item at a time" holds per writer.

The memory store follows the same scheme: adding, using, crediting and retiring a memory are each one appended line.

### Scaling notes

Reading the journal is a scan. For thousands of items, archive the segments of closed versions to another directory and point `facet` at both when you need history. For many repositories that share one plan, keep the journal in its own repository (or a submodule) and set `"journal"` to its path. Storage is intentionally plain: if you need a database, `readJournal` and `record` in `lib/journal.mjs` are the only two functions to replace.

## Event kinds

`item.open`, `item.close`, `item.yield`, `step.start`, `step.end`, `note`, `verdict`, `answer`, `evidence`, `waiver`, `approval`, `canary`, `escape`, `signal`, `change`, `snapshot`, `mem.recall`, `eval.replay`.

Every command that reads the journal ignores kinds it does not know, so extensions can add their own.

## Why not a runtime

A runtime that intercepts agent actions has to be trusted, kept running and integrated with every tool an agent uses. A log that is evaluated afterwards has none of these needs, and it leaves something a runtime does not: a record a third person can re-evaluate with a different policy. The price is that facetkit does not prevent an action; it prevents an item from being **closed** on work that does not meet the policy. Use your platform's permissions and sandboxing for prevention.

## Added in 0.6.0

| Module | Role |
|---|---|
| `lib/journal.mjs` | writer protocol: one lock per journal around read-then-append; structural verification; `repairJournal` |
| `lib/proof.mjs` | source state, proof packs, verification |
| `lib/experiments.mjs` | experiment manifests, seeded arms, analysis |
| `lib/ownership.mjs` | who may change which file |
| `lib/benchmark.mjs` | the guards run against fixtures with separately stored expectations |
| `domains/viz/` | the method for architectural visualization: a self-contained plugin with its own journal tool in Python |

The orchestrator still does not plan or decide: ownership and experiments feed the flow, they do not replace it.
