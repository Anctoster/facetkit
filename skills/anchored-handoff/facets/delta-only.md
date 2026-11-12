---
id: delta-only
phase: [rework]
bounds: passes=1
guards: [budget-burn]
---
# Hand over the difference

Do: Write what changed since the previous handoff of this item: decisions taken, facts learned, state that moved. Refer to earlier handoffs by file name. For sections with nothing new write "unchanged". Under rework, append a short dated section rather than rewriting the file.

Check: Pick three sentences of your handoff; `grep -F` finds none of them in the earlier handoffs of the item.

Stop: 1 pass. Do not polish a delta into a full report.

Why: The reader already paid for the earlier handoffs; charging for them again buys no new information.
