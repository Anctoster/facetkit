---
id: reuse-before-fetch
phase: [design, build, ops]
needs: [receipt]
bounds: checks=1
guards: [budget-burn, doc-drift]
footprint: [tool:receipt check]
---
# Check the drawer before going to the library

Do: Before any fetch run `facet receipt check "<topic>" --package <name>`. Fresh: use its facts and fetch nothing. Version mismatch: read only what changed between the two versions, then write a new receipt. Stale: re-confirm the listed facts, not the whole documentation.

Check: In the item's log the receipt check comes before any fetch on the same topic.

Stop: 1 check per topic per item.

Why: The cheapest documentation lookup is the one a colleague already paid for.
