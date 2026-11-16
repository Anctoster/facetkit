---
id: right-reason-red
phase: [red]
needs: [run]
bounds: attempts=3
guards: [false-green]
footprint: [red-first]
ablatable: replay
---
# A new test must fail for the behaviour it names

Do: Run each new test before any production code exists: `facet run -- <narrowest test command>`. Read the first signal line and classify the failure. An assertion about the behaviour in the test title is the right reason. An import error, a typo, a missing fixture, a timeout or a wrong selector is the wrong reason: repair the test until the failure is an assertion on behaviour. Record per test: name, failing line, "right reason".

Check: The handoff quotes one assertion line per new test, and that line is in the log named by `facet run`.

Stop: 3 attempts per test to reach a right-reason red. After that report BLOCKED with the failing line; do not start the implementation.

Why: A test that is red because of a typo turns green when the typo is fixed, not when the behaviour exists.
