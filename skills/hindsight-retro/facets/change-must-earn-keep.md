---
id: change-must-earn-keep
phase: [retro]
bounds: items=5, open=1
guards: [other]
footprint: [tool:retro adopt]
ablatable: replay
---
# Put every change on trial

Do: After a change is made — a facet, a loadout, a model — record it: `facet retro adopt <proposal id> --what "<the change>"`. Keep one open change per agent, or their effects cannot be told apart. Five items later the report says keep or revert. Revert means doing it: undo the change and say so in the handoff.

Check: The report's "adopted changes" section has a verdict for every change older than five items.

Stop: 5 items of trial, 1 open change per agent. A change with no baseline before it is recorded as unmeasurable, not as a success.

Why: Prompts grow because additions are never asked to prove themselves.
