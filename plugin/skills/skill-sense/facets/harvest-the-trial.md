---
id: harvest-the-trial
phase: [skills]
needs: [skill]
bounds: gaps=1
guards: [repeated-mistake]
footprint: [tool:skill coverage]
ablatable: replay
---
# Take the trial from what really happened

Do: `facet skill coverage` lists failure modes with incidents and the rules that guard them. A GAP — incidents and no loaded guard — comes with a trial harvested from the recorded incident. Use that trial, not an invented one: write the facet that would have changed it, with guards and footprint, and place it in the loadout of the agent that was blamed. RECURRING means the guard is loaded and the failure returns: diagnose that guard instead of adding another.

Check: The new facet's skill lists the harvested trial, naming the item it came from.

Stop: 1 gap per session. A failure seen once is noted, not legislated.

Why: Rules written from imagination guard against failures that do not occur.
