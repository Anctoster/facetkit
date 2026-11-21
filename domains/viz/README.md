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

After a model change: `swap` (new model, same materials, cameras and sun) → `env-adjust` (environment changes only within the defined area) → `render` → `pack`.

Separate commands: `audit` (read-only inspection) and `fix` (address defects).

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
