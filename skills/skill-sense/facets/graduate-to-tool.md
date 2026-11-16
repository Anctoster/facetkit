---
id: graduate-to-tool
phase: [skills]
bounds: graduations=1
guards: [repeated-mistake]
ablatable: replay
---
# A rule that works but is ignored becomes a tool

Do: When a facet works when followed and is mostly ignored, stop asking. Move its Check into something that refuses: a policy rule over evidence, a command that exits non-zero, a field the flow requires. Then cut the facet down to the one line that tells the agent the tool exists — or delete it. Propose the code change under "For the user"; you do not write product or tool code yourself.

Check: After the graduation the facet is at least a third shorter or gone, and the proposal names the command or rule that now enforces it.

Stop: 1 graduation per session, so that its effect on the next report can be read.

Why: Prose is the weakest way to hold a line; every rule that matters should be on its way to becoming a check.
