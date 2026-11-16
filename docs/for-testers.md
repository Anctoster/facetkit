# facetkit for testers

A tester answers three questions every release: **where to look**, **is this really a bug**, **may we ship**. facetkit answers each from the code and the record, so the answer can be checked by somebody else — and what a tester finds flows back into how far the team can be trusted.

```
what changed ──► facet qa plan ──► charters ──► exploratory sessions ──► bugs with a reproduction
                                                                                │
                      facet trust, facet skill coverage ◄── escapes ◄───────────┤ (a bug in closed work)
                                                                                ▼
                                   facet qa readiness ◄── verified fixes ◄── facet qa bug verify
```

## 1. Where to look — a risk map, not a hunch

```bash
facet qa plan --since v1.4.0 --top 20
```

```text
  high    20.4  src/price.js  [api, used by 3, 7 commits, 1 escaped defect(s)]
           → contract tests for its 3 consumer(s): the same request, old and new code
           → changed in 7 commits: regression tests around the last changes
           → 1 defect(s) were found here after acceptance: re-test those cases first
  high    12.0  src/auth/session.js  [security, used by 1]
           → abuse cases: wrong role, expired session, forged input, rate limits
```

Each changed file is weighed by its class (security, API, operations, code, style, docs), how many modules depend on it, whether any test reaches it (an untested file counts double), how often it changed, and whether defects escaped there before. Each row says which kinds of tests it calls for and why.

## 2. Explore inside a time box

```bash
facet qa charter new C1 --mission "explore checkout with expired cards to discover silent failures" --areas src/pay.ts --minutes 60
facet qa charter close C1 --minutes 55 --bugs BUG-7 --covered src/pay.ts
```

A charter is a mission and a time box. Closing it records what was really covered — the release decision later asks whether every high-risk area was tested or explored.

## 3. A bug is a reproduction, confirmed by someone else

```bash
facet qa bug new BUG-7 --title "total ignores quantity" --expect "total = price × quantity" \
      --repro "npm test -- -t total" --severity critical --item P07 --area src/price.js
facet qa bug verify BUG-7          # runs the reproduction 3 times
```

| The reproduction | Status |
|---|---|
| fails every time | `reproduced` |
| never fails | `not-reproduced` — ask for the missing condition |
| fails sometimes | `flaky` — a finding of its own: name the condition |
| (after the fix) passes every time | `fixed` — but nothing guards it yet |
| passes, and a test file names `BUG-7` | `verified` |

Bugs with manual steps count once **a second person** reproduced them (`facet qa bug confirm BUG-8 --by bob`) — never on the finder's word. Closing a bug without a verified fix is a person's recorded decision (`facet qa bug close … --reason … --by …`).

`--item P07` says the defect is in work that item had closed. It is recorded as P07's **escape**: `facet trust` counts it against the team, and `facet skill coverage` points at the rule that should have stopped it (with `--mode`, the cause from `facet skill modes`).

## 4. May we ship — GO or NO-GO, every reason listed

```bash
facet qa readiness --since v1.4.0 --html readiness.html
facet explain --for client --lang pl --html status.html     # the same state, in the client's words
```

Stops the release: an open blocker or critical bug; an item closed below the level the project requires; a high-risk change that no test reaches and no charter explored. Listed to look at: fixes without a test, bugs nobody reproduced, flaky reproductions, medium-risk untested changes, checks that gave both answers on the same sources. A person decides; the page says on what.

## 5. Are the tests any good?

| Question | Command |
|---|---|
| Would the tests notice a broken line? | `facet mutate --files src/price.js --test "npm test"` |
| Is every requirement covered by a test? | `facet trace --spec SPEC.md --tests tests` |
| Does the reviewer catch a planted defect? | `facet canary plant …`, review as usual, `facet canary reveal …` |
| Which checks are flaky? | `facet trustgraph`, `facet qa readiness` |

## The qa-flow agents

Installing `qa-flow` from the facetkit marketplace adds four agents and the `/qa-item` skill — a test strategist, an exploratory tester, a bug verifier and a release judge. See [domains/qa](../domains/qa/README.md).

## Limits

- The risk map knows imports, not runtime calls. A module reached only through a URL, a child process or a message queue shows as "no test reaches it" — note it in the plan.
- `verify` runs a command; it cannot click. For UI bugs use a Playwright script as `--repro`, or steps and a second person.
