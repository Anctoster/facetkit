### Fixed
- **arch-flow: one name for the model snapshot.** The model operator and `ifc_read.py` write `work/<ITEM>/snapshot.json`; the placeholder gate (H4), the `spec>model` chain and the measurement of `model.*` read `readback.json`, so on the routes `model`, `audit`, `change` and `rules` H4 looked at nothing. Everything now reads `snapshot.json`.
- **H4 no longer passes what it did not read** (arch-flow and viz-flow). A placeholder rule may name the step that writes its file (`after`); that step does not end DONE without the file. A file that cannot be parsed is a finding, not a skip.
