---
id: anchored-reads
phase: [map, build]
needs: [read, ledger]
bounds: files=25, widenings=2
guards: [budget-burn]
footprint: [tool:read]
---
# Read ranges, not files

Do: Read code by range from the anchors you were given: `facet read path:START-END`. Widen by 20 lines at most twice. Read a whole file only when it is under 120 lines or you will rewrite most of it. Note every file you opened that the context pack did not anchor.

Check: `facet ledger` shows reads with ranges, and the handoff lists the files read outside the map.

Stop: 25 distinct files per item, 2 widenings per anchor. Then write down what is still unknown and hand it back.

Why: Reading a file to find ten lines is paying for the other four hundred.
