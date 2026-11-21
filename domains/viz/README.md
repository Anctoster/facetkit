# viz-flow

**A controlled agent workflow for producing sales-site visuals**  
`Archicad → Blender → renders → website images`

viz-flow adapts the FacetKit workflow (MIT) from software development to architectural scenes and visual assets. It coordinates agents through a brief, a project journal, independent checks, preview approval, and recorded feedback.

## How it works

1. A task is opened as a **work item** on one of the available routes. Start a new project with `plan new-project`; after a model change, use `plan model-change`.
2. Every work item starts with a **brief**: the expected result, what must not change, and up to 9 acceptance criteria. Each criterion is tagged:
   - `[check]` — measured by a script
   - `[look]` — visually reviewed by an inspector on a single contact sheet
   - `[user]` — decided by you

   Vague briefs are rejected. You approve the brief once, before work begins.
3. The journal (`_viz/journal.jsonl` in the project folder) determines the next step, agent, and model.
4. An independent inspector reruns the checks. The journal accepts `PASS` only when every required check returns `OK` in that same run. “Not run”, “skipped”, and “failed” all block acceptance.
5. Before an expensive render, you approve a preview contact sheet.
6. After closing the work item, each comment is recorded with a reason: `agent` (criterion existed but was not met), `brief` (the brief did not specify it), or `taste` (a new preference). A comment becomes a new work item; a defect becomes a new check.

The working scene, approved material library, and original Archicad project are not modified. Work is performed on copies.

## New-project stages

| Stage | What scripts check |
|---|---|
| `export` — model from Archicad | Scale against a reference object, position, element IDs, surface names, duplicates, file size |
| `environment` — existing surroundings | Step and gap at the site-model boundary, terrain holes, textures |
| `materials` — surface materials | Match against the approved library, UVs, real-world texture scale |
| `cameras` — cameras and orbit | Presence, subject in frame, clipping, lenses, even orbit spacing |
| `render-setup` — render settings | Settings against a checklist; sun position by location, date, and time |
| `render`, `pack` | Frame count, dimensions and file size; black, overexposed, duplicate or missing frames; orbit seam |
| Any scene edit | Only declared changes (`txn.contract`); flipped normals, objects, unsupported objects, intersections, unused data |
| Before a render | Unapplied scale; missing files and files outside the project folder (`asset_paths`); passes and colour profile against the checklist; an output folder without old frames (`render.output`) |
| After a model swap | Materials, modifiers, collection and parent of every object survived (`swap.kept`) |
| Two frames of one view | Where exactly the frame differs from the reference, and only where it should (`images.changed`); grain in flat areas (`images.noise`) |

After a model change: `swap` (new model, same materials, cameras and sun) → `env-adjust` (environment changes only within the defined area) → `render` → `pack`.

Separate commands: `audit` (read-only inspection) and `fix` (address defects).

### What survives a model swap

A re-import silently loses what the exporter does not know about: a material slot comes back empty or as a numbered copy (`Brick.001`), a modifier disappears, an object drops out of its collection. `swap_check.py` compares the scene index before and after the swap by Archicad IDs and names every such loss, as well as what was added, removed or changed shape. If fewer than 95 % of the old model's objects are found again (outside `--allow`), the answer is "cannot conclude", never OK. The same file goes to the journal: `vizflow.py stale --from swap.json` sends back only the checks of the zones touched and those that have no place.

### Numbers first, then a look

"Checking the picture with the model's eyes" is the most expensive and least reliable step, so it is narrowed:

1. What can be measured in the scene is measured in the scene, not in the picture: sun and shadow direction — `render.sun`, floating objects — `floating`, flipped surfaces — `inverted_normals`, framing — `cameras.frame`.
2. `img_compare.py` compares a frame with a reference (an approved render, a clay preview, the same frame before the model swap) cell by cell and says **where** the frame changed and whether only where it should; if most of the frame changed, it is the camera, lens, sun or exposure, not a detail. It also says how fine its sieve was (the smallest contrasting detail it can miss) and catches an overall brightening or darkening outside the expected cells. Grain in flat areas is measured separately.
3. The inspector looks only at the named cells and answers in a fixed form: what it looked for, in which cell it found it or "no", and one detail from the same frame that the brief did not ask about. Without it, the answer counts as "not seen", not "all fine".

Stage criteria usable with any Archicad–Blender connection are in `skills/viz-item/scripts/STAGES.md`. The brief format and example are in `skills/viz-item/references/brief.md`.

## Working with complex models

Heavy scenes tend to break agents and plugins for familiar reasons: an agent tries to keep the whole scene “in its head”, a command traverses the entire scene and hangs, scripts depend on the current selection, or editing one object silently moves another. viz-flow addresses these through workflow design, not prompt instructions:

