# FacetKit Experiment Protocol

**Version:** 0.1  
**Status:** Draft  
**Purpose:** Evaluating behavioral hypotheses about AI agents

---

## 1. Purpose

FacetKit contains behavioral hypotheses intended to improve the reliability, effectiveness, and verifiability of AI agents.

A hypothesis is not a fact.

The purpose of this protocol is to establish a consistent method for evaluating whether a particular Facet:

- produces the expected behavioral change;
- improves task outcomes;
- reduces errors or unwanted behavior;
- introduces additional costs or side effects;
- works consistently across different conditions.

This protocol defines the minimum requirements for designing, conducting, documenting, and reviewing FacetKit experiments.

The objective is not to prove that FacetKit works in every situation.

The objective is to discover **what works, under which conditions, and with what measurable effect**.

---

## 2. Research Principles

All FacetKit experiments should follow these principles.

### 2.1 Hypotheses Are Not Facts

A hypothesis represents a testable claim about agent behavior.

It must remain open to confirmation, rejection, or revision.

### 2.2 Results Must Be Reported Honestly

Positive, negative, mixed, and inconclusive results are equally valid research outcomes.

Experiments must not be omitted solely because they failed to support a hypothesis.

### 2.3 Criteria Must Be Defined Before Execution

The expected outcome and evaluation criteria must be established before the experiment begins.

Criteria must not be changed retrospectively to make a result appear successful.

If the experiment design changes, the change must be documented.

### 2.4 Reproducibility Matters

Another researcher should be able to understand the experiment and reproduce it as closely as reasonably possible.

### 2.5 Evidence Must Match the Claim

The strength of a conclusion must not exceed the strength of the evidence.

A successful run does not establish that a Facet is universally effective.

### 2.6 Costs and Side Effects Must Be Considered

A Facet that improves one metric may negatively affect another.

Evaluation should consider relevant trade-offs, including:

- task quality;
- reliability;
- execution time;
- token usage;
- financial cost;
- unnecessary restrictions;
- unintended behavior.

---

## 3. Experiment Lifecycle

A standard FacetKit experiment follows this lifecycle:

```text
Hypothesis Selection
        ↓
Research Question
        ↓
Experiment Design
        ↓
Pre-Registration
        ↓
Baseline Execution
        ↓
Treatment Execution
        ↓
Evaluation
        ↓
Result Classification
        ↓
Report Submission
        ↓
Review
        ↓
Replication or Follow-up
```

Each stage should be documented.

An experiment may be stopped when it becomes unsafe, invalid, or impossible to execute as planned.

The reason for stopping must be recorded.

---

## 4. Selecting a Hypothesis

Researchers should select a hypothesis from:

[`HYPOTHESES.md`](../../HYPOTHESES.md)

A suitable hypothesis should describe a behavioral claim that can be evaluated through observable outcomes.

Before selecting a hypothesis, determine:

1. What behavior is expected to change?
2. Under which conditions should the change occur?
3. What observable evidence would indicate the change?
4. What result would contradict the hypothesis?
5. Can the expected effect be measured reliably?

### 4.1 Research Question

Each experiment must contain a clear research question.

Example:

> Does Facet P03 reduce the number of incorrect assumptions made by an AI agent when implementing an ambiguous software requirement?

The research question should describe an outcome, not merely the presence of a rule.

Weak question:

> Does the agent follow P03?

Stronger question:

> Does applying P03 reduce incorrect assumptions without significantly increasing task completion time?

---

## 5. Experiment Design

Before execution, the researcher must define the experiment.

### 5.1 Required Information

Every experiment must specify:

| Field | Description |
|---|---|
| Experiment ID | Unique identifier |
| Hypothesis ID | Facet or hypothesis being evaluated |
| Research question | What the experiment investigates |
| Expected effect | Intended behavioral change |
| Task or scenario | Situation in which the agent is evaluated |
| Baseline condition | Condition without the tested Facet |
| Treatment condition | Condition with the tested Facet |
| Evaluation criteria | Metrics used to assess the outcome |
| Execution plan | Number and type of trials |
| Limitations | Known constraints or risks |

### 5.2 Isolate the Tested Facet

Whenever practical, evaluate one Facet at a time.

If multiple Facets are introduced simultaneously, the researcher may be unable to determine which Facet caused the observed effect.

Experiments involving multiple Facets are allowed, but they must explicitly identify the tested combination.

### 5.3 Define Expected and Unexpected Outcomes

Before execution, describe:

- the expected positive outcome;
- the expected negative outcome;
- possible unintended effects;
- conditions under which the hypothesis may not apply.

This reduces the risk of interpreting every outcome as support for the hypothesis.

---

