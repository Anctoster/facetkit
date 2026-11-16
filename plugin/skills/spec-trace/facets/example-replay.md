---
id: example-replay
phase: [probe]
needs: [run]
bounds: examples=12, minutes=5
guards: [false-green]
footprint: [runs]
ablatable: replay
---
# Replay the examples through the real entrance

Do: When the tests are green, take the literal example of each clause and perform it through the outermost interface a user or caller would use — the running server, the command, the page — not through the test harness. Record observed against expected per clause id. A difference with green tests means a test checks the wrong thing: repair the test first, then decide about the code.

Check: The handoff has one line per clause: id, expected, observed, same or different, each from a `facet run` evidence line.

Stop: 12 examples, 5 minutes. Clauses not replayed are listed as "verified by test only".

Why: Tests verify the code against the tests; a replay validates it against the request.
