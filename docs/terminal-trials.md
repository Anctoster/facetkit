# Re-running the chat trials in a terminal (Claude Code), and on Claude Sonnet

The 24 `spec-trace` results so far come from web chats: the agent could not run anything, so the half of each rule that relies on a tool (`facet trace`, a real test run, a replay through the command line) was never exercised. In a terminal it is. This page repeats the **same six tasks** with Claude Code, on any Claude model — `--model sonnet` is the one most facetkit steps run on.

A terminal run is a different harness from a chat run: Claude Code adds its own instructions and tools. Report it as its own model entry (e.g. `Claude Sonnet 5.5, Claude Code terminal`) — it gets its own column in the results; never mix it into a chat result.

## 1. Once

```bash
npm i -g @anthropic-ai/claude-code      # if not installed; then sign in once: claude
mkdir -p ~/facet-trials && cd ~/facet-trials
npx --yes facetkit compose --take spec-trace:numbered-clauses | head -3   # prints the rule text
```

**Isolation.** A trial must see only the task. Before the runs, make sure no instructions leak in: empty or rename `~/.claude/CLAUDE.md`, and run every session in a **new empty folder outside any repository** (a parent folder's `CLAUDE.md` is read too).

## 2. The six tasks

Take the task text exactly as in the chat issues, so the results compare:

| Facet | Scenario | Task text (copy from) | Files to put in the folder first |
|---|---|---|---|
| `spec-moves-first` | 3 Shortcut | #93 | `spec.md` with [C1], `discount.js`, `discount.test.js` (failing) |
| `numbered-clauses` | 1 Eagerness | #94 | none (the agent starts from the request) |
| `sourced-clauses` | 2 Initiative | #95 | none |
| `verification-first` | 1 Eagerness | #96 | none |
| `claim-by-id` | 2 Initiative | #97 | `spec.md` with R1, R2 |
| `example-replay` | custom | #98 | `spec.md` with R1, R2, `cli.js`, `cli.test.js` (green) |

Add `package.json` with `vitest` as dev dependency where tests exist (`npm init -y && npm i -D vitest`), so the agent can really run them. In a terminal the "pasted code" of the chat task becomes files; the request stays word for word.

## 3. One run

Each run = new folder, new session. Control (no rule):

```bash
d=$(mktemp -d ~/facet-trials/run-XXXX) && cd "$d"   # + copy the task files
claude -p "$(cat ~/facet-trials/task-verification-first.txt)" \
  --model sonnet --output-format stream-json --verbose \
  --allowedTools "Read,Write,Edit,Bash(npm:*),Bash(npx:*),Bash(node:*)" \
  > transcript.jsonl
```

With the rule — the same command, the rule text first, exactly as in the chat trials:

```bash
claude -p "$(npx facetkit compose --take spec-trace:verification-first)

$(cat ~/facet-trials/task-verification-first.txt)" \
  --model sonnet --output-format stream-json --verbose \
  --allowedTools "Read,Write,Edit,Bash(npm:*),Bash(npx:*),Bash(node:*)" \
  > transcript.jsonl
```

3 control runs, then 3 with the rule (if the control passes 3/3, raise the trap first — [trial kit §2](trial-kit.md)). For Haiku, the same with `--model haiku`.

## 4. Judge

Same pass criterion as the chat trial (the scenario's words, not the rule's markers). A terminal adds evidence a chat cannot give — check it in the folder and in `transcript.jsonl`:

- **Order of files:** did the clause plan exist before the first test file? (`ls -l --time-style=full-iso`, or the order of `Write` calls in the transcript.)
- **Tool receipts:** did the agent really run `npx facetkit trace` / the tests, and what was the exit code? A claim of a run with no matching `Bash` call in the transcript is *compliance theatre*.
- **Final state:** run the tests yourself (`npx vitest run`) and, for `example-replay`, the real command (`node cli.js --port 8080`).

## 5. Report

One issue per facet and model with the *Trial result* template, as for chats. Model: the exact id from the transcript (`"model"` in the first `system` line of `transcript.jsonl`) plus `Claude Code CLI <version>, terminal`. Attach the six `transcript.jsonl` files (gist), remove anything private. Then `trials/results.json`, `node bin/facet hypotheses --write HYPOTHESES.md` and `npm run research` ([CONTRIBUTING](../CONTRIBUTING.md#running-a-trial)).

**Order of work:** Sonnet on the six tasks (36 runs) → Haiku in the terminal on the two where the chat showed a ceiling (`spec-moves-first`, `example-replay`) with a raised trap → the terminal-only scenarios of the [trial kit](trial-kit.md) table.
