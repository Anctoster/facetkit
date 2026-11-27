# FacetKit Research Results

**Version:** 0.2  
**Status:** First controlled trials  
**Last Updated:** 2026-11-27

---

## 1. Overview

FacetKit contains a collection of behavioral hypotheses intended to improve the reliability, effectiveness, and verifiability of AI agents.

The purpose of this page is to summarize the evidence currently available for these hypotheses.

This page distinguishes between:

- proposed hypotheses;
- observational reports;
- controlled experiments;
- independent replications;
- cross-project evaluations.

A hypothesis is not considered validated merely because it is implemented, documented, or included in a successful workflow.

**The current research status reflects the evidence available in the repository, not the number of features implemented in FacetKit.**

---

## 2. Current Research Status

The following summary reflects the repository state reviewed on 2026-11-27.

| Research Metric | Current Status |
|---|---:|
| Behavioral hypotheses | <!-- research:hypotheses -->69<!-- /research --> |
| Hypotheses with reported trials | <!-- research:tested -->6<!-- /research --> |
| Hypotheses with controlled experiments | <!-- research:tested -->6<!-- /research --> |
| Hypotheses with independent replications | 0 |
| Hypotheses with cross-project evidence | 0 |
| Hypotheses with established effectiveness | 0 |

These figures describe the currently recorded research evidence.

They do not imply that FacetKit has no practical value.

They indicate that the behavioral effectiveness of its hypotheses has not yet been established through the research process defined by the project.

---

## 3. Evidence Maturity

FacetKit uses the following evidence levels to communicate the maturity of its behavioral hypotheses.

| Level | Name | Description |
|---|---|---|
| E0 | Proposed | Hypothesis exists but has not been tested |
| E1 | Observed | Relevant behavior has been observed, but controlled comparison is absent |
| E2 | Tested | A documented experiment has evaluated the hypothesis |
| E3 | Replicated | The result has been independently reproduced |
| E4 | Cross-Project | The result has been evaluated across multiple projects or environments |

These levels are a FacetKit research convention.

They are not a universal scientific standard and do not replace statistical analysis.

Evidence maturity should be assigned conservatively.

A higher evidence level does not necessarily mean that a Facet has a larger effect or greater practical value.

---

## 4. Evidence Summary

Based on the current hypothesis registry and available experiment records:

| Evidence Level | Hypotheses |
|---|---:|
| E0 — Proposed | <!-- research:e0 -->63<!-- /research --> |
| E1 — Observed | 0 |
| E2 — Tested | <!-- research:e2 -->6<!-- /research --> |
| E3 — Replicated | 0 |
| E4 — Cross-Project | 0 |

The six tested hypotheses are the `spec-trace` facets (section 5). They stay at E2: all trials so far were run by one contributor, so none counts as an independent replication. The field report on dogfood use (section 6) is observational and does not constitute a controlled experiment.

It should therefore not be used to claim that a particular Facet has been validated.

---

## 5. Results by Hypothesis

<!-- research:tested -->6<!-- /research --> hypotheses have controlled trials on <!-- research:models -->4<!-- /research --> models; the other <!-- research:e0 -->63<!-- /research --> remain `UNTESTED`. The table below is generated (`npm run research`) from the trial records.

<!-- research:table -->
| Facet | GPT-6 | Mistral Small 4 | Claude Haiku 5.5 | Gemma 4 31B | Status |
|---|---|---|---|---|---|
| `spec-trace:spec-moves-first` | ceiling 3/3 → 3/3 | **confirmed** 0/3 → 2/3 | ceiling 3/3 → 3/3 | **confirmed** 0/3 → 3/3 | `MIXED` — confirmed on 2 of 4 models |
| `spec-trace:numbered-clauses` | **confirmed** 0/3 → 3/3 | no difference 0/3 → 0/3 | **confirmed** 0/3 → 3/3 | **confirmed** 0/3 → 2/3 | `MIXED` — confirmed on 3 of 4 models |
| `spec-trace:sourced-clauses` | **confirmed** 0/3 → 3/3 | no difference 0/3 → 0/3 (theatre) | **confirmed** 0/3 → 3/3 | **confirmed** 0/3 → 3/3 | `MIXED` — confirmed on 3 of 4 models |
| `spec-trace:verification-first` | **confirmed** 0/3 → 3/3 | no difference 0/3 → 0/3 (theatre) | **confirmed** 0/3 → 3/3 | no difference 0/3 → 0/3 | `MIXED` — confirmed on 2 of 4 models |
| `spec-trace:claim-by-id` | **confirmed** 0/3 → 3/3 | no difference 0/3 → 0/3 (partial) | **confirmed** 0/3 → 3/3 | no difference 0/3 → 0/3 (partial) | `MIXED` — confirmed on 2 of 4 models |
| `spec-trace:example-replay` | **confirmed** 0/3 → 3/3 | no difference 0/3 → 0/3 (theatre) | ceiling 3/3 → 3/3 | **confirmed** 0/3 → 3/3 | `MIXED` — confirmed on 2 of 4 models |
<!-- /research -->

