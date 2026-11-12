---
id: hard-caps
phase: [build, probe, ops]
needs: [ledger, run]
bounds: runs=40, minutes=30
guards: [budget-burn, loop]
footprint: [tool:ledger]
ablatable: no
---
# A budget is a wall, not a suggestion

Do: Read the caps before you start: `facet ledger --item <id>`; check again after each slice. Exit code 3 from `facet run` means a cap is spent or the same command failed three times in a row. Then stop: write the handoff with status BLOCKED, the last evidence line and what remains. Do not continue with raw commands outside the meter.

Check: The last evidence line of the handoff is the `facet ledger` totals for the item.

Stop: The caps of the item (default 40 runs, 30 minutes of command time). 3 identical failures count as a loop.

Why: An agent without a meter optimises for finishing, not for what finishing costs.
