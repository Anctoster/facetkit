---
id: report-the-level
phase: [run]
bounds: lines=4
guards: [unverified-claim]
ablatable: no
---
# Say how far the result can be trusted, and why

Do: End the report of a closed item with its assurance level and the basis in one line each: the level from `facet flow close`, the rules that carried it, the rules not met or waived, and one sentence on what the level does not cover. Never write "verified", "safe" or "production-ready"; write the level. For the team as a whole quote `facet trust` with its interval, not an adjective.

Check: The report contains the level word for word as printed and names at least one thing it does not cover.

Stop: 4 lines. More detail is in the attestation; point to it.

Why: Trust that is stated with its basis can be checked; trust that is asserted can only be believed.
