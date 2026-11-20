# FacetKit Research Contributor Guide

**Version:** 0.1  
**Status:** Draft  
**Program:** FacetKit Community Research

---

## 1. Welcome

FacetKit is an experimental framework exploring how structured behavioral rules can improve the reliability, effectiveness, and verifiability of AI agents.

The project currently contains a collection of behavioral hypotheses called Facets.

However, hypotheses are not facts.

We want to build an evidence-based understanding of what actually improves AI agent performance.

The FacetKit Community Research Program invites developers, researchers, engineers, and AI enthusiasts to help evaluate these hypotheses through experiments, observations, and independent replications.

You do not need to be a FacetKit core developer to contribute.

You only need a research question, a suitable task, and a willingness to report the results honestly.

---

## 2. Who Can Contribute?

We welcome contributions from people with different backgrounds.

### Developers

Evaluate Facets during software development tasks and report their effects on implementation quality, correctness, and rework.

### AI Agent Researchers

Investigate behavioral hypotheses, compare agent configurations, and explore conditions under which particular Facets are effective.

### Test Engineers

Design evaluation scenarios, identify failure modes, and improve the reliability of experimental procedures.

### AI Tool Users

Test Facets in practical workflows and report observations from real-world usage.

### Independent Researchers

Replicate existing experiments, challenge published conclusions, or investigate alternative explanations.

You do not need to contribute code to participate in the research program.

---

## 3. Ways to Contribute

There are several ways to support FacetKit research.

| Contribution Type | Description |
|---|---|
| Experiment | Evaluate a behavioral hypothesis |
| Replication | Repeat an existing experiment |
| Review | Evaluate the quality of an experiment or report |
| Observation | Document relevant agent behavior |
| Dataset Contribution | Provide suitable, non-sensitive evaluation tasks |
| Tooling | Improve research and evaluation tools |
| Documentation | Improve research documentation and examples |

### 3.1 Experimenter

Conduct an experiment to evaluate a Facet.

Your contribution should include a clear research question, experimental conditions, evaluation criteria, and results.

### 3.2 Replicator

Repeat an existing experiment under comparable conditions.

Replication is especially valuable when performed by someone other than the original researcher.

### 3.3 Reviewer

Review experiment design, evaluation criteria, and interpretation.

A reviewer should focus on research quality rather than whether the results support FacetKit.

### 3.4 Developer

Improve the tools that make experiments easier to conduct, validate, and reproduce.

Examples include:

- experiment templates;
- result validation;
- automated evaluation;
- report generation;
- experiment tracking;
- reproducibility tools.

---

## 4. Getting Started

The recommended path for a new contributor is:

```text
Explore the Research Hub
        ↓
Choose a Hypothesis
        ↓
Read the Experiment Protocol
        ↓
Prepare an Experiment
        ↓
Run Baseline and Treatment
        ↓
Evaluate the Results
        ↓
Prepare a Report
        ↓
Submit a Contribution
```

### Step 1. Explore the Research Hub

Start with the FacetKit Research Hub.

Learn about the project's research goals and current hypotheses.

### Step 2. Choose a Hypothesis

Select a hypothesis from:

[`HYPOTHESES.md`](../../HYPOTHESES.md)

Choose a hypothesis that can be evaluated through observable behavior.

### Step 3. Read the Experiment Protocol

Before running an experiment, read:

[`EXPERIMENT_PROTOCOL.md`](EXPERIMENT_PROTOCOL.md)

The protocol describes how to design, execute, evaluate, and report experiments.

### Step 4. Prepare Your Experiment

Define:

- the research question;
- the expected effect;
- the task or scenario;
- the baseline condition;
- the treatment condition;
- the evaluation criteria.

### Step 5. Run the Experiment

Execute the experiment according to your documented plan.

Record relevant outputs, observations, failures, and deviations.

### Step 6. Submit Your Results

Prepare a report using the experiment template or the reporting requirements defined in the Experiment Protocol.

---

## 5. Choosing a Hypothesis

A good first experiment should be relatively simple and clearly measurable.

When choosing a hypothesis, consider the following questions:

