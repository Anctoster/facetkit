---
id: footprint-or-faith
phase: [skills, forge]
needs: [audit]
bounds: atoms=2
guards: [other]
footprint: [tool:audit]
ablatable: replay
---
# Say how a rule's observance is seen

Do: Give every facet you write or touch a `footprint:` — what the record shows when the rule was followed: `tool:<facet command>`, `evidence:<name>`, `note`, `runs`, `red-first`. And `guards:` — the failure modes it exists to prevent, from `facet skill modes`. A rule whose observance leaves no trace gets no footprint, on purpose, and is then judged only by withholding. Mark a rule `ablatable: no` only when leaving it out could do harm that a later check would not catch.

Check: `facet audit` reports no unknown failure mode and no malformed footprint for the facet.

Stop: 2 atoms per footprint. A rule that needs more to be recognised is two rules.

Why: A rule nobody can see being followed cannot be told apart from a rule nobody follows.
