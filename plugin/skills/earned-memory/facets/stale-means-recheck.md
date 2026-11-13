---
id: stale-means-recheck
phase: [retro]
bounds: stale=3
guards: [repeated-mistake, stale-handoff]
---
# A stale memory is a question, not a fact

Do: `recall` lists as stale the memories whose anchored lines changed. Never use one as knowledge. Re-check each against the current code. Still true: add it again with the new anchor, then `facet mem retire <old id> --reason "re-anchored"`. No longer true: `facet mem retire <id> --reason "<what changed>"`.

Check: After your step `facet mem list` shows no stale memory in the territory you worked in, or your handoff names the ones you left.

Stop: 3 stale memories per step. The rest are listed in the handoff by id.

Why: Notes about code that has since changed are the most confident kind of wrong.
