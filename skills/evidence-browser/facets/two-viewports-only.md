---
id: two-viewports-only
phase: [ui, proof]
bounds: viewports=2
guards: [budget-burn]
ablatable: live
backstop: [caps]
---
# Desktop and phone, built and cold

Do: Collect evidence from the production build served as in production, with a cold cache, at two sizes: desktop and phone. Do not throttle unless the specification names a network. Add a viewport only for a defect reported at that size. Numbers from a development server are never evidence.

Check: The evidence URL serves the built application, and the digest has both devices.

Stop: 2 viewports. Each further configuration needs a reported defect to justify it.

Why: Every extra configuration doubles the cost and rarely changes the verdict.
