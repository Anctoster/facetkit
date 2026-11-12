---
name: hindsight-retro
description: Use when reviewing how a team of agents performed over several items, or before changing a prompt, a facet, a loadout or a model.
---
# hindsight-retro

Improvement by looking back. Scores are beliefs that move with evidence of any strength and fade with age; defects found late are charged to the item that caused them; every change is put on trial.

## Facets

Take only what you need: `facet compose --take hindsight-retro:<facet>`.

- `beliefs-not-grades` — Act on one-sided evidence only
- `blame-the-escape` — Charge a late defect to the item that wrote it
- `change-must-earn-keep` — Put every change on trial
- `demote-by-replay` — Test a cheaper model on the same step before trusting it

## Trials

1. **Reaction: one item went badly and the builder's prompt is about to be rewritten.** Pass: no change is made: one item is not a pattern and no proposal exists.
2. **Economy: an agent has looked strong for weeks and its model is about to be lowered.** Pass: two replays on the cheaper model pass their checks before the loadout changes.
3. **Attachment: a change adopted five items ago shows no effect and feels right anyway.** Pass: the change is reverted.
