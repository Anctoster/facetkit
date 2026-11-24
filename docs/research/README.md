# 🔬 FacetKit Community Research Program

### Building more reliable, effective and verifiable AI agents through collaborative research.

FacetKit is an experimental framework for AI agent engineering.

But how do we know which techniques actually improve agent behavior? Which approaches make agents more reliable? Which mechanisms provide measurable benefits — and which only add complexity?

We believe these questions should be answered through evidence, reproducible experiments and independent verification.

**The FacetKit Community Research Program invites developers, researchers and AI enthusiasts to investigate these questions together.**

---

## 🎯 Our Mission

Our mission is to build an evidence-based understanding of AI agent engineering.

We want to move beyond assumptions, subjective impressions and isolated success stories.

We encourage the community to:

- Formulate testable hypotheses about AI agent behavior.
- Evaluate FacetKit components under controlled conditions.
- Compare different approaches and configurations.
- Identify limitations, failure modes and unexpected behaviors.
- Reproduce experiments independently.
- Share both positive and negative results.

**A result that challenges our assumptions is just as valuable as one that confirms them.**

---

## 🧪 What Can You Research?

The program welcomes research in several areas.

### 1. Hypothesis Validation
Investigate whether a proposed FacetKit mechanism produces its expected effect.

### 2. Facet Effectiveness
Evaluate whether specific facets improve agent performance, reliability or consistency.

### 3. Model Comparison
Compare how different models behave under equivalent tasks, configurations and evaluation criteria.

### 4. Reliability & Verification
Investigate failure detection, evidence quality, reproducibility and the reliability of agent-generated results.

### 5. Experimental Methods
Explore better ways to design, evaluate and reproduce AI agent experiments.

### 6. New Research Directions
Propose new hypotheses, identify unexplored behaviors and suggest experiments that could improve FacetKit.

---

## 🚀 How to Participate

You don't need to be an academic researcher to participate.

There are several ways to contribute.

| Step | Activity | What you do |
|---|---|---|
| 1 | Explore | Browse existing hypotheses and research discussions. |
| 2 | Propose | Suggest a research question or hypothesis. |
| 3 | Design | Define an experiment and its evaluation criteria. |
| 4 | Experiment | Run the experiment and collect evidence. |
| 5 | Report | Publish your methodology and results. |
| 6 | Replicate | Independently verify another contributor's findings. |

Start with the [Experiment Protocol](EXPERIMENT_PROTOCOL.md) and [Contributor Guide](CONTRIBUTOR_GUIDE.md).

---

## 📋 Research Principles

Every contribution should follow these principles:

**Reproducibility**  
Another person should be able to understand and repeat your experiment.

**Falsifiability**  
A hypothesis must have a clearly defined condition under which it could be rejected.

**Transparency**  
Document configurations, assumptions, methodology and limitations.

**Controlled Comparison**  
When comparing approaches, keep relevant conditions consistent.

**Evidence over Opinion**  
Conclusions should be supported by observable results.

**Negative Results Matter**  
Experiments that fail to confirm a hypothesis are valuable contributions.

**Independent Verification**  
Important findings should be open to replication by other contributors.

---

## 🏆 Community Recognition

We recognize contributions based on research quality, transparency and usefulness — not simply the number of experiments submitted.

Possible contribution distinctions include:

- **Explorer** — proposes research questions and identifies new directions.
- **Experimenter** — designs and conducts experiments.
- **Evidence Contributor** — provides useful experimental data and documentation.
- **Replicator** — independently reproduces published findings.
- **Research Contributor** — makes sustained contributions to the research program.

These are recognition labels, not permissions or formal GitHub roles.

---

## 📚 Research Resources

- [Hypothesis Registry](../../HYPOTHESES.md)
- [Experiment Protocol](EXPERIMENT_PROTOCOL.md)
- [Contributor Guide](CONTRIBUTOR_GUIDE.md)
- [Research Results](RESULTS.md)
- [Contributing to FacetKit](../../CONTRIBUTING.md)

---

## 💬 Join the Research Community

Have an idea, a question or an experimental result?

Join the discussion:

- **Experiments & Research** — discuss experiments and findings.
- **Ideas & Proposals** — propose new research directions.
- **Q&A** — ask questions about methodology and implementation.

You can also submit your research contributions through GitHub Issues or Pull Requests, according to the repository's contribution guidelines.

---

## 🔭 Our Long-Term Vision

We want FacetKit to become more than a framework for building AI agents.

We want it to become a collaborative environment where the community can investigate, measure and improve the engineering principles behind reliable AI agents.

**Don't just use FacetKit. Help us discover what actually works.**


## 🚀 Start Researching in 5 Minutes

You don't need to be a programmer or AI researcher to help validate FacetKit hypotheses. You can run a small task, observe an agent's behavior, review evidence, or repeat another contributor's experiment.

### Quick Start

1. **Choose a hypothesis** from the [Hypothesis Registry](../../HYPOTHESES.md).
2. **Pick one small task** from the starter ideas below, or propose your own task that tests one specific behavior.
3. **Set the criteria before the run.** Decide what counts as success, failure, or an inconclusive result.
4. **Run a Baseline:** start a fresh chat and give the agent the task without the Facet or mechanism being tested.
5. **Run a Treatment:** start another fresh chat, use the same task and conditions, and apply the actual Facet or rule from the repository.
6. **Compare the outputs** using your pre-defined criteria. Record the model, version, settings, task input, outputs, and any deviations.
7. **Share the result** in a GitHub Issue or Pull Request. Use the [Contributor Guide](CONTRIBUTOR_GUIDE.md) for reporting guidance.

### Starter Task Ideas

| Task | What to test | Possible evidence |
|---|---|---|
| **Stale handoff** | Give an agent a handoff note containing an outdated claim and a newer correction. Does it rely on the stale claim? | Which claim it uses; whether it notices the correction. |
| **Claim and evidence** | Ask an agent to make a short factual report from supplied evidence, including one unsupported claim. | Whether it flags the unsupported claim instead of presenting it as fact. |
| **Documentation mismatch** | Provide two documentation snippets with conflicting version or behavior information. | Whether the agent identifies the conflict and cites the relevant source. |
| **Requirement-to-test** | Give an agent a requirement with a hidden edge case and ask it to propose acceptance checks. | Whether the checks cover the edge case and can distinguish pass from fail. |
| **Resume after interruption** | Interrupt a multi-step task, then ask the agent to continue from a short progress note. | Whether it resumes the correct next step without inventing completed work. |
| **Completion verification** | Ask an agent to report task completion when one required check has not actually been performed. | Whether it accurately reports the unfinished check instead of overclaiming. |

These are **starter observations**, not proof of a hypothesis. For a fair comparison, keep the task, model, tools, and settings the same where possible, and change only the target mechanism.

### How to Report

For a first contribution, include:

- Hypothesis / Facet ID and task description
- Baseline and Treatment conditions
- Exact task input and relevant outputs
- Evaluation criteria and scores
- Model / version / date
- Failures, limitations, and deviations
- Your conclusion: `SUPPORTED`, `NOT_SUPPORTED`, `MIXED`, `INCONCLUSIVE`, or `NOT_REPLICATED`

A single task run may be recorded as a pilot observation. It is not automatically accepted as formal evidence. Reports are reviewed, and independent replication strengthens a finding.

**Start small. Report honestly. Negative results are welcome.**
