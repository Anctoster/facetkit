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
3. Frames go to a folder that holds no earlier frames of the same name `[check: render.output]` — `output`.
4. Everything the scene needs is on disk, and inside the project folder when the render runs elsewhere `[check: asset_paths]` — `asset_root`.
5. No object carries a scale that was never applied `[check: unapplied_scale]` — `scale_applied`, a name pattern.
6. Preview and final differ only in resolution and samples `[look: the same view at preview and final settings]`

`expected` may name any of: engine, size, percent, fps, transparent, format, depth, color_mode, view (the view transform: AgX, Filmic, Standard), look, exposure, gamma, display, samples, denoise, passes and aovs (lists), overwrite, frames. Name the view transform and the passes: they are what differs silently between two machines.
Goes wrong: the modelling program's sun left in; colour management changed between runs; output overwriting earlier frames; a pass the compositing needs switched off; a texture that exists only on the artist's disk.

## swap - a new Archicad model in place of the old
The route runs export, then materials. Its criteria are the export ones plus:
1. Designed surfaces look exactly as before `[check: materials.etalon]`
2. Cameras, sun and render settings are untouched `[check: invariants]`
3. The new model still meets the surroundings `[check: junction.step <= 0.05]`
4. Everything set up by hand survived: material slots, modifiers, collection and parent of every object that was there before `[check: swap.kept]` — the scene index before and after, `tools/swap_check.py`; `--allow` for objects the brief says may change or go. At least 95 % of the old model's objects (`--min-match`) must be found again by their Archicad identifier; below that the check answers SKIP, never OK - an object the import renamed looks removed and added, and what it lost is invisible. Every object that differs in anything - allowed or not - touches its zones; one without zones touches the whole scene.
5. What was added, removed and changed is listed by identifier `[user: swap-changes.md is what was intended]`
6. Frames of views the change does not reach show no difference above the threshold `[check: images.changed]` — `tools/img_compare.py <frame before> <frame after> --expect <cells, or none>`. The tool prints how fine its sieve was (the smallest full-contrast detail it can miss at this frame size) and checks the brightness of the cells that were not to change. It narrows where to look; it does not prove the rest identical.

Take the index before anything is imported; it cannot be made afterwards. `vizflow.py stale --from swap.json` then names the earlier proofs to run again.
Goes wrong: a numbered copy of a material ("Brick.001") that looks right until the library changes; a modifier lost on re-import; a new element arriving with no material; a check of the whole scene repeated when two zones changed.

## env-adjust - surroundings corrected around a change
1. Nothing outside the edit zone changed `[check: environment.unchanged]` — `zone`, the rectangle around the change.
2. The seam is clean again `[check: junction.step <= 0.05]`, `[check: junction.gap]`, `[check: terrain_holes]`

## render, pack
render: `[check: images]` (count, size, no black, blown-out, repeated or missing frames, orbit seam), `[check: invariants]`, and one `[look]` per thing that must be seen. A preview sheet is approved by the requester before the full render.
With a reference picture of the same view (an approved render, a clay preview, the frame before a change): `[check: images.changed]` - the picture differs only in the cells named, and `[check: images.noise]` - grain in flat areas within `--max-noise`. Write a `[look]` so that it names the cell: "the new balcony in C3-D3 has a railing". What the scene can answer is not asked of the picture: shadow direction is `render.sun`, an object hanging in the air is `floating`, the view is `cameras.frame`.
pack: `[check: images]` on the packed set: count, sizes, weight budget.