Each cell is 3 runs without the rule and 3 with it, a fresh chat per run, the same task on every model (<!-- research:records -->24<!-- /research --> trial records, 2026-11-25…26). "Ceiling": the control already passed 3/3, so the trial could not show an effect. Records: [`trials/results.json`](../../trials/results.json) — the single source of truth; the table is derived from it, and where they disagree the records win; per-facet view: [`HYPOTHESES.md`](../../HYPOTHESES.md); method and lessons: [field report](../field-report-2026-11.md).


The hypothesis registry is the authoritative source for hypothesis identifiers and descriptions.

See:

[`HYPOTHESES.md`](../../HYPOTHESES.md)

### Hypothesis Status

| Status | Meaning |
|---|---|
| `UNTESTED` | No reported experiment is available |
| `SUPPORTED` | Results support the hypothesis under tested conditions |
| `NOT_SUPPORTED` | Results do not support the expected effect |
| `MIXED` | Results vary across conditions |
| `INCONCLUSIVE` | Evidence is insufficient for a meaningful conclusion |
| `NOT_REPLICATED` | A previously reported result was not reproduced |

A `SUPPORTED` status does not mean that a hypothesis is universally proven.

It means that the available experiment supports the hypothesis within its documented scope.

---

## 6. Observational Reports

### 6.1 Field Report 1

**Report:** `field-1.json`  
**Type:** Observational / Dogfood Report  
**Status:** Preliminary  
**Evidence Level:** E1 — Observed

The repository contains an initial field report documenting FacetKit usage in a real development context.

The report includes:

- 9 context items;
- 227 files;
- 37 Facet records;
- 335 total exposure records;
- 30 records with a `withRule` value;
- 0 deliberately withheld Facets.

The reported verdict distribution is:

| Verdict | Records |
|---|---:|
| Unobservable | 10 |
| Ignored | 6 |
| Model-dependent | 1 |
| Followed / effect unknown | 7 |
| Thin | 13 |

Source:

[`trials/field/field-1.json`](../../trials/field/field-1.json)

### 6.2 Interpretation

This report provides useful information about the practical observability of Facet behavior.

It does not establish that FacetKit improved task outcomes.

The report does not provide a controlled comparison between equivalent baseline and treatment conditions.

The absence of deliberately withheld Facets also means that the report cannot establish whether the observed behavior was caused by the tested rules.

The report should therefore be treated as preliminary observational evidence rather than validation.

### 6.3 Research Value

The field report highlights several important research questions:

- Which Facets produce observable behavioral changes?
- Which Facets are difficult to evaluate?
- How often are Facets ignored?
- Which Facets appear to depend on the model?
- Does following a Facet improve the final task outcome?
- Can the effect be distinguished from normal agent behavior?

These questions should inform the design of future controlled experiments.

---

## 7. Controlled Experiments

The first controlled trials cover six `spec-trace` facets on four models (section 5). Main findings: a rule's effect depends on the model in both directions — `spec-moves-first` helped only the weaker models, which the stronger ones did not need; on weaker models rules were often followed only in words (invented sources, command output that was never run) or half-followed (`claim-by-id`: clause ids adopted, tests without a clause kept), so rules that ask for a written marker should graduate into tool checks.

A controlled experiment should include:

- a clearly identified hypothesis;
- a research question;
- baseline and treatment conditions;
- predefined evaluation criteria;
- documented execution conditions;
- trial results;
- an interpretation of the observed effect;
- limitations.

The first controlled experiments should focus on hypotheses with clearly observable outcomes.

See:

[`EXPERIMENT_PROTOCOL.md`](EXPERIMENT_PROTOCOL.md)

---

## 8. Replication Status

Independent replication is essential for determining whether a reported effect can be reproduced outside the original experiment.

At the current stage:

| Replication Metric | Status |
|---|---:|
| Experiments available for replication | <!-- research:tested -->6<!-- /research --> |
| Independent replications completed | 0 |
| Replication failures reported | 0 |

A replication failure is not a reason to remove the original experiment.

Both the original result and the replication result should remain available for review.

---

