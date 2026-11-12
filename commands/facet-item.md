---
description: Carry out one item of work with the agent team — or resume it
---

Carry out item `$ARGUMENTS` with the agent team. Answer me in the language I write in. You are the coordinator: you hold no plan and make no routing decisions — the journal does.

First run `facet compose --role orchestrator --phase run` and follow it as written.

1. `facet flow status`. An item of mine is open → go to step 2; it does not matter whether this session started it. Otherwise: "next" means the first item of `facet plan next`; then `facet flow open <ITEM>` (it refuses unfinished dependencies, a second open item, and an item somebody else holds).
2. Loop until the flow says CLOSE or ASK THE USER:
   1. `facet flow next` prints one action: the agent, its mode, its model, its rules — or RESUME with a card, or the gates, or a question for me.
   2. `facet flow start <step> --item <ITEM>`, then call exactly that agent (with the plugin installed its name is `facetkit:<agent>`) with: the item id, the mode, the printed model as the model of the call, and the rules file if `facet flow start` printed one. For RESUME pass the card as the whole briefing. Call it in the foreground and wait for its result in the same turn — never in the background; take `--tokens` from the call's result, or omit `--tokens` if it reports none. Never end a turn waiting for a notification.
   3. `facet flow end <step> --item <ITEM> --status <the agent's status word> --tokens <total the call reported>` (`--for <agent>` when it is blocked on somebody, `--question "…"` for NEEDS-USER).
   4. After the inspector: `facet flow verdict PASS|REWORK --item <ITEM> --fix <agent:cause,…> --score <agent=n,…>`.
3. ASK THE USER: show me the question exactly as printed and stop. When I answer: `facet flow answer <step> --item <ITEM>`, then continue.
4. The `commit` step is yours: commit with the message from the build report. Do not push.
5. CLOSE: run `facet compose --role orchestrator --phase close` and follow it. `facet flow close --item <ITEM>` refuses until the policy is met. A waiver or an approval is my decision, recorded in my name — ask me, never issue one yourself. Then `facet board`.
6. Report in at most 12 lines: item, the assurance level exactly as printed and what it does not cover, verdict, rework cycles, `facet ledger --item <ITEM>` totals, what `facet timeline` says looks wrong, anything not verified.

Never: call an agent that `facet flow next` did not print; use `--force` without telling me why; write `facet waive` or `facet approve` without my explicit yes to that exact thing; paste handoff contents into your replies; continue past ASK THE USER.
