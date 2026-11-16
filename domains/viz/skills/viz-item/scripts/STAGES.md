# Stages of a visualization project

For each stage: what it must deliver, the default acceptance lines (copy into the brief, drop what does not apply), the `project.json` keys its checks need, and how it usually goes wrong. `vizflow.py plan new-project` lists the stages in order; `plan model-change` lists the ones repeated when the model changes.

## export - the source model out of Archicad
Holds for any link between Archicad and Blender: a live-sync add-on, IFC, FBX, glTF, Collada. The method may change; these properties may not.

1. Scale is 1:1 in metres, proven on an element of known size `[check: export.scale]` — needs `export.reference` (an object and its true size).
2. The model lands in the same place on every export `[check: export.position]` — needs `expected_bbox`, recorded from the first approved export.
3. Every element keeps a stable identifier from Archicad, none repeated `[check: export.ids]` — needs `export.id_property`. Without it a later model cannot be matched to this one.
4. One material slot per Archicad surface, under the surface's own name, no numbered copies `[check: export.surfaces]` — needs `export.required_surfaces`. Materials are assigned by these names later.
5. No element exported twice `[check: export.duplicates]`
6. Size stays workable `[check: export.budget]` — `max_polys`, `max_objects`.
7. The expected number of elements per group arrived `[check: export.counts]` — optional; counts from an Archicad schedule.

Record once in `project.json` → `site`: which point is the origin, the level that ±0.00 stands for, and the angle between +Y and true north. Save the export settings under a name in Archicad, so that a re-export is the same export.
Goes wrong: millimetres read as metres; a different origin on re-export; hidden layers or 2D exported; surfaces merged or renamed by the exporter; curved elements over-tessellated.

## environment - the existing surroundings, joined to the site
1. The surroundings meet the site model without a visible step `[check: junction.step <= 0.05]`
2. No gap between them `[check: junction.gap]`
3. The terrain has no holes other than the one the site sits in `[check: terrain_holes]` — set `expected_holes`.
4. No texture file is missing `[check: missing_textures]`
5. Roads, water and neighbouring buildings are where the reference shows them `[look: position of roads, water edge and the nearest buildings against the reference]`
6. The level of detail falls off with distance as agreed `[user: near, middle and far zones]`

Use real data for what exists (terrain model, building outlines, aerial imagery) and say in the brief where it comes from. When the stage is approved, write the baseline (`stage_checks.py`, group `environment`, `write_baseline`) and put its path in `project.json` → `baseline.environment`.
Goes wrong: surroundings and site overlap and flicker; the cut-out is the wrong size; surroundings sit at a different datum; invented trees and buildings.

## materials - surfaces from the approved library
1. Every designed surface uses a material of the approved library, unchanged `[check: materials.etalon]`
2. Every object has a UV map `[check: materials.uv]`
3. Textures have their real-world size `[check: materials.tile_size]` — `tile` per material, e.g. the length a brick texture covers.
4. No texture file is missing `[check: missing_textures]`
5. Facades match the reference render `[look: brick colour and bond, glass, frames against the reference]`

The approved library is a separate file; this stage links or copies from it and never edits it.
Goes wrong: materials matched by a name the exporter changed; texture scale off by the export scale; the library edited in place.

## cameras
1. The required cameras exist `[check: cameras.required]`
2. Each shows the whole subject `[check: cameras.frame]`
3. Nothing is cut off by the far clip `[check: cameras.clip]`
4. Lenses are in the agreed range `[check: cameras.lens]`
5. The orbit is a true ring: equal steps, one radius, one height `[check: cameras.orbit]`
6. Framing matches the reference `[user: framing of the main views]`

Goes wrong: a camera inside geometry; an orbit that jumps at the seam; a horizon that tilts.

## render-setup
1. Render settings are the agreed ones `[check: render.settings]` — `expected` settings.
2. One physical sun, where the real sun stands at that place and time `[check: render.sun]` — `site.lat`, `site.lon`, the date and hour in UTC, `site.north_offset_deg`.
3. Preview and final differ only in resolution and samples `[look: the same view at preview and final settings]`

Goes wrong: the modelling program's sun left in; colour management changed between runs; output overwriting earlier frames.

## swap - a new Archicad model in place of the old
The route runs export, then materials. Its criteria are the export ones plus:
1. Designed surfaces look exactly as before `[check: materials.etalon]`
2. Cameras, sun and render settings are untouched `[check: invariants]`
3. The new model still meets the surroundings `[check: junction.step <= 0.05]`
4. What was added, removed and changed is listed by identifier `[user: the list of changes is what was intended]`

## env-adjust - surroundings corrected around a change
1. Nothing outside the edit zone changed `[check: environment.unchanged]` — `zone`, the rectangle around the change.
2. The seam is clean again `[check: junction.step <= 0.05]`, `[check: junction.gap]`, `[check: terrain_holes]`

## render, pack
render: `[check: images]` (count, size, no black, blown-out, repeated or missing frames, orbit seam), `[check: invariants]`, and one `[look]` per thing that must be seen. A preview sheet is approved by the requester before the full render.
pack: `[check: images]` on the packed set: count, sizes, weight budget.
