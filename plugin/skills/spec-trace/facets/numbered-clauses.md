---
id: numbered-clauses
phase: [plan]
needs: [trace]
bounds: clauses=12
guards: [spec-gap]
footprint: [tool:trace]
---
# Write the request as numbered, refutable clauses

Do: Before any test, write the specification file: one line per behaviour, each starting with an id (`R1:`). A clause states what an outsider can observe — input, action, result — in the words of the request, with one example using literal values. No design, no module names, no "should handle". Split a clause that contains "and".

Check: `facet trace --spec <file> --plan` lists the clauses; each has an example with concrete values.

Stop: 12 clauses per item. More means the item is several items: return it for splitting.

Why: A test can only be traced to a requirement that has a name.
