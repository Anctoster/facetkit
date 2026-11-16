---
id: independent-oracle
phase: [red]
bounds: attempts=2
guards: [false-green]
ablatable: live
backstop: [mutate]
---
# Expected values come from outside the code under test

Do: Take every expected value from the specification, a worked example or a hand calculation. Never obtain it by running the code under test, by snapshotting current output, or by calling the helper the implementation calls. Put the source next to the value in a short comment ("spec 2.3", "by hand: 3 x 19.99"). For large or generated output assert properties — count, order, sum, shape — plus two hand-checked samples.

Check: New tests contain no snapshot assertions and import nothing private from the unit they test; every literal expected value names its source.

Stop: 2 attempts to find an independent source for a value. If none exists, mark the test NEEDS-USER; do not invent the number.

Why: An oracle derived from the implementation agrees with every bug in it.
