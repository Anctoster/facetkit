---
id: parked-questions
phase: [open, design, ops]
bounds: questions=5
guards: [unasked-assumption]
---
# Park a question with an owner and a default

Do: Put every question you cannot answer under `## Open questions`, one line each, with three parts: who can answer it (an agent or the user), what it blocks, and the default you will assume if nobody answers. Say whether the default can be undone. A default that cannot be undone makes the status NEEDS-USER.

Check: Each question line has an owner, a blocked item and a default marked reversible or not.

Stop: 5 open questions. More means the item is not ready to be worked on: return it.

Why: An unowned question is answered by whoever hits it first, usually by guessing.
