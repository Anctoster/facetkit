# Architecture in one page

The full description is [docs/architecture.md](docs/architecture.md). This page is the map.

```
            what happened                    what it proves                 what was learned
  ┌──────────────────────────┐   ┌────────────────────────────┐   ┌─────────────────────────────┐
  │ journal.mjs  append-only │──▶│ govern.mjs   rules, levels │──▶│ intelligence.mjs experiments│
  │   hash chain, lock, ids  │   │ proof.mjs    packs, decay  │   │ hypothesis.mjs  verdicts    │
  │ flow.mjs     next step   │   │ trustgraph.mjs weakest link│   │ cognition.mjs   lessons     │
  │ planner.mjs  route, owners│  │ benchmark.mjs guards tested│   │ evolve.mjs / heal.mjs       │
  └──────────────────────────┘   └────────────────────────────┘   │ economy.mjs     cost, return│
                                                                    └─────────────────────────────┘
```

**Module boundaries**
- Everything reads the journal; only `journal.mjs` writes it. No module keeps state of its own that the journal could not rebuild.
- `lib/` modules are pure functions over events and files; `bin/ops.mjs` is the only place that wires them to the command line and the project's settings.
- Nothing in the right-hand column may change the left-hand or middle column's behaviour except through recorded events (`learn`, `heal`, `facet.adopt`) made by a named person or a bounded, reversible remedy.

**Guard files** — `lib/journal.mjs`, `lib/govern.mjs`, `lib/proof.mjs`, `lib/benchmark.mjs`, `lib/secscan.mjs`, `benchmark/expected.json`, `benchmark/fixtures/`. They carry the guarantees. They have owners (`.github/CODEOWNERS`), a change to them is reviewed on its own, and it must keep `npm run benchmark` at full marks without editing an expectation to make it pass.

**Domains** — `domains/viz`, `domains/arch`: the same method for work that is not code. Each is a self-contained plugin: one journal engine (`vizflow.py` / `archflow.py`, the same file) configured by a `domain.json`, plus the domain's own checking tools.
