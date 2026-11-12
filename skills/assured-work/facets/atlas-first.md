---
id: atlas-first
phase: [map]
bounds: cards=2, words=220
guards: [seam-break, budget-burn]
footprint: [tool:atlas]
---
# Ask for the card before you read the code

Do: Before opening files in code you do not know, ask what is already known about them: `facet atlas card <files>` — what each file offers, who uses which name, which tests stand behind it, what changes together with it without importing it. Use `facet atlas find <name>` instead of searching for a definition. Then read only the ranges the card points at. Copy the "changes together" lines into the handoff: they are the seams nobody sees in the imports.

Check: The handoff quotes the card's "used by" and "changes together" lines for the files of the item.

Stop: 2 cards per step, 220 words each. What the atlas does not model — strings, styles, non-module files — is searched as usual.

Why: Exploring to find out who depends on a file costs more than the file itself.
