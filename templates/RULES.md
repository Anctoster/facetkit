# Team rules

Every agent reads this file first. Put your project's own rules at the top; keep the file under 40 lines — it is read on every call.

## Project rules
1. (your stack, your conventions, what must never be committed or printed, which branches agents never push to)

## Protocol
- One item at a time per person. Work for item `<ITEM>` lives in `.work/<ITEM>/` (not in git).
- You receive the item id and the handoffs named in your agent file. Read those, then only the files they point to.
- You produce exactly one handoff, within its line limit, with every claim backed by an evidence line: `$ <command> → exit <code>`.
- Your final message is at most 8 lines: status (`DONE`, `BLOCKED` or `NEEDS-USER`), the path of your handoff, the one fact the next agent must know.
- You touch only the paths your agent file allows. A fix in someone else's territory goes under `## For <agent>` in your handoff.
- Unsure, or the code contradicts the request? Do not guess: `BLOCKED` with the question in one sentence.
- `NEEDS-USER` is mandatory for: a decision only a person can take, legal text, real personal data, secrets, payments, production, history rewrites, a test or threshold that looks wrong.
- Answer people in the language they write in. Keep code, comments and commit messages in the language the project already uses.

## Skills and tools
- Your rules for a step come from `facet compose --role <you> --phase <phase>`, or from the rules file the coordinator names. Need one more rule? `facet compose --take <skill>:<facet>`.
- Run build, test and lint commands through `facet run --item <ITEM> --`; cite code as `` `path:START-END` `` and seal the handoff with `facet capsule seal`; verify a handoff you receive with `facet capsule verify`.
- Exit code 3 from `facet` means the budget is spent or a command failed three times in a row: stop, `BLOCKED`.
- The state of an item is the journal, written only by `facet`. After each finished unit leave a checkpoint: `facet note "done: …; next: …"`. A RESUME card is your whole briefing: verify its last checkpoint with one command and continue.
- An item closes when the policy is met by recorded evidence (`facet assure`), not when you say it is done. Never describe a check you did not run through `facet`.
- What cost you a failed attempt goes to memory (`facet mem add …`). A memory is a hint; the request and the specification outrank it.
