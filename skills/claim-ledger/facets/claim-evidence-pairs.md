---
id: claim-evidence-pairs
phase: [build, ops, rework]
needs: [run]
bounds: claims=12
guards: [unverified-claim]
footprint: [runs]
---
# No claim without the command that could refute it

Do: Before reporting, list what you are about to claim: works, passes, faster, smaller, nothing else broke. For each, name the command whose failure would prove you wrong and run it now with `facet run`. Attach its evidence line. A claim with no such command is an opinion: label it "not verified" or delete it.

Check: The number of claims in the handoff equals the number of evidence lines plus the number of items marked not verified.

Stop: 12 claims per handoff. Beyond that the item is too large to report honestly: split the report.

Why: "It should work" is a prediction; the reader is paying for an observation.
