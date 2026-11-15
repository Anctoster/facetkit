# First-time setup of a project

1. **Folder.** Create `_arch/` in the project's working folder. Copy this skill's `scripts/` to `_arch/tools/`.
2. **Init.** `python3 scripts/archflow.py --root ~/arch/<project> init`.
3. **project.json.** Fill from what the user and the project tell you; leave empty rather than guess:
   - `archicad_file` (the original, never written), `archicad_copy_dir` (where working copies go), `template_file` (the office template with layouts, title block, pen sets and publisher sets);
   - `layers` - the layer plan: for every role the exact Archicad layer name. Read the existing layers from the template through the Archicad API and let the architect assign them to roles;
   - `tolerances`; `sheets.naming` (the pattern of sheet numbers), `sheets.publisher_set_pb` / `_pw`; `titleblock.required`;
   - `stage_lists` - copy `tools/sheets.pb.json` and `tools/sheets.pw.json` into the project, have the architect edit them for this commission and against the regulations in force, and write that day's date into `regulations_checked_on`;
   - `scripts` - procedures by mode; empty at first: the builder writes each on its first use.
4. **Check the API.** List the Archicad commands the installed add-on offers and record under `work/_setup/api.md` which of these the project will need are present: creating layers, walls, doors, windows, slabs, roofs, stairs, zones; reading elements, quantities and zone boundaries; creating layouts and drawings; publishing a publisher set. What is absent is told to the user before any item is opened.
5. `archflow.py plan documentation --prefix D1` (or `pw-from-pb`), and open the `estimate` item first.
