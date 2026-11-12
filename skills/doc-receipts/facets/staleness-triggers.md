---
id: staleness-triggers
phase: [map, build]
needs: [receipt]
bounds: topics=4
guards: [doc-drift]
footprint: [tool:receipt check]
---
# Know when your memory is not a source

Do: Look it up before use when any of these holds: the installed major version is newer than the one you know; you are about to write an option name, import path, flag or default from memory; an error contradicts what you expected; the feature is new or marked experimental; the area moves fast — build tools, prerendering, browser APIs, codecs, 3D loaders, GPU features. Language basics and stable standard library need no lookup.

Check: For each trigger hit in this slice, `facet receipt check "<topic>" --package <name>` exits 0.

Stop: 4 topics per slice. A slice that needs more is leaning on too many unfamiliar parts: say so in the handoff.

Why: Confident recall of last year's interface is the most expensive kind of wrong.
