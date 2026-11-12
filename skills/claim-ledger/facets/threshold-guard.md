---
id: threshold-guard
phase: [green, proof]
needs: [run]
bounds: lines=200
guards: [weakened-test]
ablatable: no
---
# Look for the test that was bent to pass

Do: Before accepting a green result, read what changed in the specification and tests: `facet run -- git diff <base> -- <spec and test directories>` and the saved log. Look for limits that grew, assertions or scenarios that vanished, new skip, only or guard tags, patterns made broader, timeouts made longer, deleted test files. Each needs a written reason from the owner of the specification; without one the verdict is REWORK.

Check: The proof has the diff's evidence line and one line: "threshold changes: none" or the list with reasons.

Stop: 200 changed lines of specification. A larger change goes back to be split before anyone judges it.

Why: The cheapest way to make a test pass is to edit the test.
