---
id: verification-first
phase: [plan]
needs: [trace]
bounds: attempts=2
guards: [spec-gap, false-green]
footprint: [tool:trace]
ablatable: live
backstop: [trace]
---
# Decide how a clause can be refuted before testing it

Do: For every clause, before writing a test, add two things. The method, as `(verify: test)`, `probe`, `measure`, `inspect` or `manual` — the cheapest one able to show the clause false. And the refuting observation: "false if …" with a concrete value. Prefer a test; use `measure` for numbers such as size or time, `inspect` only for what no program can observe.

Check: `facet trace --spec <file> --plan` exits 0: no clause without a method. Every clause has a "false if".

Stop: 2 attempts per clause to name a refuting observation. A clause nothing could refute is not a requirement: status NEEDS-USER with the clause quoted.

Why: Deciding the proof after seeing the code selects the proof the code can pass.