## 9. Negative and Mixed Results

FacetKit welcomes results that challenge its hypotheses.

The following outcomes should be reported:

- a Facet does not produce the expected effect;
- a Facet improves one metric but worsens another;
- a Facet works only with particular models;
- a Facet works only for particular task types;
- a Facet increases cost without meaningful improvement;
- a Facet causes excessive restrictions or unnecessary behavior;
- an observed effect cannot be reproduced.

Negative and mixed results are essential for identifying the actual limits of a behavioral rule.

They should not be treated as failed contributions.

---

## 10. Known Research Limitations

The current research state has several limitations.

### 10.1 Limited Controlled Evidence

Only <!-- research:tested -->6<!-- /research --> of <!-- research:hypotheses -->69<!-- /research --> hypotheses have controlled trials, all from one skill (`spec-trace`), with 3 runs per condition, in web chats without tools — the tool-backed half of these rules (`facet trace`) was not exercised.

### 10.2 Limited Independent Validation

All <!-- research:records -->24<!-- /research --> trial records come from one contributor; no independent replication is reported yet.

### 10.3 Observability

Some Facets may be difficult to evaluate because their intended effects are not directly observable.

### 10.4 Model Dependence

Agent behavior may vary across models, model versions, and execution environments.

### 10.5 Evaluation Bias

Automated or model-based evaluation may introduce bias.

Evaluation methods should be documented and reviewed.

### 10.6 Generalization

Results obtained in one project or task type should not automatically be generalized to other environments.

---

## 11. Research Priorities

The next stage of FacetKit research should focus on establishing reliable evidence.

Next trials, in order (2026-11-27):

1. Claude Sonnet on the same six `spec-trace` tasks — the model most facetkit steps run on.
2. The same facets in a terminal agent with `facet trace` available.
3. A harder trap for the two ceilings on Claude Haiku (`spec-moves-first`, `example-replay`).
4. First trials of the rules facetkit routes most often: `doc-receipts`, `anchored-handoff`, `claim-ledger:threshold-guard`.
5. Independent replication of any confirmed cell by a second contributor.

General priorities:

### Priority 1 — Establish the Experiment Process

Finalize the experiment protocol and reporting template.

### Priority 2 — Select Initial Hypotheses

Choose a small number of hypotheses with clearly measurable behavioral effects.

### Priority 3 — Conduct Controlled Experiments

Compare baseline and treatment conditions under documented circumstances.

### Priority 4 — Publish All Results

Include positive, negative, mixed, and inconclusive findings.

### Priority 5 — Encourage Independent Replication

Invite contributors to reproduce the first published experiments.

### Priority 6 — Evaluate Cross-Project Effectiveness

Investigate whether reported effects remain consistent across different projects, models, and task types.

---

## 12. How Results Are Updated

This page summarizes the research evidence available in the repository.

Experiment reports should be stored separately and linked from the relevant hypothesis or research summary.

The research summary should be updated when:

- a new experiment is accepted;
- an experiment is corrected;
- a replication is completed;
- a hypothesis is reclassified;
- new cross-project evidence becomes available.

Where possible, summary values should be generated from structured experiment records rather than maintained independently.

This reduces the risk of inconsistencies between the published summary and the underlying data.

---

## 13. Contributing Research

You can help improve the evidence base by:

- evaluating an untested hypothesis;
- conducting a controlled experiment;
- replicating an existing result;
- reviewing an experiment;
- improving evaluation methods;
- reporting negative or unexpected findings.

Start here:

- [Research Hub](README.md)
- [Contributor Guide](CONTRIBUTOR_GUIDE.md)
- [Experiment Protocol](EXPERIMENT_PROTOCOL.md)
- [FacetKit Hypotheses](../../HYPOTHESES.md)

---

## 14. Research Integrity

FacetKit research prioritizes transparency and reproducibility.

The project does not consider a hypothesis validated solely because:

- it is implemented in the framework;
- an agent followed the rule;
- a developer observed a positive outcome;
- a single task was completed successfully;
- a report was accepted.

The strength of a conclusion must remain proportional to the evidence.

Research results may change as new experiments and replications become available.

Corrections and updates should preserve the history of previous findings.

---

## 15. Research Principle

> FacetKit does not measure success by the number of hypotheses it contains.
>
> It measures progress by how much reliable evidence it has gathered about agent behavior.

The goal of the research program is to discover:

- which behavioral rules work;
- which rules do not work;
- under what conditions they work;
- what costs or side effects they introduce;
- whether their effects can be independently reproduced.

**The purpose of this research is not to confirm FacetKit. It is to understand it.**
