---
id: hint-not-authority
phase: [plan, design]
bounds: conflicts=1
guards: [scope-creep]
---
# The specification outranks any memory

Do: A memory never overrides a specification clause, a contract in a design, a scenario or a rule of the project. When they disagree, the memory is the suspect: follow the written requirement, and put the conflict under open questions with the memory id, so its owner re-checks or retires it.

Check: No decision in your handoff cites a memory as its only reason.

Stop: 1 conflict is reported and the work continues on the specification; a second in the same step means the territory's memories need a review before more work.

Why: What was true for the last task is evidence about this one, not a requirement of it.
