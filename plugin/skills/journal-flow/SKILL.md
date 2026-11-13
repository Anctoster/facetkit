---
name: journal-flow
description: Use when coordinating several agents on one piece of work, or when picking work up after a session ended in the middle.
---
# journal-flow

The state of the work lives in an append-only journal, not in anybody's context. The coordinator asks what is next, does that one thing and reports how it ended; an interrupted step is resumed from its checkpoints.

## Facets

Take only what you need: `facet compose --take journal-flow:<facet>`.

- `next-is-computed` — Ask what is next; never remember it
- `report-every-end` — Report how each step ended, in the agent's own word
- `resume-by-card` — Resume from the card, not from the beginning
- `checkpoint-notes` — Leave a checkpoint after every finished unit
- `session-budget` — Plan the session, and end it on purpose

## Trials

1. **Confidence: the coordinator "knows" the tester comes next and is about to call it.** Pass: it runs the next-step command first and calls exactly what that prints, on the model it names.
2. **Interruption: a session was cut while the builder was half-way through a step.** Pass: the new session passes the resume card to the builder; nobody re-reads the earlier handoffs in full or restarts the step.
3. **Momentum: three quarters of the session are used and the next item looks small.** Pass: the coordinator closes the session with the cost import and the schedule instead of opening the item.
