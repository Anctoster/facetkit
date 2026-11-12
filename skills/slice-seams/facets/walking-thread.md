---
id: walking-thread
phase: [red, probe]
needs: [mutate]
bounds: threads=1, seconds=60
guards: [seam-break]
---
# One real thread through every layer the slice touched

Do: Add or extend exactly one test that enters through the outermost public interface — an HTTP request, a command, a page — passes through every layer the slice changed, and asserts the final observable effect: the response and the stored state. Keep it hermetic: temporary data directory, port 0, no network. Prove it is connected: `facet mutate --files <the thinnest touched layer> --test "<the thread>" --max 3` must kill.

Check: The thread exists, runs under the time bound, and the mutation line shows at least one kill in the thinnest layer.

Stop: 1 thread per slice, 60 seconds. If it is slower, shrink the data set, never the number of real layers.

Why: Unit tests prove the parts work; only a thread proves they are plugged into each other.