1. Can the expected behavior be observed?
2. Can the behavior be evaluated consistently?
3. Can a baseline be established?
4. Can the experiment be completed without excessive infrastructure?
5. Is the expected effect relevant to a real task?

### 5.1 Start with a Narrow Question

Avoid trying to evaluate an entire group of Facets at once.

For example:

Weak research question:

> Does FacetKit improve software development?

Better research question:

> Does applying P03 reduce incorrect assumptions during the implementation of ambiguous software requirements?

A narrow question makes it easier to identify what caused the observed result.

### 5.2 Do Not Choose Only Promising Hypotheses

A hypothesis that appears unlikely to work may still be valuable to investigate.

Research should not be limited to confirming existing expectations.

---

## 6. Designing an Experiment

Every experiment should have a documented design before execution.

At minimum, define:

| Field | Description |
|---|---|
| Experiment ID | Unique identifier |
| Hypothesis ID | Facet being evaluated |
| Research Question | What is being investigated |
| Expected Effect | Intended behavioral change |
| Scenario | Task or situation |
| Baseline | Agent condition without the tested Facet |
| Treatment | Agent condition with the tested Facet |
| Metrics | Criteria used to evaluate the outcome |
| Trial Plan | Planned number of executions |
| Limitations | Known constraints |

### 6.1 Baseline

The baseline represents the agent's behavior without the tested Facet.

### 6.2 Treatment

The treatment represents the agent's behavior with the tested Facet applied.

Whenever practical, keep the other relevant conditions consistent.

### 6.3 Evaluation

Define how success will be measured before execution.

Possible evaluation criteria include:

- task success;
- requirement compliance;
- error rate;
- incorrect assumptions;
- rework;
- execution time;
- token usage;
- financial cost.

Not every experiment needs every metric.

Choose metrics that are directly related to the research question.

---

## 7. Running an Experiment

Before execution, verify that your experiment is sufficiently defined.

During execution, record:

- the task input;
- the experimental condition;
- relevant agent outputs;
- evaluation results;
- failed or incomplete trials;
- deviations from the plan.

### 7.1 Multiple Trials

AI agent behavior may vary between executions.

Where practical, repeat the experiment or use multiple comparable tasks.

Do not report only the most favorable result.

### 7.2 Failed Trials

Failed trials are part of the research record.

If a trial is excluded, explain why.

Do not silently remove inconvenient results.

### 7.3 Experimental Changes

If you change the experiment after execution begins, document the change.

If the change affects the research question or evaluation criteria, consider treating the modified experiment as a separate experiment.

---

## 8. Reporting Results

Every completed experiment should produce a report.

The report should include:

### Experiment Information

- experiment ID;
- hypothesis ID;
- contributor;
- date;
- FacetKit version or commit;
- model and model version;
- relevant environment details.

### Experimental Design

- research question;
- expected effect;
- baseline;
- treatment;
- evaluation criteria;
- planned trials.

### Execution

- completed trials;
- failed trials;
- excluded trials and reasons;
- relevant observations;
- deviations from the plan.

### Results

- observed outcomes;
- metric values;
- baseline comparison;
- treatment comparison;
- result classification.

### Interpretation

Explain:

- what the results indicate;
- whether the hypothesis was supported;
- what limitations apply;
- what alternative explanations remain;
- what should be investigated next.

Separate observed data from your interpretation.

---

## 9. Result Classification

Use one of the following classifications.

| Result | Meaning |
|---|---|
| `SUPPORTED` | Results support the hypothesis under the tested conditions |
| `NOT_SUPPORTED` | Results do not support the expected effect |
| `MIXED` | Results vary across conditions |
| `INCONCLUSIVE` | Insufficient evidence for a meaningful conclusion |
| `NOT_REPLICATED` | A previously reported result was not reproduced |

A `SUPPORTED` result does not mean that the hypothesis is universally proven.

A single experiment may provide useful evidence without establishing general effectiveness.

---

## 10. Submitting Your Contribution

Research contributions should be submitted through the project's accepted contribution process.

For GitHub-based contributions, the recommended process is:

