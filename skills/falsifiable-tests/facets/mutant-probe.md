---
id: mutant-probe
phase: [probe]
needs: [mutate]
bounds: mutants=12, minutes=10, rounds=2
guards: [false-green]
footprint: [tool:mutate]
ablatable: live
backstop: [mutate]
---
# Green tests must notice broken code

Do: When the tests are green, break the code on purpose: `facet mutate --files <changed source files> --test "<narrowest test command>" --ref <base commit> --max 12`. For every SURVIVED line decide one of two things. Missing assertion: write the test that kills it. Equivalent mutant: the behaviour cannot differ — say why in one line. Run the probe once more after adding tests.

Check: The handoff carries the probe summary line (`killed N · survived M`) and a verdict for each survivor.

Stop: 12 mutants, 10 minutes, 2 rounds. Survivors left after round 2 go into the report as open risk with file and line; they are never dropped silently.

Why: Coverage shows a line was executed; only a killed mutant shows an assertion was watching it.
