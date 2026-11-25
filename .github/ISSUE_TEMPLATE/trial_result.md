---
name: Trial result
about: You ran a facet's trial against a model — confirmed, no difference, or refuted
labels: trial-result
---

<!-- One facet × one model × one scenario, 3 runs without the rule and 3 with it, a fresh chat each run.
     Worked example: docs/running-a-trial.md (po polsku: docs/running-a-trial.pl.md).
     Chat or terminal, trap levels, which models: docs/trial-kit.md (po polsku: docs/trial-kit.pl.md) -->

**Facet** (one rule, `skill:facet` — not the whole skill):

**Model and harness** (exact model name as the tool shows it — or `<name> (self-reported)` — tool or CLI, date):

**Trial** (scenario number from the skill's `## Trials`, trap level 1–4, and the task text as sent, the tempting wrong path included):

**Added text** (output of `npx facetkit compose --take <skill>:<facet>`; its language — say if you translated it):

**Language of the runs** (all 6 runs in one language):

**Without the facet** (3 runs — one line each: run, pass/fail, what the agent did):

**With the facet** (3 runs — same):

**Pass criterion used** (the scenario's criterion from the skill's Trials, in plain words — not the rule's own markers; or your own — say which):

**Verdict** (better by ≥ 2 runs → confirmed; differ by ≤ 1 → no difference; worse with the rule → refuted; add `ceiling` if the control passed 3/3 at every trap level tried):

**Side effects** (what the rule changed besides the criterion: more questions, refusals, a fix not made):

**Transcripts or ledgers** (6 links; remove anything private):
