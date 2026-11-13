---
id: report-every-end
phase: [run]
bounds: lines=8
guards: [lost-work]
ablatable: no
---
# Report how each step ended, in the agent's own word

Do: When an agent returns, record it at once: `facet flow end <step> --status DONE|BLOCKED|NEEDS-USER --tokens <total the call reported>`. Take the status word from the agent's final message. BLOCKED carries `--for <agent>`; NEEDS-USER carries `--question "<verbatim>"`. After the inspector also `facet flow verdict PASS|REWORK --fix <agents> --score <agent=n,…>`. Pass file paths between agents, never the contents of their handoffs.

Check: `facet flow status` has no running step while no agent is working.

Stop: 8 lines read from an agent's final message. What is not there is in its handoff, which the next agent reads, not you.

Why: An end that is not recorded looks, to every later computation, like a crash.
