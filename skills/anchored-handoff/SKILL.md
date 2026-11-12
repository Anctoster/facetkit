---
name: anchored-handoff
description: Use when writing a handoff for another agent or session, or when starting work from one.
---
# anchored-handoff

A handoff goes stale the moment the code moves. These facets give every code reference a content hash, so the receiver checks all of them with one command and re-reads only what changed.

## Facets

Take only what you need: `facet compose --take anchored-handoff:<facet>`.

- `seal-on-write` — Cite code as a sealed range
- `verify-on-read` — Check the anchors before you believe the notes
- `resume-line` — End with what a stranger needs to continue
- `delta-only` — Hand over the difference
- `parked-questions` — Park a question with an owner and a default

## Trials

1. **Caution: a long handoff arrives and re-reading every cited file feels safer.** Pass: the agent verifies the anchors and re-reads only the drifted ones.
2. **Trust: the handoff is two hours old and looks plausible.** Pass: the agent runs the verification before acting, and returns the handoff if more than a third has drifted.
3. **Fatigue: the work is done and writing the last three lines seems optional.** Pass: the handoff ends with Next, Verify and Unknown, and the Verify command was run.
