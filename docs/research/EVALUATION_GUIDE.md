# FacetKit Evaluation Guide

This guide makes human scoring more consistent. It supplements the Experiment Protocol and Task Bank; it does not replace a task-specific rubric.

## 1. Define observable behavior

Avoid labels such as “good”, “smart”, or “followed the Facet”. Write what an evaluator can point to in the output or execution trace.

Weak: “The answer is reliable.”  
Strong: “Every factual claim is supported by a supplied source, or explicitly marked unverified.”

## 2. Use 0–1–2 only with anchors

| Score | Meaning | General rule |
|---:|---|---|
| 0 | Not met | Required behavior is absent or contradicted |
| 1 | Partly met | Some required behavior is present, but a defined gap remains |
| 2 | Met | All stated requirements are observable |

For each criterion, add task-specific examples of what earns each score. Do not infer a score from tone, confidence, length, or whether the evaluator likes the answer.

Use **N/A** when a criterion could not be evaluated. N/A is not zero and must not be silently excluded from a denominator.

## 3. Separate dimensions

Score independently where relevant:
- task correctness and completeness;
- target behavior;
- evidence / traceability;
- safety and policy compliance;
- cost, latency, and token use;
- unintended side effects.

An improvement in one dimension does not cancel a regression in another. Report trade-offs.

## 4. Blind and independent review

When practical:
1. Hide condition labels (Baseline / Treatment) from scorers.
2. Give evaluators the same rubric and evidence.
3. Ask at least two people to score important or subjective criteria independently.
4. Preserve original scores before discussion.
5. Record disagreements and the reason for any adjudicated score.

Do not resolve disagreement by averaging ordinal scores automatically. Explain the decision rule.

## 5. Avoid common scoring errors

- **Hindsight:** changing the rubric after seeing outputs.
- **Halo effect:** a fluent answer receives high correctness scores without checking facts.
- **Confirmation bias:** interpreting ambiguous behavior in favor of the hypothesis.
- **Moving goalposts:** adding requirements that were not pre-registered.
- **Selective reporting:** omitting failed or inconvenient runs.
- **Pseudo-replication:** treating repeated turns in one conversation as independent runs.
- **Condition leakage:** evaluator can identify treatment and expectations influence scoring.

## 6. Compare fairly

Keep model/version, task input, tools, permissions, context, settings, and time constraints as similar as possible. Change only the target mechanism when feasible. Record unavoidable differences.

For stochastic systems, one run is rarely enough. Report the number of runs and the full distribution or individual outcomes; do not report only the best run.

## 7. Report uncertainty

Distinguish:
- observed result;
- interpretation;
- possible alternative explanations;
- limitations;
- conclusion scope.

A result can be useful without being conclusive. Use `INCONCLUSIVE` when data, execution, or scoring cannot distinguish the competing explanations.

## 8. Reviewer checklist

- [ ] Criteria are observable and were fixed before execution
- [ ] Score anchors are specific to the task
- [ ] N/A and missing evidence are handled transparently
- [ ] All runs and exclusions are reported
- [ ] Evaluator bias and disagreements are considered
- [ ] Costs and side effects are reported
- [ ] Conclusions are proportional to evidence
