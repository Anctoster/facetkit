---
id: skip-is-not-pass
phase: [red, proof, close]
bounds: minutes=5
guards: [unverified-claim]
---
# Count four states, report four numbers

Do: Keep passed, failed, skipped and not run apart, and report all four. For anything skipped by the environment, name the missing capability and the command that would supply it. Never write "all tests pass" while anything was skipped: write "N passed, M skipped (reason)".

Check: The handoff contains the four numbers, and each skipped group has a reason and a remedy.

Stop: 1 attempt, 5 minutes, to enable a skipped capability such as installing a browser. Otherwise report it as unverified.

Why: A skipped check and a passed check look the same in a summary and are opposites in fact.
