---
id: neighbour-run
phase: [probe]
needs: [run]
bounds: minutes=10, rounds=2
guards: [seam-break, regression]
footprint: [evidence:neighbours]
---
# Run the tests of the slices you touch, not only your own

Do: Run the neighbour tests from the seam map and put the result on record: `facet run --evidence neighbours -- <runner> <neighbour test files>`, then the whole fast suite once. A neighbour that turns red is yours until shown otherwise. Decide which it is: an intended contract change — then update producer, consumer and their tests together — or an accident — then fix the slice.

Check: One evidence line with exit 0 for the neighbour set and one for the fast suite, both produced after the last code change.

Stop: 10 minutes or 2 rounds. Past that, report the red neighbours with file and line and stop changing code.

Why: Green in isolation is the normal state of a slice that broke its neighbours.
