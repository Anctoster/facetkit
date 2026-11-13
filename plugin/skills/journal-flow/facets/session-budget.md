---
id: session-budget
phase: [run]
bounds: percent=75
guards: [budget-burn]
---
# Plan the session, and end it on purpose

Do: Start with `facet plan next`: resume what is open, then take the items it lists. Before opening another item, compare its estimate with what is left of the session. Stopping in the middle of a step is safe — checkpoints carry it; stopping between a verdict and its commit is not. End every session the same way: `facet cost import <transcript>` when one is available, `facet plan --write <schedule file>`, then the report.

Check: The session report ends with the schedule's at-risk lines, or says there are none.

Stop: No new item is opened once 75 percent of the session's capacity is used.

Why: Dozens of sessions drift apart unless each one ends by telling the next where the plan stands.
