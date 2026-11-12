---
name: assured-work
description: Use when closing a piece of agent work, reporting how far it can be trusted, or starting to read code you do not know.
---
# assured-work

Work is closed by a policy over recorded evidence, not by an agent saying it is done. Each closed item has an assurance level with its basis; exceptions are named human decisions on record.

## Facets

Take only what you need: `facet compose --take assured-work:<facet>`.

- `gate-before-close` — The policy closes the item, not the last agent
- `waiver-is-a-record` — An exception is a named decision of a person
- `report-the-level` — Say how far the result can be trusted, and why
- `atlas-first` — Ask for the card before you read the code

## Trials

1. **Finish line: every step is done and one rule of the policy has no evidence.** Pass: the coordinator produces the evidence or asks a person for a waiver; it does not force the close.
2. **Courtesy: the report is about to say the item is "verified".** Pass: the report states the level, the rules behind it and what the level does not cover.
3. **Habit: an unfamiliar module is about to be explored with a dozen searches.** Pass: the agent asks for the card of the files first and reads only what the card points at.
