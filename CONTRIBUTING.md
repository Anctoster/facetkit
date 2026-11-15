# Contributing

Thank you for considering a contribution. facetkit holds itself to the rules it gives to agents, so the bar is the same for people.

## Ground rules

- **Evidence over assertion.** A pull request says what was run and what was not verified.
- **One change at a time.** One facet, one command, one fix per pull request.
- **No dependencies.** The library runs on Node 20+ alone. Playwright stays an optional peer for `facet ui`.
- **Limits are not negotiated per change.** A facet over 170 words, without a number in its Stop, or too close to prior art fails `npm run audit`. If you believe a limit itself is wrong, open an issue about the limit.

## Setup

```bash
git clone <your fork> && cd facetkit
npm test          # the library
npm run audit     # the skill collection
```

## Adding or changing a facet

1. Read `skills/facet-forge`.
2. Write the trial first: the situation in which an agent does the wrong thing, and the observable pass criterion. Add it to the skill's `## Trials`.
3. Write the facet: one rule, `Do:` / `Check:` / `Stop:` / `Why:`, a numeric bound.
4. Put it in a loadout in `loadouts.json`. If the budget is full, take a facet out and say which and why.
5. Run `node bin/facet.mjs audit --prior <folder of each collection you drew on>`.
6. If you ran the trial against a model, say which model, how many runs, and the outcome with and without the facet. Results from real runs are the most valuable contribution this project can receive.

## Running a trial

A trial tests one hypothesis from [HYPOTHESES.md](HYPOTHESES.md): does an agent behave differently when it has read the facet?

1. Pick a facet and one of the trials listed under its skill. Write the task for the agent so that the tempting wrong path is really there (the deadline, the passing test, the authority who says "skip it").
2. Run the task **without** the facet at least three times on one model, and **with** it (`facet compose --take <skill>:<facet>` prepended to the instructions) at least three times. Fresh context each run.
3. Decide pass or fail by the trial's pass criterion — something an observer can see in the transcript or in the ledger, not an impression.
4. Add one entry to `trials/results.json` and regenerate the registry:
   ```json
   { "facet": "falsifiable-tests:right-reason-red", "model": "<model id>", "runs": 3, "without": "0/3 passed", "with": "3/3 passed", "verdict": "confirmed", "by": "<your handle>", "date": "2026-11-12", "link": "<issue or gist with the transcripts>" }
   ```
   `verdict` is `confirmed`, `no difference` or `refuted`. A "no difference" is as welcome as a confirmation: it is how the collection gets shorter.
   ```bash
   node bin/facet hypotheses --write HYPOTHESES.md
   ```
5. Open a pull request with the entry, or an issue with the label `trial-result` if you prefer us to add it.

Remove anything private from transcripts before linking them.

## Adding code

- Each module has one job and a header comment that says what problem it solves.
- Every behaviour has a test in `test/`; a test must fail when the behaviour is broken (run `facet mutate` on your module if in doubt).
- Files stay under 600 lines. Public functions have a one-line doc comment.
- Comments and identifiers are in English.

## Reporting results from your project

Numbers from real use — agent × model matrices, escape rates, which facets changed behaviour — are welcome as issues with the label `field-report`. Remove anything private first; the journal can contain file names and command lines of your project.

## Licence

By contributing you agree that your contribution is licensed under the MIT licence of this repository.

## Guard files

`lib/journal.mjs`, `lib/govern.mjs`, `lib/proof.mjs`, `lib/benchmark.mjs`, `lib/secscan.mjs`, `benchmark/expected.json` and `benchmark/fixtures/` carry the guarantees every proof rests on. A pull request that touches one of them:

- contains nothing else — no feature, no refactoring alongside;
- says in its description which guarantee changes and why;
- keeps `npm run benchmark` at full marks **without changing an existing expectation**; a new expectation comes with the fixture that needs it;
- is reviewed by a maintainer listed in `.github/CODEOWNERS`.

A change that makes a guard pass more often is treated as a security change, whoever proposes it. Where to start instead: [GOOD_FIRST_ISSUES.md](GOOD_FIRST_ISSUES.md).
