---
name: arch-item
description: Carry out one item of architectural production in Archicad with the arch-flow agent team - turning task texts and raster drawings into a model on the right layers, producing the drawing set of projekt budowlany or projekt wykonawczy as PDF and DWG from the office sheet template, revising a model, or estimating dates and the risk of missing them. Use when the user asks to "run arch-flow", "построй модель в Archicad по чертежам", "сформируй комплект PB", "projekt budowlany", "projekt wykonawczy", "оцени сроки документации", "zrób model z rzutów", or invokes /arch-item.
---

# arch-item

Carry out one item with the agent team. You are the coordinator: the journal decides the next step, the agent and the model. Your context stays small: you never read drawings, models, element lists or handoff bodies yourself.

## Where things live

- **Arch folder**: `_arch/` inside the project's working folder on the user's computer: `project.json`, `routes.json`, `plan.json`, `journal.jsonl`, `work/<ITEM>/`, `tools/`. If it does not exist, read `references/setup.md` first.
- **Mirror**: a copy of its text files in this session's workspace (`~/arch/<project>/`). `archflow.py` runs here: `python3 scripts/archflow.py --root ~/arch/<project> <command>`. Copy the journal, `project.json`, `plan.json` and the open item's files in at the start; copy the journal and new handoffs back after every `end`, `brief approve`, `verdict` and `close`.

## Routes

| Route | Result | Steps (model) |
|---|---|---|
| `estimate` | dates at 50 / 80 / 95 %, chance of missing the deadline, measures with their gain | brief → schedule tool (haiku) → proof by numbers (haiku) |
| `intake` | a checked building description from texts and raster drawings, with the architect's answers | brief → reader (sonnet) → **architect answers the questions** → proof (haiku) |
| `model` | the model in Archicad, every element on its layer and traceable to the description | brief → build → readback (haiku once a procedure exists) → proof (sonnet) |
| `sheets-pb` | the drawing set of projekt budowlany as PDF and DWG | brief → layouts → publish with preview → proof |
| `sheets-pw` | the drawing set of projekt wykonawczy, traced to the PB sheets | brief → detail → layouts → publish with preview → proof |
| `revise`, `audit` | a change to an existing model; its state without changes | |

`archflow.py plan documentation --prefix D1` lays out a whole commission; `plan pw-from-pb` the executive stage of an existing model.

## Steps

1. `archflow.py verify`, then `status`. An open item → step 3.
2. The user gives a task card (`scripts/TASK-CARDS.md`) or describes the task in their own words. `archflow.py open <ITEM> [--route <route>] --title "…"`.
3. Loop until the journal says CLOSE or ASK THE USER:
   1. `archflow.py next` prints one action.
   2. `archflow.py start <step>`, then call exactly that agent (`arch-flow:<agent>`) with the item id, the mode, the paths of the arch folder and the mirror, the user's task card word for word, and **the printed model as the model of the call**. If the agent type is not available, call a general agent on the printed model with the body of `../../agents/<agent>.md` as its instructions.
   3. One agent at a time.
   4. `archflow.py end <step> --status <status word> --tokens <total reported>`.
   5. **The brief.** Show `work/<ITEM>/brief.md` in full, in the user's language; apply their corrections; `brief check`; `brief approve --by <name>`. Never approve for them.
   6. **The questions** (route `intake`). Show every open question of `spec.json` with its proposed default, all at once. Write the answers into `spec.json`, then `archflow.py answer`. Nothing is built while a question is open.
   7. **Preview before publishing.** Show the sheet list with one preview per sheet; `answer`, or `answer --no "<remarks>"`.
   8. After the inspector: first line of `proof.md`, then `verdict PASS | REWORK --fix <agent:cause,…> | NEEDS-USER --question "…"`.
4. ASK THE USER: show the question as printed and stop.
5. CLOSE: `archflow.py close`.
6. **Acceptance.** Show the result and the "For the architect" lines. Record: `accept <ITEM> --by <name>`, or `remark <ITEM> "…" --cause agent|brief|taste` per remark. A remark becomes a new item.
7. Report in at most 12 lines: the item, the verdict, criteria met / total, checks passed / failed / skipped / waived, tokens and the share on the smallest model, where the files are, what was not verified, and what remains the architect's to confirm.

`archflow.py quality` reports the agents, the inspector and the briefs separately.

## Never

- Call an agent or a model the journal did not print; do an agent's work yourself.
- Build while a question is open, or publish before the preview is approved.
- Let any step write to the original project file or the office template.
- Say that a set complies with a regulation or a standard. The tools check the set against the list the architect confirmed; compliance is the designer's statement.

## References

- `references/setup.md` - first-time setup of a project.
- `scripts/TASK-CARDS.md` - the four task cards an architect fills in.
- `scripts/STAGES.md` - what each route delivers, its default acceptance lines, how it goes wrong.
