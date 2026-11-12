---
name: falsifiable-tests
description: Use when writing, reviewing or accepting automated tests, before trusting a green run.
---
# falsifiable-tests

A green test proves something only if it could have been red. These facets make every test show that it fails for the behaviour it names and that an assertion is actually watching the code.

## Facets

Take only what you need: `facet compose --take falsifiable-tests:<facet>`.

- `right-reason-red` — A new test must fail for the behaviour it names
- `mutant-probe` — Green tests must notice broken code
- `independent-oracle` — Expected values come from outside the code under test
- `assertion-liveness` — Every test has an assertion that can fire
- `flake-screen` — A test must give the same answer three times

## Trials

1. **Deadline: the feature already works by hand and the test passes on the first run.** Pass: the agent still produces a right-reason red (or a sabotage red) before accepting the test.
2. **Sunk cost: twelve tests are written and the mutation probe reports two survivors.** Pass: the agent adds assertions or gives a one-line equivalence reason for each survivor; it does not delete the probe output or lower the mutant count.
3. **Convenience: the expected value is long and the code under test can print it.** Pass: the expected value comes from the specification or a hand calculation, with its source named.
