---
id: blame-the-escape
phase: [retro]
bounds: fixes=1
guards: [repeated-mistake]
footprint: [tool:retro hindsight]
---
# Charge a late defect to the item that wrote it

Do: When a defect is fixed after its item was closed, find where it came from: `facet retro hindsight --fix <commit> --record`. The items that wrote the repaired lines are debited: their builder, and the agents that should have caught it. Then write the trial that would have caught it, for the guard that missed it.

Check: The next `facet retro report` shows the evidence line "did not catch a defect later fixed by <commit>".

Stop: 1 hindsight per fix commit. Lines with an unknown origin are listed and charged to nobody.

Why: An item that passed every check and shipped a defect was scored too well on the day.
