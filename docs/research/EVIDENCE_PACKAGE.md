# FacetKit Evidence Package

An evidence package preserves enough information for another contributor to inspect and, where feasible, repeat a reported experiment.

## Recommended layout

```text
evidence/
  <experiment-id>/
    README.md
    protocol.md
    task/
      input.txt
    conditions/
      baseline.yaml
      treatment.yaml
    runs/
      baseline-01/
        prompt.txt
        output.md
        metadata.yaml
      treatment-01/
        prompt.txt
        output.md
        metadata.yaml
    evaluation/
      rubric.md
      scores.csv
      evaluator-notes.md
    artifacts/
      logs/
      screenshots/
    checksums.txt
```

Keep the package proportionate to the experiment. Do not create empty folders merely to match this example.

## Required metadata

For each run, record:
- run ID, condition, date/time and timezone;
- provider, model name, exact version if available;
- system/developer instructions and Facet ID/version/commit;
- tool availability, permissions, and relevant configuration;
- exact task input and complete output;
- token/cost/latency data when available;
- evaluator, rubric version, score and rationale;
- errors, retries, omissions, and deviations.

## Integrity and privacy

- Preserve original outputs; put annotations in separate files.
- Do not silently edit prompts or outputs after execution.
- Redact API keys, credentials, private URLs, personal data, and confidential customer content.
- If redaction changes interpretation, describe what was removed.
- Prefer text artifacts over screenshots where possible; screenshots may supplement, not replace, machine-readable evidence.
- Add checksums for larger or externally stored artifacts when practical.
- State any artifact that cannot be shared and why.

## README.md for each package

Include experiment ID, hypothesis, report link, short contents inventory, reproduction steps, known limitations, and contact / attribution preference.

A package supports a report; it does not by itself establish that the conclusion is correct.
