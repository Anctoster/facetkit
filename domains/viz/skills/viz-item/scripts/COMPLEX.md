# Large scenes: how the work stays correct when the model is heavy

Tools that drive Blender or Archicad from a conversation fail on big models for the same few reasons: the agent tries to hold the scene in its head; one command walks the whole scene and the program stops answering; an operator-based script depends on what happens to be selected; a change meant for one object moves another, and nobody notices until the render. None of these is solved by a better prompt. They are solved by how the work is organised.

## 1. The index, not the scene

`scene_index.py` writes one record per object: type, collection, parent, bounds, zones, materials, modifiers, constraints, a fingerprint of its geometry and of its transform. Heavy meshes are fingerprinted by counts and bounds only, and the walk has a time limit — an index that hit the limit says INCOMPLETE and proves nothing.

Agents read the index digest (four lines) and query the JSON for the objects of their item. They never list the scene, and they never look at a viewport to learn what is in it.

## 2. Zones

The ground plan is cut into square tiles (`tile`, 50 m by default). Every object belongs to the zones its bounds touch. A brief's Scope names objects and, through them, zones. Checks that have a place — seam, holes, clashes, floating objects — are recorded per zone.

Cost then follows the change: an edit in two zones sends back the checks of those two zones and the checks that have no place (render settings, the sun, materials library), not the whole scene. This is the same rule as trust decay in facetkit, applied to space instead of imports.

The journal applies the same rule to everything it has ever proven: `vizflow.py stale --from <txn.json | swap.json>` reads the zones a committed change touched and prints the earlier proofs to run again - those recorded for these zones and those recorded for no zone - and how many stand untouched.

## 3. Transactions on checkpoints

The project file is never edited in place and never in the open session.

```
<blender_exe> --background <checkpoints>/scene.0007.blend --python _viz/tools/blender/txn.py -- _viz/work/<ITEM>/txn-01.args.json
```

`txn.py` indexes the scene, runs one operation script, indexes again, and compares. The operation's arguments declare beforehand what it may touch:

```json
"declares": { "objects": ["ENV_road*"], "zones": ["3_4", "3_5"], "added": 0, "removed": 0 }
```

The next checkpoint (`scene.0008.blend`) is written only when everything that changed was declared. Otherwise nothing is saved; the previous checkpoint is the rollback, and the report names what strayed. An operation that raised an error, changed nothing, or left an incomplete index is refused as well.

Consequences:
- a hang or a crash costs one background process, not the user's session — give the process a time limit and kill it when it is exceeded;
- "it also moved something else" is caught by arithmetic, at once, for every object in the scene;
- rollback is a file that already exists;
- the user's open Blender is for looking: open the latest checkpoint when a person needs to see it.

## 4. Operations are data-first

Operation scripts use `bpy.data` and mesh arrays, take every project value from their arguments, and have no dependence on selection, active object, mode or window. Where an operator is unavoidable, the script builds the context it needs and says so in its docstring. A script is registered for the operator role only after it has committed a transaction.

## 5. Fidelity in steps

Surroundings are built as proxies first (boxes for buildings, a coarse terrain), checked for position and seam, and refined only inside the zones a camera sees. Renders go preview sheet → approval → full frames. Each step has its own gate, so a wrong idea is found at the cheapest step that can show it.

## 6. Archicad side

Export in packages that can be replaced one at a time (per building, with the site as its own package), each element carrying its identifier. A model change is then: export the changed package → transaction that replaces exactly the objects of that package → materials by surface name → seam and clash checks in the zones the package touches. The rest of the scene is not re-imported and is proven untouched by the index.

## What this does not do

It does not judge whether a picture is good; that stays with the brief's `[look]` and `[user]` lines. Bounding-box clash detection finds candidates, not exact intersections. Zone-level decay assumes checks really are local; a check that is not must be recorded without zones.
