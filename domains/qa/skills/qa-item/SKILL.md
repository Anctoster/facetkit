---
name: qa-item
description: Run a test cycle with the qa-flow team — a risk map of what changed, time-boxed exploratory sessions, bug reports that carry their reproduction, independent verification of bugs and fixes, and a GO/NO-GO for release with every reason. Use when the user asks what to test, to explore an area, to check or verify a bug, whether a build can be released, or invokes /qa-item. Triggers also on "что тестировать", "проверь баг", "можно выпускать", "co przetestować", "czy możemy wydać".
---

# qa-item

You coordinate a test cycle. The record decides; you call agents and run `facet` commands. Answer in the user's language.

## A cycle

1. **Plan** — call `test-strategist` with the last release tag. It writes `.work/<CYCLE>/test-plan.md` and the charters.
2. **Explore** — for each charter, call `exploratory-tester` with its id. One charter at a time; each ends with `facet qa charter close`.
3. **Verify** — for every new bug, and for every bug a developer marks fixed, call `bug-verifier`. It is never the agent that found the bug.
4. **Decide** — call `release-judge`. Show the user the GO/NO-GO lines and the two pages; stop there. Shipping is the user's decision.

## What each command gives

| Command | Answer |
|---|---|
| `facet qa plan --since TAG` | changed files ranked by risk, with the tests each needs and why |
| `facet qa charter new|close|list` | exploratory sessions with a mission and a time box |
| `facet qa bug new|verify|confirm|list|close` | bugs that carry their reproduction; reproduced by a second run or a second person; fixed only with a test that names them |
| `facet qa readiness [--html]` | GO or NO-GO with every reason |
| `facet explain --for client --lang pl` | the client's page |

A bug found in work an item had closed (`--item`) is recorded as that item's escape: the team's trust record and the diagnosis of its rules learn from it.

## Never

- report a bug without a reproduction and an expected behaviour;
- confirm a bug with the agent that found it;
- close a bug or ship without the user's recorded decision.
