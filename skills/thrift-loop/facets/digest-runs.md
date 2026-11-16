---
id: digest-runs
phase: [build, probe, ops, proof]
needs: [run, read]
bounds: reads=2
guards: [budget-burn]
footprint: [runs]
ablatable: live
backstop: [caps]
---
# Run through the meter, read the digest

Do: Run every build, test and lint command as `facet run --item <id> -- <command>`. Work from the digest: exit code, signal lines, tail. Need more? Read a bounded range of the saved log around the signal line: `facet read <log>:<from>-<to>`. Never print a whole log and never re-run a command only to see more of its output.

Check: Every evidence line in the handoff has the form `$ command → exit N` and names a log file that exists.

Stop: 2 extra reads per run. If that is not enough, narrow the command — one test file, a quieter reporter — rather than widen the read.

Why: A five-thousand-line log costs more than the fix it describes.
