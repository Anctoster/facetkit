---
id: claim-by-id
phase: [red, probe]
needs: [trace]
bounds: rounds=2
guards: [spec-gap, scope-creep]
footprint: [evidence:trace]
---
# Each test claims one clause by its id

Do: Put the clause id in the title of each test: `[R3] rejects an expired token`. One test claims one clause; a clause may have several tests. Then run `facet trace --spec <file> --tests <dirs> --scope <your new test files>`. UNCOVERED: write the test. ORPHAN: the id is wrong or the clause is gone. NO CLAUSE: the test verifies something nobody asked for — propose the clause or delete the test.

Check: The trace line shows uncovered 0 and orphan claims 0, with exit 0, after the last test was written.

Stop: 2 rounds of trace and repair. What remains goes into the handoff by clause id.

Why: Without the link, "all tests pass" says nothing about whether all requirements were tested.
