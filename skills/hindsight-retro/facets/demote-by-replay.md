---
id: demote-by-replay
phase: [retro]
bounds: replays=2
guards: [budget-burn]
footprint: [tool:eval replay]
ablatable: replay
---
# Test a cheaper model on the same step before trusting it

Do: A model change is tested, not argued. `facet eval compare` says what real work shows; "thin" is not a result. To learn sooner, replay: `facet eval replay --item <id> --step <step> --model <cheaper>`, run the agent in the printed worktree with the original instruction, then `facet eval judge`. Lower the model in the loadouts only after two replays pass every check at lower cost. Raise one only after rewording was tried.

Check: A model change in the loadouts file is accompanied by two replay lines in `facet eval matrix`.

Stop: 2 replays per proposal. One failed check ends the trial: the model stays.

Why: The dearest model is rarely needed everywhere, and guessing where it is costs more than replaying.
