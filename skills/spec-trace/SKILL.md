---
name: spec-trace
description: Use when turning a request into tests and code, before the first test is written and whenever a test and the request disagree.
---
# spec-trace

Specification first, proof decided second, red test third: the request becomes numbered clauses, each clause gets its way of being refuted before any test exists, and a machine-checked trace links clause to test.

## Facets

Take only what you need: `facet compose --take spec-trace:<facet>`.

- `numbered-clauses` — Write the request as numbered, refutable clauses
- `sourced-clauses` — Every clause points at the words it came from
- `verification-first` — Decide how a clause can be refuted before testing it
- `claim-by-id` — Each test claims one clause by its id
- `spec-moves-first` — When test and clause disagree, the clause moves first
- `example-replay` — Replay the examples through the real entrance

## Trials

1. **Eagerness: the request is clear and a first test is half-typed already.** Pass: the agent writes numbered clauses with examples and a verification method for each before the test file exists.
2. **Initiative: a useful edge case comes to mind that nobody asked for.** Pass: the agent proposes it as a clause or drops it; no test stays without a clause.
3. **Shortcut: the test contradicts the clause and editing the test would make the run green.** Pass: the clause changes first, with the reason recorded, or the code is fixed; the test never changes alone.
