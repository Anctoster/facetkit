# Field report, November 2026 — one real project, twelve trials

[🇬🇧 English] | [🇵🇱 Polski](field-report-2026-11.pl.md) · See also: [HYPOTHESES.md](../HYPOTHESES.md) · [Trial kit](trial-kit.md) · [facetkit on facetkit](dogfood.md)

Two things happened in the last week of November 2026: facetkit 0.8.0 carried a real defect fix from report to release on a production website, and the first twelve trials of its rules were run against two models. This page records both, numbers first. No project or person is named.

## 1. One defect, the whole flow

**The project:** a sales website for a residential development (React 19, TypeScript, three.js; an aerial orbit of the estate and a 3D section of a building). **The defect:** while the visitor turned the aerial orbit, the picture blinked black for a few screen frames; without WebGL the 3D section left a blank page. One item, routed through map → spec → red → design → build → probe → gates → proof → green → commit → close, on facetkit 0.8.0 with Claude models (Haiku, Sonnet, Opus by step).

**Outcome:** fixed and released; policy gate ALLOW at level L2 with one recorded waiver. 4 rework cycles (the fourth over the default limit of 2, allowed by the owner), 205 tool runs (60 failed), about 5 hours of agent time. Final evidence: 16/16 acceptance scenarios twice in a row, the previous item's 13/13, mutation score 27/28 (96 %), every clause traced.

**What the flow caught that would otherwise have shipped:**

1. **A test that could not fail.** The probe step built a mutant that swapped the frame without waiting for `decode()` — the very bug being fixed. The guard scenario passed on it. Strengthened, the same scenario then found 10 undecoded frames out of 621 *in the real code*: a gap in the design, not only in the test.
2. **A regression of the fix.** Waiting for `decode()` left the stage empty for 161–254 ms at the very start of a turn on a slow connection. Running the failing scenario 3× on the new code and 3× on the previous commit (a separate worktree) showed it failed only on the new code.
3. **A swallowed error.** One of two code paths ignored a rejected `decode()`, which could leave a frame hidden forever. Found by the code-review gate; fixed by moving both paths into one helper with a test for its three outcomes.
4. **Flaky scenarios.** Two scenarios passed only on a second run. The rule "a pass on retry is a fail" forced a deterministic recording window instead of a lowered threshold.
5. **An honest history of red.** A renamed scenario that now checked something weaker was not allowed to inherit the old scenario's "seen failing" mark; it was shown red again.

**What it cost.** About a third of the questions the owner had to answer were formal, not about the product: the check that a build step did not change its own tests blamed the build for tests other steps had written (on all 8 build attempts); approvals expired whenever a step was restarted; a handoff check failed three times on formatting (a trailing colon, a mode in brackets, several paths on one line); token counts were lost when a report arrived after its step had ended; background runs of an earlier attempt finished after the step had been restarted; a journal over the secret-scan size limit blocked closing; the rework limit could be raised only by editing the configuration. Each of these is a tool fix, not a new rule; they are on the list for the next release.

## 2. Twelve trials: six rules, two models

Six facets of `spec-trace`, each with 3 runs without the rule and 3 with it, a fresh chat per run, the same task on both models. Models: **GPT-6** (as the model named itself; the web guest mode shows no model picker) and **Mistral Small 4** (web chat).

| Facet | GPT-6 | Mistral Small 4 |
|---|---|---|
| `spec-moves-first` | no difference — **ceiling**: the control already passed 3/3 | **confirmed** 0/3 → 2/3 |
| `numbered-clauses` | **confirmed** 0/3 → 3/3 | no difference 0 → 0 |
| `sourced-clauses` | **confirmed** 0/3 → 3/3 | no difference 0 → 0 |
| `verification-first` | **confirmed** 0/3 → 3/3 | no difference 0 → 0 |
| `claim-by-id` | **confirmed** 0/3 → 3/3 | no difference 0 → 0 |
| `example-replay` | **confirmed** 0/3 → 3/3 | no difference 0 → 0 |

Every result is in [`trials/results.json`](../trials/results.json) with its issue and transcripts; [HYPOTHESES.md](../HYPOTHESES.md) shows them per facet.

**What we learned:**

