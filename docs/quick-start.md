# Quick start

[🇬🇧 English] | [🇵🇱 Polski](quick-start.pl.md) · Next: [Project integration](project-integration.md) → [GitHub integration](github-integration.md)

Ten minutes, your own code, no agents and no configuration. You will see what FacetKit measures before you decide how much of it you want.

You need Node.js 20 or newer and a git repository. FacetKit itself has no dependencies.

## 1. Run it

```bash
npm i -g facetkit        # or put "npx facetkit" wherever this guide says "facet"
cd your-project
```

## 2. Check one change

Change something in your code — or use a change you already have — and run:

```bash
facet ci-verify --test-cmd "npm test"     # your own test command: pytest -q, go test ./..., mvn -q test …
```

This is the same check the GitHub Action runs on a pull request, here on your uncommitted changes:

| Level | Means |
|---|---|
| **L1** | the security scan found no secret, forbidden file or injected instruction in the change |
| **L2** | your tests pass |
| **L3** | FacetKit broke the changed lines on purpose (mutants) and your tests noticed at least 80 % of the breakages |

L2 says the tests are green. L3 says they would have noticed if the change were wrong — that is the difference FacetKit is about. The report lists every mutant nobody noticed (`survived: src/price.ts:14`): each one is a test that is missing.

To check committed work instead, give the commit it starts from: `facet ci-verify --base main`.

## 3. The tools one by one

Each runs on its own, with no setup:

```bash
facet scan                                                  # what the working tree would fail on: secrets, forbidden paths, injected text
facet mutate --files src/price.py --test "pytest -q tests/" # which deliberate breakages no test notices
facet seams --changed src/price.py                          # who depends on this file, and which tests cover them
facet trace --spec SPEC.md --tests tests                    # requirements no test verifies
facet atlas hotspots                                        # files edited often, depended on by many, with few tests behind them
```

They understand JavaScript/TypeScript, Python, Go and Java. Each exits non-zero when it finds a problem, so any of them can go into a script or a CI step as it is.

## 4. See the rest without risk

```bash
npx facetkit demo        # a board built from synthetic data: what a team looks like after a few weeks
```

## Where to go next

- **Keep using the tools only** — nothing more is needed. Put `facet ci-verify` into CI: [GitHub integration](github-integration.md).
- **Give your own agent a rule** or **run only the agents you want**: [Project integration](project-integration.md).
- **How far a result can be trusted** (levels, proof packs, witnesses): [Governance](governance.md).
