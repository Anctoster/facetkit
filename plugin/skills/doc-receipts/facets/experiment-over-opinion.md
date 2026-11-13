---
id: experiment-over-opinion
phase: [build]
needs: [run]
bounds: probes=2, lines=15
guards: [doc-drift]
---
# Let the installed version settle the argument

Do: When memory, documentation and behaviour disagree, or the documentation is silent, write the smallest runnable probe — 15 lines or fewer, in a temporary directory, against the installed version — and run it: `facet run -- node probe.mjs`. Record the outcome as a fact in the receipt ("verified by experiment: …") and delete the probe.

Check: The handoff has the probe's evidence line next to the fact it established.

Stop: 2 probes per question, 15 lines each. A question that survives both goes to the user with both results.

Why: The installed version is the only authority that cannot be out of date.
