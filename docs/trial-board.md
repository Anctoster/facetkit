# Trial board

Text for the pinned GitHub issue that coordinates trials. It is pinned as [#75](https://github.com/Anctoster/facetkit/issues/75); to start over, copy it into a new issue titled **Trial board: which hypothesis are you testing?**, pin it, and label it `trial-result`.

---

**69 facets of facetkit are hypotheses about agent behaviour; none has a counted trial yet.** This issue keeps two people from testing the same one. One board for all hypotheses — no separate issue per hypothesis. A worked example: [docs/running-a-trial.md](https://github.com/Anctoster/facetkit/blob/main/docs/running-a-trial.md) ([po polsku](https://github.com/Anctoster/facetkit/blob/main/docs/running-a-trial.pl.md)).

**How to take one**

1. Pick a facet: `npx facetkit hypotheses --next` lists untested ones, most useful first (or take any from [HYPOTHESES.md](https://github.com/Anctoster/facetkit/blob/main/HYPOTHESES.md)).
2. Comment here: `taking <skill>:<facet> on <model>` — one facet, one model.
3. Run **one** trial scenario from that skill's `SKILL.md` → `## Trials`: **3 runs without the rule and 3 with it**, a fresh chat every run. "With" = the output of `npx facetkit compose --take <skill>:<facet>` pasted before the same task.
4. Mark each run pass / fail by the scenario's pass criterion — something visible in the transcript.
5. Verdict by count: better by ≥ 2 runs → **confirmed**; differ by ≤ 1 → **no difference**; worse with the rule → **refuted**.
6. Open an issue with the **Trial result** template (one per facet × model) and comment here with the link. Or a PR adding the entry to `trials/results.json` + regenerated `HYPOTHESES.md`.

**What a report needs**: one facet (not the whole skill) · exact model name, tool, date · scenario number and the task text as sent · the rule text added and its language · 3 + 3 runs, one line each · verdict · 6 transcript links (private things removed).

**Before you run**: check in the [trial kit](https://github.com/Anctoster/facetkit/blob/main/docs/trial-kit.md) ([po polsku](https://github.com/Anctoster/facetkit/blob/main/docs/trial-kit.pl.md)) whether the scenario fits a web chat or needs an agent with a terminal. Run the 3 control runs first: if the model passes 3/3 without the rule, raise the trap (levels 1–4 in the kit) instead of running the rule. Test each facet on one weaker and one stronger model — Claude Haiku/Sonnet/Opus first, since the agents run on them; name the model as the tool shows it.

**Language**: trials may be run in Polish (or any language), but all 6 runs in the same one. Prefer pasting the rule in English as is; a translated rule is a variant and is recorded separately (`language: pl`). Report fields in English if you can; Polish is fine, we translate.

**What counts**

- "No difference" and "refuted" are as welcome as "confirmed": a rule that changes nothing is deleted, and the collection gets shorter.
- A claim older than two weeks without a result is free again.

**Taken**

| Facet | Model | Who | Since | Result |
|---|---|---|---|---|
| | | | | |
