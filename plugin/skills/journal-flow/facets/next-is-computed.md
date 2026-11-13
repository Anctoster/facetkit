---
id: next-is-computed
phase: [run]
bounds: actions=1
guards: [lost-work, scope-creep]
ablatable: no
---
# Ask what is next; never remember it

Do: Before every agent call run `facet flow next`. Do the single action it prints — that agent, that mode, that model, those rules — and nothing else in between. Record the start first: `facet flow start <step>`. The flow refuses a step out of order; `--force` exists for a real exception and is written into the journal with your name on it.

Check: `facet timeline` shows a start before every agent call of the session and no forced step without a reason in your report.

Stop: 1 action per `next`. If the printed action looks wrong, ask the user; do not improvise a better order.

Why: A plan kept in a context is lost at the first compaction; a plan computed from the journal cannot be.