1. **Index, not the scene.** `scene_index.py` writes one row per object: bounds, zones, materials, modifiers, geometry fingerprints, and transforms. Agents read the index, not the scene. Traversal is time-limited; an incomplete index proves nothing.
2. **Zones.** The plan is divided into grid cells (50 m by default). An edit in two zones reruns checks for those zones and non-local checks (sun, render settings), not the entire scene.
3. **Transactions on checkpoint copies.** The project is never edited in place or in an open session. Each change runs in a separate background Blender process through `txn.py`: index → operation → index → comparison. The operation declares which objects and zones it may affect. A new copy is saved only if changes stay within that scope; otherwise nothing is saved and the previous copy remains the rollback point.
4. **Selection-independent operations.** Scripts use data APIs (`bpy.data`), not UI operators.
5. **Stepwise precision.** Start with placeholders and rough terrain; check placement and boundaries, then add detail only where the camera sees it.
6. **Archicad in batches.** Export buildings by element IDs. Replacing a model changes only that batch; the rest of the scene is not re-imported.

Details: `skills/viz-item/scripts/COMPLEX.md`.

## Agents

| Agent | Model | Responsibility |
|---|---|---|
| `viz-conductor` | Haiku | Creates the brief; asks all questions in one list before work starts |
| `scene-cartographer` | Haiku | Read-only scene metrics and defect discovery |
| `scene-operator` | Haiku | Runs registered scripts in batches |
| `scene-builder` | Sonnet | Writes and registers a stage script when none is suitable; the operator then runs it on Haiku |
| `viz-inspector` | Sonnet (Haiku for numeric checks) | Independent inspection, records results, issues a verdict |

The model is upgraded by one tier after two failed step attempts and downgraded again after a successful step.

## Evaluating agent quality

`vizflow.py quality` reports:

- **Agents** — for each agent + model pair: how many work items the inspector returned, plus a recommendation: reliable, monitor, upgrade model, or “insufficient data” (fewer than 5 work items).
- **Inspector** — how many accepted work items later turned out to contain a defect.
- **Briefs** — comments caused by missing criteria and briefs changed after approval.
- **Process bypasses** — skipped checks, forced steps, preview rounds, and token use by model.
- **Where remarks come from** — after which stages your remarks arrive.

## What you can trust

- **A check result is accepted only with a receipt** — the hash of the code of the tool that produced it. An "OK" typed by hand, or a file from an edited copy of a script, is not accepted.
- **A script for the smaller model is pinned by its text.** Registration writes the script's hash to the journal; a transaction that ran a changed script is not evidence until the script passes the builder and the inspector again.
- **A task ID is only a folder name.**
- **An anchor outside the project folder.** When a task is closed, the journal prints an `ANCHOR number:hash` line for the report and the project notes; `verify --anchor` later shows whether the record was rewritten.
- **The decisions taken in your name** are listed at closing: approvals, waived checks, forced steps, registered scripts.
- **After a model swap nothing goes to the website until the checks sent back are repeated** — the `pack` route does not open.
- **A journal entry is not lost when two sessions work at once**; the lock is released only if its owner has really finished.

A receipt proves which code produced a result, not that the code is right; names in the journal are written by whoever runs the command — that is why they are shown to you; the journal is not protected from the owner of the computer.

## What a revision costs

`vizflow.py cost report` — for each work item: tokens, tool time and the recorded time of rendering, the render farm and people (`cost add --kind render|farm|person --minutes …`; rates in `project.json` → `rates`). A work item opened in answer to a remark (`open --origin <ITEM>`) goes into the "revisions after acceptance" line with its cause: not in the brief, a new client wish, a missed defect. This shows the cost of each revision, render hours included.

## Scene memory

`vizflow.py memory add --where 3_4 --text "…" --by <name>` ties a lesson to a scene zone, object or camera; the next task in that place gets it in its brief. A lesson with an anchor is marked STALE if the place has changed since. A lesson written by an agent is only a proposal: it goes into a brief after you confirm it (`memory confirm`).

## Are the agents worth it?

`vizflow.py efficiency [--lang ru|pl|en] [--html FILE]` reports by task type: first-time-right rate, acceptance without comments, your time versus manual work, agent time, tokens and cost, questions and preview rounds, defects caught by checks, and which model performs best.

Record two values:

```bash
vizflow.py hand <TASK> --hours H --by NAME
```
Record how long the task would take manually **before** starting the agents.

```bash
vizflow.py spent <TASK> --minutes M --on review
```
Record your review time.

See the arch-flow README section **“Are agents worth it for your tasks?”**.

## Scripts and self-tests

All scripts are purpose-built for this workflow; third-party Blender skill packs are not used.

`blender/selftest_blender.py` creates a small scene in a separate background Blender process. Each check must pass where it should and fail where it should not:

```bash
blender --background --factory-startup --python _viz/tools/blender/selftest_blender.py
```

Tests that do not require Blender:

```bash
python3 -m unittest discover -s tests
```

## Getting started

Ask: **“Run a viz-flow task: …”**  
Or invoke `/viz-item`.
