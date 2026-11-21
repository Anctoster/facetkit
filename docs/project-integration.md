# Project integration

[🇬🇧 English] | [🇵🇱 Polski](project-integration.pl.md) · Before: [Quick start](quick-start.md) · Next: [GitHub integration](github-integration.md)

FacetKit can be taken in four sizes. Each works on its own; nothing forces you to the next one.

| Size | What you add to the project | You get |
|---|---|---|
| **1. Tools only** | nothing | scan, mutation probe, seams, trace — run by hand or in CI ([quick start](quick-start.md)) |
| **2. One rule for your own agent** | nothing | a short, checkable rule your agent follows, instead of a long prompt |
| **3. The agents you choose** | `facet.json`, `facet.items.json`, `.facet/` | a journal of every step, an inspector's verdict, an assurance level per item |
| **4. The whole team** | the same | all nine agents, adaptive routes, cost and quality reports |

## 1. Tools only

See the [quick start](quick-start.md). Nothing is written into your project.

## 2. One rule for your own agent

Your agent (Claude Code, Cursor, anything that can run a shell command) keeps working as it does. You hand it one skill:

```text
Before you write tests, run `facet compose --take spec-trace,falsifiable-tests` and follow it.
```

`facet list` shows the skills; `facet compose --take a,b` prints the rules they are made of, short enough to be followed. No configuration and no journal are needed.

## 3. The agents you choose

Most teams do not want all nine agents. Pick the ones you need:

```bash
facet init --agents slice-builder,proof-inspector            # add --claude to copy just these agents into .claude/
```

`init` cuts the default flow down to the chosen agents and keeps its order. Common choices:

| You want | `--agents` | Steps of an item |
|---|---|---|
| Build, then an independent check | `slice-builder,proof-inspector` | build → proof → commit |
| Tests that fail before the code exists, then the build, then the mutation probe | `spec-falsifier,slice-builder,proof-inspector` (same as `--minimal`) | spec → build → probe → proof → commit |
| The above, with acceptance scenarios | `spec-falsifier,red-first-specifier,slice-builder,proof-inspector` | spec → red → build → probe → proof → green → commit |
| A design step before risky changes | add `blueprint-architect` | … design before spec … |
| Deployments and migrations | add `release-pilot` | … ops before proof … |
| Only an inspector over work done by people or another tool | `proof-inspector` | proof → commit |

What each agent does is in the [README](../README.md#the-team).

**Without `proof-inspector` nothing judges the work.** `init` then sets `govern.required` to 0 and items close at L0: the journal records what happened, but no level above L0 is claimed.

### Running an item

With Claude Code: restart it and type `/facet-item ITEM-1`. With anything else, the journal says what is next and you (or your agent) do it:

```bash
facet flow open ITEM-1
facet flow next                                  # CALL slice-builder · step build · model sonnet
facet flow start build && …the agent works… && facet flow end build --status DONE
facet flow next                                  # CALL proof-inspector · step proof
facet flow start proof && … && facet flow end proof --status DONE
facet flow verdict PASS
facet flow close                                 # refuses until the policy is met
```

### Fewer steps for one item

The flow of the project is the most an item can get. One item can take less:

- `"skip": ["probe"]` in its entry in `facet.items.json` drops that step for that item. The build, the verdict and the commit cannot be skipped.
- `facet route --changed` (or `facet route src/a.ts src/b.ts`, or `--task "text that names files"`) proposes a route from what the change touches — a documentation-only change skips more; `--apply --item ITEM-1` writes it into `facet.items.json`.
- `facet flow open ITEM-1 --route a,b` decides at opening time.

### Adding or removing an agent later

Edit `.facet/flow.json`: a step is `{ "id": …, "agent": …, "phase": … }`, and the step that ends with the verdict has `"verdict": true`. `init` never overwrites a file, so to start over, delete `.facet/flow.json` and run `facet init --agents …` again.

## 4. The whole team

```bash
facet init                # every agent; optional steps (design, spec, probe, ops) run for an item when its route names their agent
facet init --claude       # the same, with the agents and commands for Claude Code
```

Or install the Claude Code plugin — see [Getting started](../README.md#getting-started).

## What to configure

All of it is optional and lives in `facet.json` (or under `"facetkit"` in `package.json`):

| Key | What it does | Start with |
|---|---|---|
| `govern.checks` | your project's own checks, run by `facet check` and by the inspector | `{ "unit": { "run": "npm test", "covers": ["src/**", "test/**"] } }` |
| `govern.required` | the lowest level an item may close at (0–4) | `1` |
| `govern.env` | environment variables your checks need (they get no others) | `["NODE_OPTIONS"]` |
| `dirs` | where the code is, for seams and the atlas | written by `init` from what exists |

The full list is in the README; levels and rules are in [Governance](governance.md).

## What to commit

Commit `facet.json`, `facet.items.json` and `.facet/` — the journal in `.facet/journal` is the history of the work, and CI reads it. Add `.work/` to `.gitignore`: it holds logs and scratch files of each item.

## Next

Put the same checks on every pull request: [GitHub integration](github-integration.md).
