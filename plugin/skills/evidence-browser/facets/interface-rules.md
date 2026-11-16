---
id: interface-rules
phase: [ui]
needs: [ui]
bounds: handchecks=5
guards: [regression]
footprint: [tool:ui]
ablatable: replay
---
# Treat every rule line as a defect

Do: Each `rule:` line of `facet ui` is a defect to fix: exactly one h1, a language on the page, a viewport meta, a main landmark, alternative text, a name on every control, a label on every field, no positive tabindex, noopener on new-window links, tap targets of at least 24 px. Then check by hand what a probe cannot see, once per new component: reachable and visibly focused by keyboard, Escape closes overlays and focus returns, motion respects the reduced-motion setting, state is not shown by colour alone.

Check: `rules=0` passes on both viewports, and the hand checks are listed with yes or no.

Stop: 5 hand checks per component.

Why: Interface rules are cheap to check and expensive to retrofit.
