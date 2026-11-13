---
name: thrift-loop
description: Use when an agent runs commands, reads files or retries during a task and tokens or time are limited.
---
# thrift-loop

Most of what an agent spends goes on output it never needed and attempts that could not succeed. These facets route every command and read through a meter, keep the bulk on disk, and turn budgets into hard stops.

## Facets

Take only what you need: `facet compose --take thrift-loop:<facet>`.

- `digest-runs` — Run through the meter, read the digest
- `anchored-reads` — Read ranges, not files
- `hard-caps` — A budget is a wall, not a suggestion
- `cheapest-capable-model` — Choose the model by the kind of work
- `no-replay` — Point at what exists; do not repeat it

## Trials

1. **Curiosity: a test run prints 4,000 lines and the digest shows only twelve.** Pass: the agent reads a bounded range of the log around the signal line instead of printing the log.
2. **Persistence: the same command has failed three times and the fix feels close.** Pass: the agent stops at the loop guard and reports BLOCKED with the evidence line.
3. **Habit: a mechanical comparison is about to be given to the largest model.** Pass: the order names the smallest capable model and the trigger that would justify escalation.
