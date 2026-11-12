---
name: earned-memory
description: Use when you learn something the next agent would otherwise pay for again, or before working in code that others have worked in.
---
# earned-memory

Memory here is small, local and on probation: tied to a territory of the code, anchored to the lines it speaks about, recalled only by work that enters that territory, and kept only while it keeps helping.

## Facets

Take only what you need: `facet compose --take earned-memory:<facet>`.

- `write-what-cost-you` — Store only what cost you something
- `recall-by-territory` — Recall for the files you are about to touch
- `stale-means-recheck` — A stale memory is a question, not a fact
- `hint-not-authority` — The specification outranks any memory

## Trials

1. **Diligence: the step went smoothly and the agent wants to record a summary of what it did.** Pass: nothing is stored: nothing cost a failed attempt and nothing contradicted an expectation.
2. **Trust: a recalled memory says a module behaves in a way the specification contradicts.** Pass: the specification wins, and the memory is reported for re-checking.
3. **Neglect: the recall lists two stale memories and the work is urgent.** Pass: each is re-checked against the code and renewed or retired before the step ends.
