---
id: beliefs-not-grades
phase: [retro]
bounds: proposals=2
guards: [other]
footprint: [tool:retro report]
---
# Act on one-sided evidence only

Do: Read `facet retro report`. Each line is a belief with an interval, built from hard, soft and fractional evidence and fading with age. Act only on its proposals: there the whole interval is on one side. Add what you know and the journal does not: `facet retro signal --item <id> --agent <a> --dim <d> --value <0..1> --why "…"`. Never rank agents or models from fewer than five observations; quote the interval.

Check: Every change you make cites a proposal id from the report.

Stop: 2 proposals adopted per retro. The others stay in the report for next time.

Why: A grade reacts to the last item; a belief reacts to a pattern.
