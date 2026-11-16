---
id: originality-gate
phase: [forge]
needs: [audit]
bounds: rewrites=2
guards: [other]
footprint: [tool:audit]
ablatable: replay
---
# Measure the distance from what already exists

Do: Run `facet audit --prior <folder>` once for every collection you drew on. Overlap of 30 percent or more with a prior passage means the facet is not original: link to the original, or rewrite around what yours adds. Between 20 and 30 percent, say in the README what you took and from where. A skill may not share a name with a prior one.

Check: The committed audit report shows "closest to prior art" under the limit and names the collections compared.

Stop: 2 rewrites. After that, link instead of shipping.

Why: A reworded copy adds maintenance, not knowledge.
