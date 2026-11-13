---
id: spec-moves-first
phase: [red, rework]
bounds: changes=3
guards: [weakened-test]
ablatable: no
---
# When test and clause disagree, the clause moves first

Do: A test that contradicts its clause, or a clause the implementation shows to be wrong, is settled in the specification. Edit the clause, add a dated line "changed: R3 — reason — approved by <owner>", then change the test, then the code. A change of meaning needs the owner of the request; a change of wording does not. Never edit only the test.

Check: Every test edited after its first green run has a matching "changed:" line in the specification.

Stop: 3 changed clauses per item. Past that the specification was not ready: return the item instead of continuing.

Why: A test edited alone silently becomes the new requirement, and nobody approved it.
