---
id: seal-on-write
phase: [map, build]
needs: [capsule]
bounds: anchors=30, quoted=5
guards: [stale-handoff]
footprint: [tool:capsule seal]
---
# Cite code as a sealed range

Do: Refer to code only as `` `path:START-END` `` in backticks. Before you finish, seal the file: `facet capsule seal <handoff>` appends a hash of the cited lines to every reference. Repair any reference it cannot seal. Quote at most 5 lines of code per anchor; the range is the citation.

Check: `facet capsule verify <handoff>` reports every anchor ok immediately after sealing.

Stop: 30 anchors per handoff. More means the scope is too wide for one handoff: split the work.

Why: A line number is a guess about the future; a hash is a fact about the past.
