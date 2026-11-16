---
id: shared-state-sweep
phase: [probe]
needs: [run]
bounds: orderings=2
guards: [flaky]
ablatable: replay
---
# Find the state your tests share by accident

Do: Search the new code and tests for module-level mutable values, cached singletons, fixed ports and paths, the real clock, environment variables changed without restore. Isolate each: a fresh instance per test, a temporary directory, port 0, fake timers, restore in `finally`. Then run the suite with the new file first and with it last: `facet run -- <runner> <order>`.

Check: Two evidence lines, new file first and new file last, with the same result.

Stop: 2 orderings. A difference between them is a defect to report with the shared thing named, not something to retry.

Why: Hidden shared state makes slices pass alone and fail together — or fail alone and pass together, which is worse.