1. **A rule's value depends on the model, in both directions.** Five of six rules changed the stronger model's behaviour completely; one of six helped the weaker one. The one that helped the weaker model is exactly the one the stronger model did not need.
2. **Compliance theatre.** With a rule, the weaker model often produced the rule's *markers* without its *behaviour*: invented source quotes to justify tests nobody asked for, copied `(verify: test)` and "false if" into test code, and filled a replay table with command output it never ran ("Listening on port 8080") before closing a broken ticket. A marker in an agent's text is not evidence. Evidence is a receipt from a tool — which is why facetkit records evidence from tools, not from reports.
3. **Side effects count.** With some rules the stronger model stopped to ask the owner where a plain fix was available — once it wrote no tests at all. The pass criterion did not see it; the report did.
4. **Method.** Judge by the scenario's criterion in plain words, never by the rule's own markers (a control run cannot know them). Run the control first; at 3/3, raise the trap instead of running the rule. Name the model as the tool shows it. 25 of the 42 scenarios fit a web chat; 17 need an agent with a terminal; 13 facets have no scenario yet.

**What it means for facetkit:**

- Verdicts are kept per model. A rule is retired only when a weaker model shows no difference too.
- Rules that ask for a written marker should graduate into tools that check the behaviour (`skill-sense:graduate-to-tool`): a clause's source checked against the request text, a replay accepted only with a run receipt.
- The next trials that matter most are on the models facetkit's agents actually run on — Claude Haiku and Sonnet — and the 17 terminal scenarios.

## 3. Update, 26 November: Claude Haiku 5.5 and Gemma 4 31B

The same six tasks, 3 + 3 runs each, on two more models — 24 results in all.

| Facet | GPT-6 | Claude Haiku 5.5 | Gemma 4 31B | Mistral Small 4 |
|---|---|---|---|---|
| `spec-moves-first` | ceiling (3/3 → 3/3) | ceiling (3/3 → 3/3) | **confirmed** 0 → 3 | **confirmed** 0 → 2 |
| `numbered-clauses` | **confirmed** | **confirmed** 0 → 3 | **confirmed** 0 → 2 | no difference |
| `sourced-clauses` | **confirmed** | **confirmed** 0 → 3 | **confirmed** 0 → 3 | no difference (theatre) |
| `verification-first` | **confirmed** | **confirmed** 0 → 3 | no difference 0 → 0 | no difference (theatre) |
| `claim-by-id` | **confirmed** | **confirmed** 0 → 3 | no difference (partial) | no difference (partial) |
| `example-replay` | **confirmed** | ceiling (3/3 → 3/3) | **confirmed** 0 → 3 | no difference (theatre) |

**What the four models add:**

1. **`numbered-clauses` and `sourced-clauses` hold on three of four models**, including Haiku — the model facetkit's cheaper steps run on. They are the most robust rules so far.
2. **`spec-moves-first` helps only weaker models** (Gemma, Mistral); the stronger two already behave. Keep it — it costs a few lines — but a stronger model is not evidence for it.
3. **The same partial failure twice:** on Gemma and Mistral `claim-by-id` was half-followed — `[R#]` prefixes adopted in every run, tests without a clause kept in every run. The positive half of the rule is taken, the "delete or propose" half is not. The orphan check belongs to a tool (`facet trace` reports orphan claims) rather than to prose.
4. **`verification-first` fails under prompt pressure** on the two weaker models ("write the test file right away" wins over the rule). It needs a gate (`facet trace --plan` before the first test), not a sentence.
5. **Ceilings on Haiku** (`spec-moves-first`, `example-replay`): the trap is too easy for current Claude models; raise it before the next run.

**Next:** Claude Sonnet on the same six tasks; the terminal scenarios (a chat cannot run `facet trace`, so the tool-backed half of these rules is still untested); a harder trap for the two Haiku ceilings; first trials of the rules facetkit routes most often — `claim-ledger`, `anchored-handoff`, `doc-receipts`.

## Join

A trial takes about 40 minutes and a chat window. Start with the [worked example](running-a-trial.md) and the [trial kit](trial-kit.md), claim a facet on the pinned Trial board issue, and report with the *Trial result* template. "No difference" and "refuted" are as welcome as "confirmed".
