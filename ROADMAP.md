# Roadmap

**What facetkit is for.** Not another way to assemble agents. Infrastructure for building, verifying and governing the evolution of AI engineering systems:

- **Verification** — a result is checked, not believed: evidence bound to the sources it was measured on, a verdict from an agent and a run that did not produce the work, a proof pack anyone can verify from one file.
- **Learning** — what changes how the team works has passed an experiment: hypotheses with computed verdicts, lessons whose confidence follows experience.
- **Governance** — the system changes under rules: unknown is not pass, guard files have owners, nothing is adopted without a named person.

It is meant to sit under other agent tools, not replace them: the proof bundle does not care which framework produced the change.

## The one scenario that must always work

`npm run demo:proof` — an agent changes code → the change is checked by another run → a proof pack ties the verdict to those sources → somebody else verifies it with nothing but one file → the proof stops holding when the code moves, and says TAMPERED when the file was edited. It runs in CI on every commit.

## Now: 0.6.x — a base others can stand on

| | State |
|---|---|
| Journal: one writer at a time, event ids, sessions, diagnostic statuses | done |
| Fail-closed governance, independence by run identity | done |
| Proof packs, trust decay, portable bundles with standalone verification | done |
| Experiments, hypotheses, lessons, trust graph, healing, economy | built and tested on constructed journals; **no result on real work yet** |
| Guard benchmark, nightly mutation probe, CI artifacts | done |
| Domains beyond code: visualization, architectural production | built; domain tools tested, application procedures not yet run on real projects |

Every ticket of the outside review, with its state: [docs/roadmap-0.6.0.md](docs/roadmap-0.6.0.md).

## Next: evidence that it helps

1. **Three pilots**, each one real workflow for a few weeks, each ending in a report with numbers: defects found that ordinary tests missed, share of proof bundles that verify independently, time spent checking.
2. **First real experiments** on five facets, with the sample sizes `facet intel size` asks for.
3. **A verifier with no dependencies** — `verifyBundle` as a single file that runs anywhere, so that checking a proof never requires installing facetkit.
4. **Adapters**: a GitHub Action that attaches the proof bundle to a pull request; export of bundles for other agent frameworks.

## Later

- Proof bundles signed by the run that made them.
- Domains as first-class packs: one engine, a `domain.json`, domain tools (see `domains/`). Architecture is the first non-code domain where the full chain — variants, model, drawings, quantities, schedule — can be evidenced.
- A system that proposes changes to its own architecture — only through the same experiment gate as any other change.

## How success is counted

People who ran the demo on their own; independent contributors and how many came back for a second contribution; outside integrations; real projects; defects found that ordinary tests missed; share of proof bundles that passed independent verification. Not stars.
