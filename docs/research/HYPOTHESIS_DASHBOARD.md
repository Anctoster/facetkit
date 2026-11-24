# Hypothesis Evidence Dashboard

This page defines a lightweight, manually maintained index of evidence. It is not an automated live dashboard unless a future workflow explicitly generates it.

## Source of truth

- Hypothesis IDs and exact claims: [HYPOTHESES.md](../../HYPOTHESES.md)
- Experiment methodology: [Experiment Protocol](EXPERIMENT_PROTOCOL.md)
- Published reports: [Research Results](RESULTS.md)
- Evidence maturity definitions: [Research Glossary](RESEARCH_GLOSSARY.md)

Do not copy hypothesis descriptions into this dashboard as an independent source of truth.

## Suggested summary table

| Hypothesis ID | Short label | Reports | Controlled experiments | Independent replications | Evidence level | Current status | Last reviewed |
|---|---|---:|---:|---:|---|---|---|
| Pxx | Example only | 0 | 0 | 0 | E0 | UNTESTED | YYYY-MM-DD |

Replace the example row only when report records exist. Link every count to its underlying report or evidence package.

## Counting rules

- Count a report once, even if it contains multiple runs.
- A run is not automatically an experiment; use the definitions in the glossary.
- Count a replication only when it is independent and identifies the report being replicated.
- Do not infer E-level from a positive score alone.
- Keep status and evidence level separate: status describes the result; E-level describes maturity of evidence.
- Update the dashboard only after a report is reviewed and its disposition recorded.
- When no data exists, show zero / E0 / UNTESTED rather than leaving an ambiguous blank.

## Per-hypothesis record

For each hypothesis, link:
1. Original hypothesis and version.
2. All reports, including negative and inconclusive results.
3. Replication reports and the report each one targets.
4. Evidence packages.
5. Review decisions and open limitations.

## Governance

The dashboard is an index, not a leaderboard. Do not rank contributors by positive results or suppress negative findings. If automated generation is introduced, generated counts must remain traceable to source records and the generation timestamp must be visible.
