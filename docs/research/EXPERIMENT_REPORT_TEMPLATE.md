# FacetKit Experiment Report Template

Use this template for a documented experiment. Complete the protocol before running the experiment; do not rewrite criteria after seeing outputs. Delete instructional notes before submission.

## Record

- **Report ID:** `RPT-YYYYMMDD-INITIALS-01`
- **Date (UTC):**
- **Contributor / handle:**
- **Hypothesis ID and exact claim:**
- **Facet ID and version / commit:**
- **Task Bank card ID or custom task:**
- **Experiment status:** planned / completed / stopped

## Research question

What observable effect is being tested?

## Pre-registered prediction

- **Expected effect:**
- **What would support the claim:**
- **What would count against it:**
- **What would make the result inconclusive:**

## Conditions

| Variable | Baseline | Treatment |
|---|---|---|
| Model and exact version | | |
| System / developer instructions | | |
| Tools and permissions | | |
| Facet / mechanism | absent | present |
| Temperature and other settings | | |
| Task input | identical | identical |
| Context / starting state | | |

List every difference other than the tested mechanism. Explain why it was unavoidable.

## Evaluation rubric (freeze before execution)

| Criterion | Operational definition | Weight | Baseline score | Treatment score |
|---|---|---:|---:|---:|
| Primary outcome | | | | |
| Safety / correctness | | | | |
| Cost / latency / tokens | | | | |
| Side effects | | | | |

Use the Task Bank's 0–1–2 scale only when it fits: 0 = not met, 1 = partly met, 2 = met. Add observable anchors for each score. Mark unavailable or unrun as **N/A**, never as zero or a pass.

## Runs and raw evidence

| Run | Condition | Date/time | Output / artifact link | Notes |
|---|---|---|---|---|
| 1 | Baseline | | | |
| 1 | Treatment | | | |

Attach or link exact prompts, complete outputs, relevant logs, configuration, and scoring notes. Redact secrets and personal data.

## Results

- **Number of planned runs:**
- **Number completed:**
- **Number excluded and reasons:**
- **Primary outcome:**
- **Secondary outcomes:**
- **Observed failures / unexpected behavior:**
- **Costs and side effects:**

## Conclusion

Choose one: `SUPPORTED`, `NOT_SUPPORTED`, `MIXED`, `INCONCLUSIVE`, `NOT_REPLICATED`.

Explain the conclusion in the narrowest scope justified by the evidence. A single run is a pilot observation, not proof of general effectiveness.

## Limitations and deviations

Record missing data, prompt sensitivity, evaluator uncertainty, environmental changes, protocol deviations, and possible confounders.

## Reproducibility checklist

- [ ] Exact hypothesis and Facet version identified
- [ ] Criteria recorded before execution
- [ ] Baseline and Treatment conditions documented
- [ ] Exact task and outputs preserved
- [ ] All runs, exclusions, and deviations disclosed
- [ ] Costs and side effects considered
- [ ] Evidence package attached or linked
- [ ] Claim strength does not exceed evidence strength

## Review

- **Reviewer:**
- **Review date:**
- **Methodological concerns:**
- **Replication requested:** yes / no
- **Disposition:** accepted as report / needs revision / rejected as invalid (reason)
