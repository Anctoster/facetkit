---
id: assertion-liveness
phase: [red, probe]
bounds: tests=10
guards: [false-green]
ablatable: replay
---
# Every test has an assertion that can fire

Do: For each new test confirm at least one assertion on an observable result — return value, response, stored state, emitted event — is reached on the main path. Remove what can hide it: assertions inside `if`, inside callbacks that may never run, inside a `catch` that swallows, un-awaited promises, `skip`, `only`, `todo`. "Did not throw" and "mock was called" alone do not count. Then sabotage once: change the central expected value, run, see red, restore.

Check: The handoff lists each new test with "sabotage: red". Any test that stayed green under sabotage is rewritten.

Stop: 1 sabotage per test, 10 tests per item. With more tests, sabotage the 10 that guard money, permissions or data loss first and name the rest as not sabotaged.

Why: A test whose assertion never executes is a false positive by construction.
