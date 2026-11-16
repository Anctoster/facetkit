---
id: diagnose-before-rewrite
phase: [skills]
needs: [skill]
bounds: facets=2
guards: [other]
footprint: [tool:skill report]
ablatable: replay
---
# Read the diagnosis before touching a rule

Do: Start from `facet skill report`. Each facet has a diagnosis and one action. "Works": leave it. "Ignored": the wording or the place is wrong — shorten, move earlier. "Works when followed, mostly ignored": graduate it. "Followed, no measurable effect": candidate to retire. "Model-dependent": fix the loadout of that model, not the rule. "Thin" and "unobservable" are not findings: change nothing on them.

Check: Every facet you change is named in the report with a diagnosis other than thin, and your change is the action printed for it.

Stop: 2 facets per session. The rest of the report waits; changing many rules at once makes the next report unreadable.

Why: Rewriting a rule that works because another one failed is how good collections decay.
