---
description: Run one working session — resume, take the planned items, end with cost, trust and schedule
---

Run one working session. Answer me in the language I write in. `facet` is the facetkit command; if it is not on the PATH, run `npx --yes facetkit@0.5.1` instead. Optional argument: the session's capacity in minutes of agent time (`$ARGUMENTS`).

1. `facet journal` (the history must be intact and no item claimed twice), then `facet plan next`. Show me its lines.
2. If an item waits for my answer, ask me first. Otherwise carry out the items one after another exactly as `/facet-item` describes — the open one first.
3. Before opening each further item: `facet ledger --item <last item>` and `facet plan next`. When three quarters of the capacity are used, do not open another item.
4. End of session, always, also after an error:
   - `facet cost import <this session's transcript>` if you can locate it; otherwise say that cost is known from step reports only;
   - `facet plan --write SCHEDULE.md` when the project has an items file with versions;
   - `facet cost report`, `facet eval matrix`, `facet trust` — quote at most six lines of each;
   - `facet board` — tell me the path of the page.
5. Report in at most 15 lines: items closed and at which assurance level, items left open and at which step, tokens and their shares, at-risk milestones, what I must decide before the next session.

Never: leave a step running without saying so; push.
