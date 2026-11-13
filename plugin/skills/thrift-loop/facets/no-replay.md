---
id: no-replay
phase: [rework, close]
bounds: rewrites=1, lines=8
guards: [budget-burn]
---
# Point at what exists; do not repeat it

Do: Cite instead of copying: `path:lines#hash` for code, `log:line` for output, a file name for an earlier handoff. Do not restate the task, the rules or what the previous agent wrote. Put results in a table. Keep the final message to the caller within 8 lines: status, handoff path, the one fact the next agent needs.

Check: The handoff is inside its line limit and the final message is 8 lines or fewer.

Stop: 1 rewrite to fit the limit. Still over? Cut explanations before facts, then hand in as is with the overflow named.

Why: Every repeated line is paid for again by every reader that comes after.
