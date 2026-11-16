---
id: seam-map
phase: [map, probe]
needs: [seams]
bounds: depth=2, neighbours=25
guards: [seam-break]
footprint: [tool:seams]
ablatable: live
backstop: [neighbours]
---
# Know who stands on the other side of your change

Do: List the seams of the slice from the import graph: `facet seams --ref <base commit> --own <your test files>` (or `--changed a,b`). Copy its five lines into the handoff: slice, consumers across the seam, providers, neighbour tests to run, consumers with no test at all. A consumer with no test is a named risk, not a footnote.

Check: The handoff contains the five output lines of `facet seams` for the current diff.

Stop: Depth 2. With more than 25 neighbour tests, take the 10 at depth 1 and name the count you left out.

Why: Your tests see your slice; the code that breaks is the code that imports it.
