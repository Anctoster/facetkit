# Good first contributions

Each of these is small, needs no knowledge of the whole kit, and ends in a test. Run `npm test` and `npm run demo:proof` first.

**A test that shows a guard catching something**
1. A journal fixture where two segments carry an event with the same id → `benchmark/fixtures/journal/`, with its expectation.
2. A governance story where evidence is recorded by the producing step instead of the proof step → expectation: not L1.
3. A proof bundle whose `facts` were extended after export → expectation: TAMPERED (there is a unit test; make it a benchmark case).
4. A mutation that survives in `lib/ownership.mjs` — run `facet mutate` on it, then add the assertion that kills it.

**A small tool improvement**
5. `facet proof verify --bundle` : print which rule first differs when the status is MISMATCH.
6. `facet benchmark --trend --json`.
7. `facet journal` : name the event id in every structure message.
8. `facet trustgraph --json`.

**An example**
9. A second demo: `scripts/demo-decay.mjs` — two checks with different scopes, one edit, only one check re-run.
10. A minimal `owners.json` and `facet route` walk-through for a three-folder project.

**Documentation**
11. `docs/proof-bundle.md`: the bundle format field by field.
12. Translate the Quick start into another language (see `README.pl.md`).

**Domains** (Python, no Node needed)
13. `domains/arch`: a check that every zone of `spec.json` lies inside the outline of its story.
14. `domains/viz`: `img_digest.py --json`.

Not good first contributions: anything in the guard files (see ARCHITECTURE.md), new agents, new facets without an experiment design.
