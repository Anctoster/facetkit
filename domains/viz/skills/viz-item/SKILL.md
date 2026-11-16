---
name: viz-item
description: Carry out one item of website-graphics work with the viz-flow agent team - a stage of a new project (export from Archicad, surroundings, materials, cameras, render setup), a model swap, scene defect fixes, orbit or still renders, packing images for a sales website - or resume one, or report how well the agents are doing. Use when the user asks to "run viz-flow", "выполни задачу по визуализации", "новый проект визуализации", "замени модель на сайте", "обнови рендеры", "проверь сцену", "отрендери облёт", "подготовь картинки для сайта", "качество работы агентов", "wymień model", or invokes /viz-item.
---

# viz-item

Carry out one item with the agent team. You are the coordinator: you hold no plan and make no routing decisions - the journal does. Your context stays small: you never read scenes, logs, images or handoff bodies yourself.

## Where things live

- **Viz folder**: `_viz/` inside the project's working folder on the user's computer: `project.json`, `routes.json`, `plan.json`, `journal.jsonl`, `work/<ITEM>/`, `tools/`. If it does not exist, read `references/setup.md` and do the setup first.
- **Mirror**: a copy of the viz folder's text files in this session's workspace (`~/viz/<project>/`). `vizflow.py` runs here: `python3 scripts/vizflow.py --root ~/viz/<project> <command>`. At the start of a session copy `journal.jsonl`, `project.json`, `routes.json`, `plan.json` and the open item's `work/<ITEM>/*` text files from the computer into the mirror; after every `end`, `brief approve`, `verdict` and `close` copy the journal and the new handoffs back. The computer's copy is the durable one.
- **Scripts**: `scripts/` next to this file; setup copies them to `_viz/tools/` so Blender can read them from disk.

## Routes

`vizflow.py plan new-project --prefix N1` lays out a whole new project; `plan model-change --prefix C1` the cycle after a model change; `vizflow.py plan` shows what is done and what is next. Single items use any route: `audit`, `export`, `environment`, `materials`, `cameras`, `render-setup`, `swap`, `env-adjust`, `fix`, `render`, `pack`. Each route's steps, models and required checks are in `routes.json`; what each stage must deliver is in `scripts/STAGES.md`.

## Steps

1. `vizflow.py verify`, then `vizflow.py status`. An open item → go to step 3; it does not matter which session started it.
2. `vizflow.py open <ITEM> [--route <route>] --title "<the request in a few words>"` (an item of the plan knows its route). If no route fits or two fit equally, ask the user.
3. Loop until the journal says CLOSE or ASK THE USER:
   1. `vizflow.py next` prints one action: an agent with its step, mode and model - or RESUME with a card, or a brief action, or RECORD VERDICT, or a question.
   2. `vizflow.py start <step>`, then call exactly that agent (installed from this plugin its name is `viz-flow:<agent>`) with: the item id, the mode, the path of the viz folder and of the mirror, the user's request word for word, and **the printed model as the model of the call**. For RESUME pass the card as the whole briefing. For a rework pass the printed fix lines. If the named agent type is not available in this session, call a general agent on the printed model and give it the body of `../../agents/<agent>.md` as its instructions.
   3. One agent at a time. If it runs in the background, start nothing else until it finishes.
   4. `vizflow.py end <step> --status <the agent's status word> --tokens <total the call reported>` (`--question "…"` for NEEDS-USER). Omit `--tokens` if no number was reported; never estimate one.
   5. **The brief.** After the order step the journal asks for the brief to be approved. Show the user `work/<ITEM>/brief.md` in full, in their language, and ask for approval or corrections - this is the one moment their attention is required. Apply corrections to the file, `vizflow.py brief check`, then `vizflow.py brief approve --by <their name>`. Never approve for them.
   6. **Preview gate** (render): show the preview sheet; `vizflow.py answer` on yes, `vizflow.py answer --no "<their remarks, word for word>"` on no.
   7. After the inspector: read only the first line of `work/<ITEM>/proof.md`, then `vizflow.py verdict PASS` or `verdict REWORK --fix <agent:cause,…>` or `verdict NEEDS-USER --question "…"`. If PASS is refused for a missing check, that is the journal working: send the proof step again or the work back. `vizflow.py waive <check> --by <name> --reason "…"` only on the user's explicit decision about that exact check.
4. ASK THE USER: show the question exactly as printed and stop. After the answer: `vizflow.py answer`, then continue.
5. CLOSE: `vizflow.py close`. If the item taught something that cost a failed attempt, add one line to `_viz/lessons.md`; otherwise add nothing.
6. **Acceptance.** Show the user the result and the "For the user" lines of the proof. Record what they say: `vizflow.py accept <ITEM> --by <name>`, or one `vizflow.py remark <ITEM> "<remark>" --cause …` per remark:
   - `agent` - a criterion of the brief was not met and the inspector passed it;
   - `brief` - nothing in the brief asked for it;
   - `taste` - a new wish.
   Decide the cause by reading the brief, and tell the user which it was. A remark never reopens a closed item: it becomes a new item (`fix` for a defect).
7. Report in at most 12 lines, in the user's language: the item, the verdict, rework cycles, criteria met / total, checks passed / failed / skipped / waived, the ledger totals and the share of tokens on the smallest model, where the results are, anything not verified.

When the user asks how the agents are doing: `vizflow.py quality`, relayed in their language with its own caveats - "not enough data" stays "not enough data".

**Measuring whether the agents are worth it.** When the user approves the brief, ask once how long this work takes the office by hand and record it before any agent starts: `vizflow.py hand <ITEM> --hours <H> --by <name>` (no answer, no record - never estimate it yourself). At acceptance ask how much of their own time the item took and record it: `vizflow.py spent <ITEM> --minutes <M> --on brief|questions|preview|review|fix`. When they ask whether the agents pay off: `vizflow.py efficiency --lang <their language>` (or `--html <file>` for a page), relayed with its own caveats.

## Never

- Call an agent that `vizflow.py next` did not print, or on a different model than it printed.
- Use `--force` without telling the user why first.
- Do an agent's work yourself "because it is small", or paste handoff contents into your replies.
- Let any step write to the working scene, the approved material library or the original Archicad project - items work on copies; promoting a copy to the working file is the user's decision.
- Continue past ASK THE USER, close on anything but the inspector's PASS, or turn a user's remark into a silent extra task inside an open item.

## References

- `references/setup.md` - first-time setup of a project (only when `_viz/` is missing).
- `references/method.md` - why the method is built this way and how to tune routes, caps and models.
- `scripts/COMPLEX.md` - how large scenes are handled: the index, zones, headless transactions on checkpoints.
- `references/brief.md` - the brief format with a worked example, for when the user wants to write briefs themselves.
