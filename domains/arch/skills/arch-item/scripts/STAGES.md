# Routes: what each delivers, default acceptance lines, how it goes wrong

## estimate - dates and the risk of missing them
1. Every work package has a best, likely and worst estimate, and every risk a probability [check: schedule.inputs]
2. The chance of missing the deadline is within the agreed limit [check: schedule.result]
3. The estimates of hours are the office's own [user: hours per package]

Criteria for dates and risk, in `tools/schedule.py`:
- three dates instead of one: 50 %, 80 % and 95 % certainty. Promise the 80 % date; plan to the 50 % one;
- the chance of missing the deadline: up to 15 % GREEN, up to 40 % YELLOW, above RED;
- the reserve in working days between the 80 % date and the deadline;
- the longest chain: how often each package decides the finish;
- calibration: hours are scaled by the median of actual / estimated from at least three finished projects; until then the result says NOT calibrated.

Risks worth listing for documentation work: source material late, incomplete or contradictory; scans without dimensions; the client changing the layout after a stage is issued; agreements and opinions of third parties; a change of required content during the work; one person on the longest chain; a sheet template that is not ready; consultants' drawings arriving after the architectural set.

Measures that shorten the work, each reported with its gain in working days: list missing inputs on day one with a date for each; have every stage's layout signed off as frozen; start waiting periods early with a partial set; put a second person on the longest chain or split it; build the executive set from the building set's sheets instead of redrawing; run a pilot on one storey or one sheet before the whole.

## variants - several ways to do it, before anything is drawn in detail
One item per aspect, in this order, each building on the choice before it: the site plan, the layouts, the facades.

1. At least three variants, each with its idea in one line, its geometry and every number the comparison needs [check: variants.inputs]
2. Every variant is tested against the limits given for the plot; at least one keeps them all, and one that does not is shown and marked [check: variants.limits]
3. The variants differ in kind: no two are within 5 % of each other on every criterion [check: variants.distinct]
4. They are scored by the weights given, and those no other variant beats on every criterion are named [check: variants.compared]
5. The chosen variant is one of the set and keeps every limit [check: variants.chosen]
6. The choice is the architect's [user: the variant, and what the next stage takes from the others]

Indicators the tool computes from the geometry. Site: plot and footprint area, coverage, gross area and intensity, biologically active share, smallest distance to the boundary, height, parking places per flat, usable-to-gross efficiency. Layouts: number of rooms, usable area, share of circulation. Facades: share of glazing and how much of it faces south. Anything else the architect weighs - a cost index, a count of flats with two exposures - goes in as a number under `extra`.

The limits are the architect's statement of what the local plan or the decision on building conditions allows; the tool tests against them and knows no regulation itself.
Goes wrong: three versions of one idea; a favourite dressed as a comparison; a variant that breaks a limit quietly removed; numbers typed instead of derived; the highest score presented as the decision.

## intake - sources into a checked description
1. Every element has an id, a layer role and the source it was read from [check: spec.schema]
2. Every raster drawing is tied to a written dimension, and several agree [check: spec.scale]
3. Every element is on a layer of the layer plan [check: spec.layers]
4. Stories follow one another without gaps [check: spec.stories]
5. Walls are plausible and none is doubled; wall ends meet and outer outlines close [check: spec.walls], [check: spec.loops]
6. Openings fit their walls [check: spec.openings]
7. Room outlines give the areas the source states [check: spec.zones]
8. Nothing uncertain is left without a question, and no question is open [check: spec.confidence], [check: spec.questions]
9. The description is what the task asks for [user: stories, rooms and overall dimensions in reading.md]

Goes wrong: a distorted scan read by pixels; a dimension chain read as one dimension; inner and outer faces confused, so every room is one wall thickness off; a thickness guessed; two drawings that disagree and one silently chosen.

