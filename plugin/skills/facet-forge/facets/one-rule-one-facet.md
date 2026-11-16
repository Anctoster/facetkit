---
id: one-rule-one-facet
phase: [forge]
needs: [audit]
bounds: words=170, rewrites=2
guards: [other]
footprint: [tool:audit]
ablatable: replay
---
# One facet changes one behaviour

Do: Write a facet as a single rule for a single situation. The title names the behaviour. Four parts and nothing else: Do — the steps; Check — what an observer can verify; Stop — the bound and what to do on reaching it; Why — the failure it prevents, in one sentence. No background, no history, no teaching. If the Do needs "and also", it is two facets.

Check: `facet audit` exits 0 for the collection with the new facet in it.

Stop: 170 words and 2 rewrites to get under them. Still over means the rule is not understood yet: do not ship it.

Why: An agent applies short rules and skims long ones.
