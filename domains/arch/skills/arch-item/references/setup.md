# First-time setup of a project

1. **Folder.** Create `_arch/` in the project's working folder. Copy this skill's `scripts/` to `_arch/tools/`.
2. **Init.** `python3 scripts/archflow.py --root ~/arch/<project> init`. In a project set up with an earlier version, run `init` again and copy the new tools to `_arch/tools/`: it adds the routes, plans and settings this version brings and changes nothing that exists.
3. **project.json.** Fill from what the user and the project tell you; leave empty rather than guess:
   - `archicad_file` (the original, never written), `archicad_copy_dir` (where working copies go), `template_file` (the office template with layouts, title block, pen sets and publisher sets);
   - `layers` - the layer plan: for every role the exact Archicad layer name. Read the existing layers from the template through the Archicad API and let the architect assign them to roles;
   - `tolerances`; `sheets.naming` (the pattern of sheet numbers), `sheets.publisher_set_pb` / `_pw`; `titleblock.required`;
   - `stage_lists` - copy `tools/sheets.pb.json` and `tools/sheets.pw.json` into the project, have the architect edit them for this commission and against the regulations in force, and write that day's date into `regulations_checked_on`;
   - `bim` - `ifc_export_dir` (where Archicad's IFC exports go; save the IFC translator under a name, with layers, property sets, base quantities and space boundaries switched on, so that a re-export is the same export), `id_from` (where the element id is: `name`, `tag` or a property), `id_required`, `required_props` per kind of element, `layers_extra`;
   - `rules_file` - the designer's list of numeric requirements. Copy `tools/rules.example.json` into the project; the designer replaces every placeholder number with the value in force, names the provision and signs each rule. Until then the route `rules` cannot pass, by design;
   - `impact_file` - the table of consequences. Copy `tools/impact.example.json` and edit it with the architect: the consultants of this project, the schedules it keeps;
   - `outbox_config` - what may not leave the office (wording, file kinds), the tables to check and the list of discontinued articles;
   - in the stage lists, give each sheet a `shows` line (`["story:P0"]`, `["zone:0.07"]`): a sheet that does not say what it shows is reissued after every change;
   - `rates` - optional: `person_hour`, `tokens_1k` per model, `currency`. Without rates the cost report shows quantities only;
   - `scripts` - procedures by mode; empty at first: the builder writes each on its first use. The `readback` procedure writes a snapshot in the form `tools/ifc_read.py` writes (see its docstring): one record per element with `guid`, `id`, `type`, `layer`, `story`, `zones`, `pos`, dimensions and `props`, and a `census` saying what it skipped. A path here is where the procedure lies; what makes it runnable by the operator is `archflow.py script register`, which pins its exact text.
4. **Check the API.** List the Archicad commands the installed add-on offers and record under `work/_setup/api.md` which of these the project will need are present: creating layers, walls, doors, windows, slabs, roofs, stairs, zones; reading elements, quantities and zone boundaries; creating layouts and drawings; publishing a publisher set; exporting IFC with a named translator; reading schedules and the lists of views and layouts. What is absent is told to the user before any item is opened.
5. `archflow.py plan documentation --prefix D1` (or `pw-from-pb`), and open the `estimate` item first.
