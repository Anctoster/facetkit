---
id: write-what-cost-you
phase: [rework, probe]
bounds: memories=2
guards: [repeated-mistake]
footprint: [tool:mem add]
---
# Store only what cost you something

Do: Store a memory only for what cost you a failed attempt or contradicted what a handoff or your own expectation said: `facet mem add --kind pitfall|decision|fact|how --text "<one sentence>" --about <path glob> --anchor <path:START-END>`. Write the cause, not the story. Do not store what the code states plainly, what you did, or what a test already enforces.

Check: Each memory you added names a territory and, where it speaks about specific lines, an anchor.

Stop: 2 memories per step. Exit code 3 means it is already known: do not reword it to get it in.

Why: A memory that records everything is a second codebase nobody reads.
