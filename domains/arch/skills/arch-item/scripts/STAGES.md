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

## revise, audit
revise: [check: model.layers], [check: model.counts] and the criteria of the change itself; what must not change is listed under Fixed and read back before and after.
audit: no changes; the readback and the state of layers, ids and sheets.
