---
id: flake-screen
phase: [probe]
needs: [run]
bounds: repeats=3
guards: [flaky]
---
# A test must give the same answer three times

Do: Run the new tests three ways with `facet run`: the file alone, inside the whole suite, and in reversed or shuffled order when the runner can. Remove nondeterminism at the source: freeze the clock, seed randomness, use a temporary directory and port 0, wait on a condition instead of sleeping.

Check: Three evidence lines with the same exit code — or a named cause for the difference and its fix.

Stop: 3 runs. A test that differs between runs is quarantined and reported with its cause; it is never re-run until it happens to pass.

Why: A test that passes sometimes is a false positive some of the time, and nobody knows which time.