## model - the description into Archicad
1. Every element of the description is in the model and nothing else is [check: model.counts]
2. Every element is on the layer its role maps to [check: model.layers]
3. Lengths, thicknesses and widths agree with the description [check: model.dimensions]
4. Room areas agree with the source [check: model.areas]
5. The room program of the task is met [check: model.program]
6. No question was open when building started [check: spec.questions]
7. Walls join cleanly at corners and T-junctions [look: wall junctions on each story's plan]

Goes wrong: elements on the default layer; reference lines on the wrong face; openings flipped; stories' heights not set before walls; elements without the id property.

## sheets-pb - drawing set of projekt budowlany
1. Every sheet and document of the confirmed stage list exists, and nothing else is published [check: sheets.complete]
2. Sheet numbers follow the office pattern and titles match the list [check: sheets.naming]
3. Every sheet carries its drawing at the required scale, on the required format [check: sheets.scales], [check: sheets.format]
4. A DWG accompanies every sheet [check: sheets.dwg]
5. Title blocks are complete and agree with the list [check: titleblock.fields]
6. Dimensions, levels, room names and areas are present and legible [look: each plan and section sheet]
7. The set has the content the regulations in force require for this building [user: the stage list, confirmed by the designer]

`tools/sheets.pb.json` is a starting list for the architectural part, organised as the regulation organises a building design: plot development plan, architectural-construction design, technical design, each with a title page, a table of contents, a descriptive part and a drawing part. It is not the regulation. The designer confirms it for the project and the date; the scales in it are the office's choice within what the regulation allows.

## sheets-pw - drawing set of projekt wykonawczy
The same lines as `sheets-pb`, plus:
8. Every sheet details a sheet of the building design, and none of those is dropped [check: sheets.trace]
9. Details, schedules of joinery and finishes exist for everything the building set shows only in outline [look: detail and schedule sheets]
10. The scope matches the contract [user: the stage list against the contract]

The executive design supplements and details the building design to the degree needed for bills of quantities, costing, tendering and building; its scope is what the client and the contract set. Work from the PB model and sheets: change the model, not the drawing.

## revise - a change to an existing model
1. The change is made as described [check: model.counts], [check: model.layers] and the criteria of the change itself
2. Both snapshots hold what the comparison needs - the position and sizes of every element, and no unread records [check: change.complete]
3. Nothing outside the declared scope changed [check: change.declared] — a snapshot before and after, `tools/model_diff.py --declared "<ids, patterns, zone:…, story:…>"`
4. The consequences are the intended ones [user: `change.md` - sheets to issue again, who checks what again]

The brief's Scope names what may change by id or by room; a room covers the walls, doors and windows that bound it (when the snapshot carries room links). After the item closes, `archflow.py stale --from change.json` sends back exactly the proofs the change touched.
Goes wrong: a neighbouring wall dragged along with the one that was moved; a zone not updated after its wall moved; the change made in the drawing instead of the model; every earlier check thrown away because "the file changed".

## change - what a new version of a model changed
1. Both snapshots hold the position and sizes of every element, and no unread records [check: change.complete]
2. Every element can be followed from one version to the next [check: change.listed]
3. What changed is what was announced [user: the list in `change.md`]

"Nothing changed" is said only when the first line holds. A wall that moved keeps its length: without positions the comparison is blind to it, and says so instead of saying "identical". Shapes are fingerprinted for files up to 80 MB (`ifc_read.py --max-mb`); above that the reader says shapes were not compared.

For a model that somebody else changed - a colleague, a consultant, the client's revision. Two IFC exports are enough: `ifc_read.py` each, then `model_diff.py` with the office's table of consequences and the stage list. No change is made by this route.

## audit - the state of a model, without changes
0. The snapshot is complete: no unread records, a known length unit, and every element with the fields its kind needs (story; position and length of walls; position and width of doors and windows; number and area of rooms) [check: bim.complete] — more per kind in `bim.required_fields`
1. Every element has a key of its own, and the kinds that need an id carry one [check: bim.ids]
2. Every element is on a layer the plan gives its kind [check: bim.layers]
3. Required properties are filled in [check: bim.props] — `project.json` → `bim.required_props`
4. Room areas agree with the task [check: bim.areas] — a room program with `area_m2`

`tools/model_audit.py` on a snapshot. Clashes are not in the snapshot: run Archicad's collision detection and record its count as a criterion of its own (`[user: collision report]`).

## rules - the model against the designer's list of requirements
1. Every rule names its provision and the designer who confirmed the number [check: rules.confirmed]
2. Every rule found the elements it is about, and each could be measured [check: rules.coverage]
3. Every measurement is within its limit [check: rules.values]
4. The list is the right one for this building [user: the rules list, signed and dated] — recorded with `archflow.py sign <rules file> --by <designer>`; the journal takes the tool's result only against the signed text

The tool measures; the designer owns the numbers. A rule that matches nothing has not passed - usually the rooms are named differently from what the rule expects. Widths of rooms are the narrowest place of the outline; what needs the surroundings (insolation, distances to neighbours) is outside this route.
Goes wrong: numbers copied from an old project; a rule written for a room name nobody uses; a result read as "complies with the regulations".

## trace - a delivered set against the task
1. The task is cut into numbered clauses, each with the place it comes from [check: trace.clauses]
2. Every clause is answered in the set, by a person's dated word, or withdrawn by name [check: trace.covered]
3. The delivered schedules hold nothing the task did not ask for [check: trace.extras] — needs `inventory`; optional
4. The clauses are the task [user: the list of clauses]

The search expression of a piece of evidence must hold a word of at least four letters and may not be longer than 120 characters: "find anything" finds everything and proves nothing. The report (`--md`) shows the row that was found beside every clause - "found" means that row, so read it. When one row answers several clauses the tool says so. A clause that addresses its reader instead of describing the building is shown to the architect, not acted on. After the gate the confirmed list is signed (`sign requirements.json`).

One clause - one requirement that can be found: "underfloor heating in the hall", not "comfortable heating". Evidence points at a table row by a search expression, at a sheet, or at elements of the model; the tool goes and looks. Use it on the office's own set before the client sees it, and on consultants' drawings and schedules when they arrive.
Goes wrong: a clause split so coarsely that anything answers it; evidence pointing at a sheet that exists but does not show the thing (give `find`); "confirmed by phone" with no name and date.

## issue - a folder before it is sent
1. No working file is in the set [check: outbox.files]
2. Every file of a kind the tool reads was read to its last page [check: outbox.read] — a scanned page, or drawing text turned into outlines, is named as not read; the architect looks at those files and waives the check by name
3. In what was read: no office-only wording, no review comment, no tracked change left unaccepted, no hidden text or sheet [check: outbox.internal]
4. The names stored in the files' properties are ones that may go out [check: outbox.metadata] — `allowed_authors`; optional
5. Required cells of the schedules are filled [check: outbox.tables]; no discontinued article [check: outbox.articles]; areas agree with the model [check: outbox.areas] — each needs its part of `outbox_config`
6. This is the set to send [user: the list of files and the addressee]

`issue` is a release: it does not open while proofs that a change sent back wait to be re-run (`archflow.py stale status`). An OK from this tool means "nothing found in what was read", never "the folder is clean".

DWG files and pictures are not read: one look at each remains the architect's.

## What a result covers
A result names what a later change must touch to send it back (`stale`):
- `model` - claims about every element (`bim.*`, `rules.*`, `model.*` from `spec_compare`): any change of the model sends them back, a new story included;
- `sheet:<no>` - a sheet; a model change touches the sheets that show the touched stories or rooms, every sheet that does not say what it shows, and every sheet when an element on no story changed;
- `revision:<hash>` - claims about one pair of snapshots (`change.*`): true for that pair whatever changes later.

## Exit codes of the tools
0 - everything the tool can check was checked and passed; 1 - something failed; 2 - nothing failed, but a part was not checked (SKIP). The journal decides PASS from the recorded results, not from the exit code; the code is for running a tool on its own.
