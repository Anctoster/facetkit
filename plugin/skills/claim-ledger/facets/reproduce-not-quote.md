---
id: reproduce-not-quote
phase: [proof]
needs: [run, ledger]
bounds: reruns=1
guards: [unverified-claim]
footprint: [runs]
ablatable: no
---
# Re-run it; a quoted result is hearsay

Do: When you verify someone's work, never copy an evidence line from their handoff. Run the command yourself with `facet run` and compare exit code and the deciding number with what they reported. A mismatch is a false claim, whatever the reason. Measure sizes and timings yourself with the same command they used.

Check: Every evidence line in your proof has an entry in this run's `facet ledger`.

Stop: 1 re-run per command. If the result flips between runs, record it as a flaky check — a defect — rather than choosing the run you prefer.

Why: The author of a claim is the person least able to see why it is false.
