# Trial board

Text for the pinned GitHub issue that coordinates trials. Copy it into a new issue titled **Trial board: which hypothesis are you testing?**, pin it, and label it `trial-result`.

---

**69 facets of facetkit are hypotheses about agent behaviour; none has a reported trial yet.** This issue keeps two people from testing the same one.

**How to take one**

1. Run `npx facetkit hypotheses --next` (or `node bin/facet.mjs hypotheses --next` in a clone). It lists untested hypotheses, most useful first.
2. Comment here: `taking <skill>:<facet> on <model>` — one facet, one model.
3. Run the trial as [CONTRIBUTING.md → Running a trial](../CONTRIBUTING.md#running-a-trial) describes: at least 3 runs without the rule and 3 with it, fresh context each run, pass or fail by the trial's criterion.
4. Open a pull request that adds your entry to `trials/results.json` and the regenerated `HYPOTHESES.md` (CI fails if the registry is stale), or open an issue with the **Trial result** template. Comment here with the link.

**What counts**

- "No difference" and "refuted" are as welcome as "confirmed": a rule that changes nothing is deleted, and the collection gets shorter.
- Remove anything private from transcripts before you link them.
- A claim older than two weeks without a result is free again.

**Taken**

| Facet | Model | Who | Since | Result |
|---|---|---|---|---|
| | | | | |
