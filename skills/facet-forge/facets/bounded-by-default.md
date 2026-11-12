---
id: bounded-by-default
phase: [forge]
needs: [compose]
bounds: numbers=3
guards: [loop, budget-burn]
---
# Every rule carries its own limit

Do: Give every Stop a count or a time and the action to take on reaching it — report, return, ask — never "try again" or "be thorough". Declare the same numbers in the facet's `bounds:` line, so that `facet compose` can merge several facets and show the strictest limit of each kind.

Check: The header of `facet compose` for a loadout containing the facet shows its bounds.

Stop: 3 numbers per facet. More limits than that will not be remembered.

Why: An unbounded rule is how an agent burns a budget while obeying instructions.