## 6. Baseline and Treatment

A valid behavioral experiment requires a comparison.

### 6.1 Baseline

The baseline represents the agent's behavior without the tested Facet.

The agent should receive the task under the normal project conditions.

### 6.2 Treatment

The treatment represents the agent's behavior with the tested Facet applied.

The treatment should differ from the baseline only in the intended experimental variable, whenever practical.

### 6.3 Comparison

Example:

```text
Baseline:
The agent receives a software requirement
without the tested Facet.

Treatment:
The agent receives the same requirement
with the tested Facet.

Evaluation:
Compare incorrect assumptions,
task success, rework, and execution cost.
```

### 6.4 Control Conditions

Researchers should keep relevant conditions consistent:

- model and model version;
- system instructions;
- task description;
- available tools;
- project context;
- evaluation criteria;
- execution environment.

If a condition cannot be kept consistent, record the difference.

### 6.5 Stochastic Behavior

AI agent behavior may vary between executions.

A single successful or unsuccessful run is generally insufficient to establish a reliable behavioral effect.

Where practical:

- repeat the experiment;
- use multiple comparable tasks;
- compare baseline and treatment across similar conditions;
- report variability;
- avoid selecting only the most favorable runs.

For experiments involving repeated runs, report the number of planned and completed trials.

---

## 7. Evaluation Criteria

Evaluation criteria must be relevant to the research question.

Not every experiment requires every metric.

### 7.1 Behavioral Metrics

Examples:

| Metric | Description |
|---|---|
| Requirement Compliance | Whether specified requirements were satisfied |
| Error Rate | Frequency of relevant errors |
| Task Success | Whether the intended task outcome was achieved |
| Assumption Accuracy | Whether assumptions were correct |
| Rework | Amount of correction required |
| Verification Quality | Whether claims were adequately verified |

### 7.2 Operational Metrics

Examples:

| Metric | Description |
|---|---|
| Execution Time | Time required to complete the task |
| Token Usage | Tokens consumed |
| Financial Cost | Estimated or actual execution cost |
| Tool Calls | Number of tool interactions |
| Failure Rate | Frequency of execution failures |

### 7.3 Side Effects

Researchers should record relevant unintended effects.

Examples:

- excessive clarification;
- unnecessary refusal;
- over-restrictive behavior;
- additional complexity;
- increased cost;
- reduced task completion rate;
- excessive documentation;
- delayed execution.

### 7.4 Evaluation Method

The evaluation method must be described.

Possible methods include:

- deterministic checks;
- human review;
- rubric-based evaluation;
- independent evaluator;
- automated scoring;
- comparison against a reference outcome.

If an AI model is used as an evaluator, record the evaluator model and evaluation instructions when available.

Automated evaluation should not be treated as automatically objective.

---

## 8. Trial Execution

Before running the experiment, verify that:

- the experiment design is complete;
- the hypothesis is clearly identified;
- the baseline and treatment are defined;
- evaluation criteria are documented;
- the execution environment is recorded;
- required safety measures are in place.

During execution, record:

- trial identifier;
- condition;
- task input;
- relevant agent output;
- evaluation result;
- execution errors;
- deviations from the plan.

Do not silently discard failed runs.

If a trial is invalid, explain why it was excluded.

The original result should remain available for review whenever possible.

---

## 9. Result Classification

Each experiment must receive one primary result classification.

### 9.1 Supported

The observed results are consistent with the hypothesis and meet the predefined evaluation criteria.

This does not mean the hypothesis is universally proven.

### 9.2 Not Supported

The experiment did not produce the expected effect, or the results contradict the hypothesis.

### 9.3 Mixed

The results support the hypothesis under some conditions but not others.

### 9.4 Inconclusive

The experiment did not provide sufficient evidence for a meaningful conclusion.

Possible reasons include:

- insufficient observations;
- unreliable evaluation;
- excessive variability;
- invalid experimental conditions;
- incomplete execution.

### 9.5 Not Replicated

A previously reported result was not reproduced under the replication conditions.

The original result must not be deleted or overwritten.

### 9.6 Status and Evidence Level

Result classification and evidence maturity are separate concepts.

A result may be classified as `SUPPORTED` while remaining at an early evidence level.

For example:

```text
Result: SUPPORTED
Evidence Level: E2
```

This means that the experiment supports the hypothesis, but the evidence has not yet reached independent replication or broader validation.

---

## 10. Evidence Maturity

FacetKit may use the following evidence levels to communicate the maturity of its behavioral hypotheses.

