---
id: checkpoint-notes
phase: [build, probe, seams, ui]
bounds: notes=12, chars=200
guards: [lost-work]
footprint: [note]
ablatable: replay
---
# Leave a checkpoint after every finished unit

Do: After each unit that would be painful to redo — a slice, a group of tests, a rehearsal — write one line: `facet note "done: <what, with the file>; next: <the very next action>"`. Write one before any command you expect to run longer than two minutes. State facts a stranger can verify, not intentions.

Check: `facet timeline` shows at least one note per finished unit of the step.

Stop: 12 notes per step, 200 characters each. More notes than that means the step is several steps.

Why: A session can end at any token; the last note is all the next one inherits for free.
