# FacetKit Community Research — Start Here
*An accessible guide for contributors, including people who do not program.*

> **You do not need to code to help test FacetKit.**
> You can run a small comparison in an AI chat, follow a task card, review evidence, or independently repeat someone else's experiment.

FacetKit contains behavioral hypotheses about AI agents. A hypothesis is a claim to investigate—not a fact and not a promise that a technique works. Community research helps determine **what changes, under which conditions, and at what cost**.

## 1. Choose how you want to help

| Role | What you do | Coding required? |
|---|---|---|
| Task Runner | Run a prepared task with and without the tested rule; save both outputs | No |
| Observer | Record a concrete behavior, including a failure or side effect | No |
| Evidence Reviewer | Check whether a report follows its own criteria and includes evidence | No |
| Replicator | Repeat another contributor's task using the same conditions | No |
| Task Designer | Suggest a realistic scenario that tests one specific behavior | No |
| Tool / Dataset Contributor | Improve scripts, fixtures, or structured data | Sometimes |

A careful non-technical comparison can be more useful than a large experiment with unclear criteria.

## 2. The five-minute path

1. Open the [Hypothesis Registry](../../HYPOTHESES.md).
2. Choose one hypothesis or use a task from `TASK_BANK.md`.
3. Open a fresh AI chat. Use the same model and settings for both runs if possible.
4. Run the task once **without** the target Facet (Baseline).
5. Start a second fresh chat and run the exact same task **with** the target Facet (Treatment). Use the Facet's actual rule text from the repository; do not paraphrase it unless the task card asks you to.
6. Score both outputs using the task's criteria, written before you run it.
7. Save the task input, the two outputs, scores, model/date, and any deviations.
8. Submit the report as a GitHub Issue or PR using the contribution route described in the [Research Hub](README.md). If you are unsure, open a discussion or ask in the research channel first.

**Important:** A quick chat comparison is a pilot observation. It becomes a formal result only after it meets the current Experiment Protocol and is reviewed. Do not describe one run as proof.

## 3. What makes a useful contribution?

A useful report answers:

- Which hypothesis / Facet ID did I test?
- What exact task did I give the agent?
- What changed between Baseline and Treatment?
- What did I observe, using the criteria I set in advance?
- What failed, was skipped, or was different from the plan?
- Could another person repeat this?

Results can be `SUPPORTED`, `NOT_SUPPORTED`, `MIXED`, `INCONCLUSIVE`, or `NOT_REPLICATED`. A negative result is welcome. Do not remove a failed run or change the scoring rules after seeing the answer.

## 4. Keep the comparison fair

For a simple baseline-versus-treatment comparison:

- use the same task wording and project context;
- use the same model, model version, tools, and settings where possible;
- change only the tested Facet;
- use a fresh conversation for each run;
- decide the scoring criteria before running;
- report all runs, not just the best one.

If you cannot keep a condition the same, write down what differed. If the AI model or tool is unavailable, mark the task `BLOCKED` or `NOT_RUN`—never `PASS`.

## 5. Task cards

Start with one card from [`TASK_BANK.md`](TASK_BANK.md). Each card includes a task, the behavior to observe, and a simple scoring rubric. The task bank includes:

- evidence and verification;
- memory and handoff;
- documentation and version checking;
- requirements and test quality;
- browser/UI verification;
- retrospectives and cost-aware decisions.

The task cards are designed to be accessible without modifying FacetKit source code. Some hypotheses may still require a developer to run the official FacetKit trial or verify the exact Facet configuration.

## 6. Submit a contribution

### Easiest route: GitHub Issue
Create an issue in the repository and include:
- title: `[Research] <Hypothesis ID> — <short task name>`;
- task card ID;
- Baseline and Treatment conditions;
- result and scores;
- model / version / date;
- links or attached sanitized outputs;
- limitations and deviations.

Use a PR if you are adding or editing a task card, dataset, or report file. You do not need to create a branch just to ask a question or propose a task.

### Report template

```text
Experiment / Task ID:
Hypothesis / Facet ID:
Contributor (GitHub handle or anonymous):
Date:
Model / version:
Task card and exact task input:
Baseline condition:
Treatment condition:
Scoring criteria (defined before run):
Baseline score:
Treatment score:
Planned runs / completed runs:
Failures, skips, or deviations:
Result: SUPPORTED / NOT_SUPPORTED / MIXED / INCONCLUSIVE / NOT_REPLICATED
What the evidence shows:
Limitations / possible alternative explanations:
Files or sanitized output:
```

Do not include API keys, passwords, private system prompts, personal data, confidential code, or proprietary material.

## 7. What “counts” toward a hypothesis?

A submission is not automatically counted just because it is posted.

For a report to be considered in the hypothesis evidence record, reviewers should be able to:
1. identify the exact hypothesis and task;
2. reproduce the conditions closely enough;
3. see the raw or summarized evidence;
4. understand the scoring and result;
5. verify that failures and limitations were disclosed.

A task runner's report may be accepted as an observation, a pilot, or a formal experiment depending on its evidence. Independent replication is especially valuable. The repository maintainers decide how accepted evidence is reflected in the hypothesis registry and research results.

## 8. Research links

- [Research Hub](README.md)
- [Hypothesis Registry](../../HYPOTHESES.md)
- [Experiment Protocol](EXPERIMENT_PROTOCOL.md)
- [Contributor Guide](CONTRIBUTOR_GUIDE.md)
- [Research Results](RESULTS.md)

**The goal is not to prove FacetKit right. The goal is to discover what is actually reliable.**