1. Fork the FacetKit repository.
2. Create a branch for your contribution.
3. Add your experiment report and supporting files.
4. Verify that no confidential or sensitive information is included.
5. Open a Pull Request.
6. Describe the research question and main findings.
7. Respond to review feedback.

### 10.1 Suggested Experiment Structure

A community experiment may use the following structure:

```text
trials/
└── community/
    └── experiment-001/
        ├── README.md
        ├── experiment.json
        └── results.json
```

The exact structure may evolve as the research tooling develops.

Follow the current repository conventions when submitting a contribution.

### 10.2 Pull Request Description

Your Pull Request should briefly explain:

- which hypothesis was evaluated;
- what question was investigated;
- how the experiment was conducted;
- what the results showed;
- what files are included;
- whether the experiment is a replication.

---

## 11. Research Review

Submitted experiments may be reviewed for:

- clarity of the research question;
- consistency of the experimental design;
- adequacy of the baseline;
- relevance of the evaluation criteria;
- completeness of the report;
- reproducibility;
- appropriate interpretation;
- transparency of limitations.

A contribution may be accepted even if the hypothesis was not supported.

Research review evaluates the quality and transparency of the experiment.

It does not require a positive result.

### 11.1 Revision Requests

Reviewers may ask contributors to:

- clarify the experiment design;
- provide missing information;
- explain excluded trials;
- improve the evaluation criteria;
- narrow an unsupported conclusion;
- document limitations.

Contributors are encouraged to treat review as a collaborative research process.

---

## 12. Research Integrity

FacetKit research prioritizes accuracy over promotion.

Contributors must not:

- fabricate results;
- alter experimental data;
- hide relevant failures;
- selectively report favorable trials;
- claim replication without performing it;
- present observational evidence as a controlled experiment;
- make claims that exceed the available evidence.

Negative and inconclusive results are welcome.

A well-documented experiment that challenges a Facet can be more valuable than an experiment that simply confirms an expectation.

---

## 13. Privacy and Safety

Do not submit:

- API keys;
- passwords;
- access tokens;
- private system instructions;
- confidential source code;
- personal user data;
- sensitive project information.

If your experiment uses private or proprietary data, provide a sanitized description or suitable non-sensitive test scenario.

Experiments involving external systems or potentially destructive actions must use appropriate safeguards.

FacetKit should not be treated as a security sandbox.

---

## 14. Recognition

FacetKit values contributions that improve the quality of its research.

Contributors may be recognized through:

- attribution in experiment reports;
- links to published research;
- contributor acknowledgements;
- replication credits;
- research documentation.

Recognition should reflect the nature of the contribution.

The number of experiments alone should not determine research value.

Independent replication, careful evaluation, and transparent negative results are important contributions.

---

## 15. Frequently Asked Questions

### Do I need to be a FacetKit developer?

No.

You can contribute by conducting experiments, reviewing research, or reporting observations.

### Do I need to prove that a Facet works?

No.

The purpose of the research program is to evaluate hypotheses, not to confirm them.

### Can I submit a negative result?

Yes.

Negative, mixed, and inconclusive results are welcome.

### Can I experiment with my own AI agent?

Yes.

You should document the agent, model, environment, and relevant experimental conditions.

### Can I test multiple Facets together?

Yes, but the experiment must identify the tested combination.

When practical, begin with a single Facet to make the results easier to interpret.

### Does an accepted experiment mean the hypothesis is proven?

No.

Acceptance means that the report meets the contribution and research documentation requirements.

The strength of the evidence depends on the experiment and subsequent replication.

### Can I replicate an existing experiment?

Yes.

Independent replication is one of the most valuable ways to contribute.

---

## 16. Related Resources

- [FacetKit Research Hub](README.md)
- [FacetKit Hypotheses](../../HYPOTHESES.md)
- [Experiment Protocol](EXPERIMENT_PROTOCOL.md)
- [Research Results](RESULTS.md)

---

## 17. Final Note

FacetKit is an ongoing research effort.

We do not expect every hypothesis to succeed.

We expect every experiment to teach us something.

The most valuable contribution is not a positive result.

It is reliable evidence that helps us understand how AI agents actually behave.

**Help us discover what works, what fails, and why.**
