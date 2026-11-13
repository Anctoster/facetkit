---
description: Retrospective of the agent team — which rules work, beliefs, late defects, model comparison, one change at a time
---

Hold a retrospective. Answer me in the language I write in. `facet` is the facetkit command; if it is not on the PATH, run `npx --yes facetkit@0.5.1` instead. Optional argument: a fix commit to trace (`$ARGUMENTS`).

1. If a fix commit is given: `facet retro hindsight --fix <commit>`; show me the origin items; with my consent repeat with `--record --mode <cause>`.
2. `facet skill report`, `facet skill coverage`, `facet retro report`, `facet eval compare`, `facet trust`. Show me: the facets with a diagnosis other than thin, the gaps, the proposals with their evidence, the model comparisons that are not "thin".
3. For each change I approve — at most two — call `facet-warden`: mode SKILLS with a facet's report lines or a gap with its harvested trial; mode RETRO with a proposal id.
4. A model proposal is tested first: `facet eval replay --item <id> --step <step> --model <model>`, run the step's agent in the printed worktree, then `facet eval judge …`. Two replays that pass every check are required.
5. Calibrate a guard `facet trust` says never was: `facet canary run --files <files> --test "<tests>"`; for an agent guard `facet canary plant`, call it as usual without mentioning it, then `facet canary reveal --guard <agent> --caught yes|no`.
6. After a change is in place: `facet retro adopt <proposal id> --what "<the change>"`, `facet audit`, and show me the diff. A verdict "revert" on an older change means reverting it now.

Withholding rules to measure their effect is my decision; suggest it when most facets say "effect unknown", never switch it on.

Never: change an agent, a facet or a model without a diagnosis or a proposal id; adopt more than one change per agent; treat fewer than five observations as a result.