| Level | Name | Description |
|---|---|---|
| E0 | Proposed | Hypothesis exists but has not been tested |
| E1 | Observed | Relevant behavior has been observed, but controlled comparison is absent |
| E2 | Tested | A documented experiment has evaluated the hypothesis |
| E3 | Replicated | The result has been independently reproduced |
| E4 | Cross-Project | The result has been evaluated across multiple projects or environments |

These levels are a FacetKit research convention.

They are not a substitute for statistical analysis or a universal scientific standard.

Evidence maturity should be assigned conservatively.

A higher evidence level does not automatically imply a larger effect or greater practical value.

---

## 11. Reporting Results

Every completed experiment must produce a report.

The report should include:

### 11.1 Experiment Metadata

- experiment ID;
- hypothesis ID;
- researcher or contributor;
- date;
- FacetKit version or commit;
- model and model version;
- environment.

### 11.2 Experimental Design

- research question;
- expected effect;
- baseline;
- treatment;
- task or scenario;
- evaluation criteria;
- planned number of trials.

### 11.3 Execution Data

- completed trials;
- failed or excluded trials;
- raw or summarized observations;
- deviations from the plan.

### 11.4 Results

- observed outcomes;
- metric values;
- baseline comparison;
- treatment comparison;
- result classification;
- evidence level.

### 11.5 Interpretation

The researcher should explain:

- what the results indicate;
- whether the hypothesis was supported;
- what alternative explanations remain;
- what limitations apply;
- what should be tested next.

The report must distinguish observed data from interpretation.

---

## 12. Reproducibility

An experiment should include enough information for another researcher to reproduce it.

Where possible, provide:

- task inputs;
- relevant prompts or instructions;
- Facet configuration;
- model information;
- evaluation rubric;
- execution parameters;
- result data;
- instructions for reproducing the experiment.

Do not publish confidential project information, credentials, private user data, or sensitive system instructions.

If some information cannot be shared, describe the limitation.

---

## 13. Research Review

Submitted experiments may be reviewed for:

- clarity of the research question;
- consistency of the experiment design;
- adequacy of baseline and treatment;
- relevance of evaluation criteria;
- completeness of reporting;
- reproducibility;
- appropriate interpretation;
- transparency of limitations.

Reviewers should not require a positive result.

A negative result may be accepted if the experiment was conducted and reported appropriately.

Review acceptance means that the report meets the research documentation requirements.

It does not necessarily mean that the hypothesis is confirmed.

---

## 14. Safety and Ethical Considerations

Experiments must not compromise:

- user privacy;
- confidential information;
- system security;
- production data;
- access controls;
- safety-critical operations.

Experiments involving destructive actions, external systems, or sensitive data must use appropriate safeguards.

FacetKit should not be treated as a security sandbox.

The underlying platform, tools, and execution environment must provide the required permissions and isolation.

Researchers must stop an experiment if continuing would create an unacceptable risk.

---

## 15. Limitations

Every experiment has limitations.

Researchers should identify relevant limitations, including:

- model-specific behavior;
- task-specific effects;
- small sample size;
- stochastic variation;
- evaluator bias;
- environmental differences;
- limited reproducibility;
- incomplete observability.

Conclusions must remain within the scope of the experiment.

For example:

> P03 reduced incorrect assumptions in the tested scenarios.

This is preferable to:

> P03 makes AI agents more reliable.

The second statement requires substantially broader evidence.

---

## 16. Research Integrity

FacetKit research must prioritize accuracy over promotion.

Researchers must not:

- fabricate or alter results;
- omit relevant failures;
- selectively report favorable trials;
- change evaluation criteria after execution without disclosure;
- claim independent replication when none occurred;
- present an observational report as a controlled experiment;
- claim universal effectiveness from limited evidence.

Corrections and updates should be documented.

If a previously published result is found to be incorrect, the report should be corrected while preserving its history.

---

## 17. Quick Checklist

Before submitting an experiment, verify:

- [ ] The hypothesis is clearly identified.
- [ ] The research question is specific.
- [ ] The expected effect is defined.
- [ ] Baseline and treatment are documented.
- [ ] Evaluation criteria were defined before execution.
- [ ] Relevant conditions are recorded.
- [ ] Failed and excluded trials are documented.
- [ ] Results are reported honestly.
- [ ] Limitations are identified.
- [ ] The conclusion does not exceed the evidence.
- [ ] The report can be reviewed and reproduced.

---

## 18. Related Resources

- [FacetKit Hypotheses](../../HYPOTHESES.md)
- [Research Hub](README.md)
- [Contributor Guide](CONTRIBUTOR_GUIDE.md)
- [Research Results](RESULTS.md)

---

**FacetKit Research Principle**

> A behavioral hypothesis becomes valuable not when it is written, but when its effect can be observed, evaluated, challenged, and reproduced.
