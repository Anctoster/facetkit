---
id: earn-your-tokens
phase: [forge]
needs: [compose, audit]
bounds: budget=900
guards: [budget-burn]
footprint: [tool:compose]
ablatable: live
backstop: [caps]
---
# Every facet must be loaded by someone

Do: Put each facet into at least one role loadout and look at the cost: `facet compose --role <role> --phase <phase>` prints the words. Adding a facet to a full loadout means taking one out; choose by which failure costs more. Retire a facet that no trial and no real task has needed in ten items.

Check: `facet audit` reports no "dead weight" and no "dropped" line.

Stop: The loadout budget (900 words unless the role sets its own) is a wall, not a target to approach.

Why: A facet nobody loads is documentation; a loadout nobody can afford is ignored.
