# First-time setup of a project

Do this once per project, yourself (no agent needed). Ask the user only for what you cannot find.

1. **Folder.** Find the project's working folder among the connected folders (ask for access if none is connected). Create `_viz/` there.
2. **Tools.** Copy everything from this skill's `scripts/` to `_viz/tools/` (keep the `blender/` subfolder). Scripts written for this project later go to `_viz/tools/project/`.
   Then prove the Blender scripts on this machine, in a separate background Blender that opens no project file: `blender --background --factory-startup --python _viz/tools/blender/selftest_blender.py`. The last line must be `SELFTEST PASS`. If it is not, stop: report the lines above it and open nothing until they are fixed - checks that do not work on this Blender version would report SKIP on every item.
3. **Init.** In the workspace: `python3 scripts/vizflow.py --root ~/viz/<project> init`. It writes `routes.json` and a `project.json` template.
4. **project.json.** Fill it from what the user and the folders tell you. Leave a field empty rather than guess:
   - `viz_dir`, `blend_working` (the scene the website's pictures come from), `blend_copy_dir` (where item copies are saved),
   - `etalon_library` (the .blend with the approved materials), `archicad_source`, `sync_method`,
   - `designed_pattern` (object names of the designed buildings), `terrain_pattern`, `height_limit_m`,
   - `render` (frames, size, batch), `web` (widths, format, quality, max_kb),
   - `tile` (zone size in metres, 50 by default), `blender_exe` (the full path of the Blender program, for headless runs), `checkpoints` (the folder for numbered copies of the scene),
   - `site` (latitude, longitude, the angle between +Y and true north, what ±0.00 stands for) and `export` (the identifier property, a reference object of known size, the surface names that must arrive),
   - `scripts` - the project's own scripts by mode: `{"export": "...", "materials": "...", "render": "..."}`. A missing script is fine: the journal sends that step to the builder, who writes and registers it; from then on the operator runs it on the smallest model.
5. **Baseline.** With the working scene open in Blender, run `scene_digest.py` (see `tools/LAUNCH.md`) with `out` set to `_viz/baseline/scene.json`, and write the path into `project.json` → `baseline.scene`. This is what "the quality and the textures must not change" is measured against. Take a new baseline only when the user approves a new look.
6. Copy the mirror's `project.json`, `routes.json` and `journal.jsonl` to `_viz/` on the computer.
7. For a new project: `vizflow.py plan new-project --prefix N1`. For an existing scene: run the first item on the `audit` route - it changes nothing and shows the state of the scene.
