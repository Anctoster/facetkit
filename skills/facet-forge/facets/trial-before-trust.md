---
id: trial-before-trust
phase: [forge]
bounds: trials=2, runs=3
guards: [other]
---
# Keep a facet only if it changes what an agent does

Do: Before adding a facet, write the situation in which an agent without it does the wrong thing: hurry, sunk cost, an authority saying skip it, "almost done". Run that situation without the facet and with it, on the cheapest model that will ever use it. Keep the facet only if the behaviour changes. Add the situation and its pass criterion to the skill's `## Trials`.

Check: The skill index lists the trial, and the commit message records the outcome without and with the facet.

Stop: 2 trials per facet, 3 runs each. No difference in behaviour: delete the facet.

Why: A rule that changes nothing is decoration paid for on every load.
