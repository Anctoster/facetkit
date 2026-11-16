---
id: resume-line
phase: [map, build, ops, close]
needs: [run]
bounds: lines=3
guards: [stale-handoff, lost-work]
ablatable: replay
---
# End with what a stranger needs to continue

Do: Close every handoff with three lines. `Next:` the single next action. `Verify:` the one command that proves the state you are handing over. `Unknown:` what you did not check. Run the Verify command yourself as your last step — `facet run -- <command>` — and put its evidence line directly above the three lines.

Check: A reader holding only this file can name the next action and run the Verify command without asking.

Stop: 3 lines. If Next needs the word "and", the handoff covers two tasks: split it.

Why: A handoff that needs its author in the room is a note, not a handoff.
