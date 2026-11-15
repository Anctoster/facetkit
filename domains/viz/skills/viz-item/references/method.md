# The method, and how to tune it

Adapted from facetkit (github.com/Anctoster/facetkit, MIT): its journal-computed flow, cheapest-capable-model ladder, hard caps, digest-instead-of-output and independent PASS / REWORK / NEEDS-USER verdict. facetkit's own tools measure program code (tests, mutation probes); here the same roles measure scenes and images.

## Where the tokens are saved

1. **Scripts measure, models read the digest.** A scene with 40,000 objects costs about 20 lines. A script that works is registered and run by the smallest model from then on; the middle model is paid once, when the script is written.
2. **Numbers before pictures.** A picture is the most expensive evidence. `img_digest.py` checks every frame for count, size, weight, black or blown-out frames, duplicates, gaps, jumps and the orbit seam without anyone looking. The inspector looks at one contact sheet, once.
3. **The model follows the kind of work.** Mechanical steps (order, map, run, pack, numeric proof) run on haiku. Writing scripts and judging pictures run on sonnet. One step up only after two failed attempts, and back down after a success. The largest model is never a default.
4. **Short handoffs, no replay.** Each agent reads the order and the previous handoff (40-50 lines), not the conversation. Final messages are 8 lines. The coordinator never reads handoff bodies.
5. **Hard caps.** Runs and minutes per item; three identical failures stop the step. A stuck agent costs a bounded amount.
6. **Resume, do not restart.** An interrupted step continues from its last checkpoint note.

## Where the quality is kept

- "Done" is written before the work: a brief with tagged, checkable criteria, refused by the tool while it is vague, approved once by the requester.
- PASS is accepted by the journal only when every required check has an OK reproduced in that proof run. Failed, skipped and not-run all block; only a named person can waive, and the waiver stays on the record.
- An expensive render is preceded by a preview the requester approves.
- After closing, each remark is recorded with its cause - agent, brief or taste - and `vizflow.py quality` reports the agents, the inspector and the briefs separately.
- The agent that judges did not produce the work and starts with a fresh context.
- An item closes only on PASS; a skipped check is reported as skipped.
- Invariants are measured: the material fingerprint of designed objects, render settings and the sun are compared with the baseline on every item.
- Everything is done on copies; the journal is hash-chained, so an edited history is detected.

## Tuning

- **Routes**: edit `_viz/routes.json` - add a route, drop a step, change a step's model, add a required check. Keep `proof` last.
- **Caps**: `caps` in `routes.json` for the default, `work/<ITEM>/caps.json` per item.
- **Read the quality report.** `vizflow.py quality` gives each agent on each model a word: reliable, watch, raise one model up, or not enough data (fewer than 5 items). Act on the first three only.
- **Scripts are written here.** The checks and the stage scripts are this project's own code against Blender's Python API - no third-party skill packs. They are proven on each machine by `selftest_blender.py`, which builds a small scene and requires every check to pass where it must and fail where it must.
- **Graduate rules into checks.** When the inspector reports the same kind of defect twice, add a check for it to a script in `tools/project/` so that it is caught by a number next time.
