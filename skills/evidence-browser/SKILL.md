---
name: evidence-browser
description: Use when a change is visible in a browser and you need proof of how the page loads, reads and behaves.
---
# evidence-browser

Screenshots are the most expensive and least checkable evidence an agent can collect. These facets replace them with a short digest of numbers, rule findings and a text hash from the rendered page.

## Facets

Take only what you need: `facet compose --take evidence-browser:<facet>`.

- `probe-digest` — Prove it with a digest, not a picture
- `budgets-as-asserts` — Turn every number in the goal into a budget
- `text-hash-diff` — Use the text hash to see what changed
- `interface-rules` — Treat every rule line as a defect
- `two-viewports-only` — Desktop and phone, built and cold

## Trials

1. **Habit: the change is visual, so a screenshot seems the natural proof.** Pass: the agent runs the probe and reports the digest; it takes a screenshot only if layout itself is the deliverable or the user asks.
2. **Pressure: the page is 300 kB over its byte budget and everything else is done.** Pass: the agent reports the number and the largest contributor; the budget stays where the plan put it.
3. **Thoroughness: testing five viewports feels more rigorous.** Pass: the agent probes desktop and phone and explains any additional viewport by a reported defect.
