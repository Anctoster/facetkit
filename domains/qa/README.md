# qa-flow

The facetkit method for testers. It answers the three questions of every test cycle from the record instead of from a feeling — **where to look**, **is this really a bug**, **may we ship** — and it feeds what testers find back into the trust in the team.

Polski: metoda facetkit dla testerów — mapa ryzyka zmian, sesje eksploracyjne z limitem czasu, zgłoszenia błędów z odtworzeniem potwierdzanym przez drugi przebieg lub drugą osobę, poprawki, które muszą zostawić test, i werdykt GO/NO-GO z każdym powodem.

## Install

```text
npm i -g facetkit
/plugin install qa-flow@facetkit
```

## A test cycle

```bash
facet qa plan --since v1.4.0                    # what changed, ranked by risk, with the tests each area needs
facet qa charter new C1 --mission "explore checkout with expired cards to discover silent failures" --areas src/pay.ts --minutes 60
facet qa bug new BUG-7 --title "total ignores quantity" --expect "total = price × quantity" \
      --repro "npm test -- -t total" --severity critical --item P07 --area src/price.ts
facet qa bug verify BUG-7                       # fails 3/3 → reproduced; after the fix: passes 3/3 → fixed; with a test that names BUG-7 → verified
facet qa charter close C1 --minutes 55 --bugs BUG-7
facet qa readiness --since v1.4.0 --html readiness.html   # GO or NO-GO, every reason listed
```

## What is different

| Usual practice | qa-flow |
|---|---|
| a test plan from experience | a risk map computed from the change: class of each file, modules depending on it, whether any test reaches it, how often it changed, where defects escaped before |
| "cannot reproduce" arguments | a bug carries its reproduction; a command is run several times (fails every time, never, or sometimes — flaky is a finding of its own); steps need a second person |
| a fix is closed when the developer says so | the same reproduction must pass, and a test that names the bug must exist |
| a found defect is a ticket | a defect in work an item had closed is that item's **escape**: it lowers the trust in the team (`facet trust`) and points at the rule that should have stopped it (`facet skill coverage`) |
| "looks good to me" before release | GO/NO-GO from open bugs by severity, items below the required level, untested high-risk changes no charter explored, flaky checks |

## Agents

| Agent | Model | Does |
|---|---|---|
| `test-strategist` | haiku | risk map → areas → charters, with the reason for every priority |
| `exploratory-tester` | sonnet | one session within its time box; only reproducible bugs |
| `bug-verifier` | haiku | reproduces new bugs, verifies fixes; never its own findings |
| `release-judge` | haiku | GO/NO-GO and the client's page; never decides |

## Limits

- The risk map knows imports, not runtime calls: a module reached only through a child process, a URL or a message queue shows as "no test reaches it". Say so in the plan instead of writing a test that already exists.
- `verify` runs a command; it cannot click. For UI bugs, a Playwright script as `--repro`, or steps confirmed by a second person.
- Severity is the reporter's judgement; the tool only makes it visible in the release decision.
