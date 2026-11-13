---
id: resume-by-card
phase: [run]
bounds: checks=3
guards: [lost-work, budget-burn]
---
# Resume from the card, not from the beginning

Do: When `facet flow next` prints RESUME, the step was started and never ended. Call the same agent and give it the printed card as its whole briefing: the item, the step, the checkpoints, the failed commands, the changed files. Do not start the step again and do not add your own recollection of what happened. The receiving agent verifies the last checkpoint with one command and continues from there.

Check: After the resumed step ends, `facet flow status` shows it with a single attempt.

Stop: 3 checkpoints verified at most, 1 command each. A step with no checkpoints restarts from its inputs; say so in the report.

Why: Re-reading the whole context to find the place costs more than the work that was lost.
