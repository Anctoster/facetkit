# The brief: how a task is stated so that the result is the expected one

A result comes back wrong for two different reasons: the work was done badly, or "done" was never said. The brief removes the second. It is written before any work, checked by `vizflow.py brief check`, approved once by the requester, and from then on it is what the inspector judges against - not anyone's memory of the conversation.

## The eight sections

| Section | What goes in | Typical mistake |
|---|---|---|
| Goal | what must exist at the end, and what it is for | a list of actions instead of a result |
| Reference | a file, a link, an earlier render the result must match | an adjective ("photoreal") in place of a picture |
| Scope | what is made or changed | "and whatever else is needed" |
| Fixed | what must not change | left empty - then anything may change |
| Acceptance | up to 9 numbered criteria, each with one tag | "looks good" |
| Views | cameras or frames the result is judged from | none - then every angle can be argued about |
| Decisions | what agents decide alone; what they ask first | silence - then they guess |
| Budget | runs, minutes, preview before the full render | none - then a wrong idea is rendered at full size |

## The three tags

- `[check: junction.step <= 0.05]` - a script measures it. The inspector cannot pass the item without reproducing it.
- `[look: brick colour against reference A]` - one named thing the inspector looks for on one contact sheet.
- `[user: framing of the main view]` - only the requester can judge. It is shown at acceptance and does not hold the item open.

A line the checker refuses: `Buildings look realistic [look: facades]` - it names nothing that can be seen to be true or false.
The same line, usable: `Facade brick matches reference render A in colour and bond; no stretched or mirrored texture [look: both long facades against reference A]`.

## Worked example

```
# Brief N1-02
route: environment

## Goal
The existing surroundings within 300 m of the site are in the scene and meet the site model,
so that aerial views show the buildings in their real context.

## Reference
aerial_reference.jpg; the public terrain model and building outlines for the area

## Scope
Terrain, roads, water edge, existing buildings as plain volumes, trees only within 300 m.

## Fixed
The designed buildings and the site terrain. Cameras. Render settings.

## Acceptance
1. Surroundings meet the site model without a step [check: junction.step <= 0.05]
2. No gap along the seam [check: junction.gap]
3. No holes in the terrain other than the one under the site [check: terrain_holes]
4. No texture file missing [check: missing_textures]
5. Roads and the water edge are where the aerial reference shows them [look: roads and water edge against aerial_reference.jpg]
6. No tree or building that does not exist in reality [look: surroundings against aerial_reference.jpg]
7. The level of detail of the far zone is acceptable [user: far zone on the aerial view]

## Views
CAM_aerial_N, CAM_aerial_S

## Decisions
Agents choose mesh density and how the seam is built. Ask before leaving anything out of the reference.

## Budget
60 runs, 90 minutes. Terrain is built in tiles so that Blender stays responsive.
```

## After the work

Every remark is recorded with its cause, and the cause decides what improves:

| Cause | Meaning | What changes |
|---|---|---|
| agent | a criterion was in the brief, was not met, and was passed anyway | the defect becomes a check; the inspector's record shows it |
| brief | nothing in the brief asked for it | the criterion is added to the stage defaults, so the next brief has it |
| taste | a new wish | a new item |

A brief changed after approval is counted too. `vizflow.py quality` shows all three, so that "the agents keep getting it wrong" and "the task keeps changing" are told apart.
