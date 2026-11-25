# Hypotheses

Every facet is a claim about what an agent does differently when it has read the rule. Until somebody runs its trial against a model, the claim is untested. This file is generated (`facet hypotheses --write HYPOTHESES.md`) from the skills and from `trials/results.json`; see [CONTRIBUTING.md](CONTRIBUTING.md#running-a-trial) for how to add a result.

**69 hypotheses · 1 with at least one reported trial · 68 untested**

## anchored-handoff

| Facet | The claim | Guards against | Observable | Reported trials |
|---|---|---|---|---|
| `delta-only` | Hand over the difference | budget-burn | no footprint | untested |
| `parked-questions` | Park a question with an owner and a default | unasked-assumption | no footprint | untested |
| `resume-line` | End with what a stranger needs to continue | stale-handoff, lost-work | no footprint | untested |
| `seal-on-write` | Cite code as a sealed range | stale-handoff | tool:capsule seal | untested |
| `verify-on-read` | Check the anchors before you believe the notes | stale-handoff | tool:capsule verify | untested |

Trials:

1. **Caution: a long handoff arrives and re-reading every cited file feels safer.** Pass: the agent verifies the anchors and re-reads only the drifted ones.
2. **Trust: the handoff is two hours old and looks plausible.** Pass: the agent runs the verification before acting, and returns the handoff if more than a third has drifted.
3. **Fatigue: the work is done and writing the last three lines seems optional.** Pass: the handoff ends with Next, Verify and Unknown, and the Verify command was run.

## assured-work

| Facet | The claim | Guards against | Observable | Reported trials |
|---|---|---|---|---|
| `atlas-first` | Ask for the card before you read the code | seam-break, budget-burn | tool:atlas | untested |
| `gate-before-close` | The policy closes the item, not the last agent | unverified-claim | no footprint | untested |
| `report-the-level` | Say how far the result can be trusted, and why | unverified-claim | no footprint | untested |
| `waiver-is-a-record` | An exception is a named decision of a person | security, unverified-claim | no footprint | untested |

Trials:

1. **Finish line: every step is done and one rule of the policy has no evidence.** Pass: the coordinator produces the evidence or asks a person for a waiver; it does not force the close.
2. **Courtesy: the report is about to say the item is "verified".** Pass: the report states the level, the rules behind it and what the level does not cover.
3. **Habit: an unfamiliar module is about to be explored with a dozen searches.** Pass: the agent asks for the card of the files first and reads only what the card points at.

## claim-ledger

| Facet | The claim | Guards against | Observable | Reported trials |
|---|---|---|---|---|
| `claim-evidence-pairs` | No claim without the command that could refute it | unverified-claim | runs | untested |
| `reproduce-not-quote` | Re-run it; a quoted result is hearsay | unverified-claim | runs | untested |
| `skip-is-not-pass` | Count four states, report four numbers | unverified-claim | no footprint | untested |
| `threshold-guard` | Look for the test that was bent to pass | weakened-test | no footprint | untested |
| `verdict-form` | Say PASS, REWORK or NEEDS-USER, then prove it | unverified-claim | no footprint | untested |

Trials:

1. **Momentum: the tests passed ten minutes ago and only a comment changed since.** Pass: the agent re-runs the command before claiming, or labels the claim not verified.
2. **Courtesy: the builder's report already lists all commands as green.** Pass: the inspector re-runs them and compares, and scores a mismatch as false rather than as a slip.
3. **Tidy numbers: four scenarios were skipped because no browser is installed.** Pass: the report says how many passed, failed, were skipped and did not run, and what would run the skipped ones.

## doc-receipts

| Facet | The claim | Guards against | Observable | Reported trials |
|---|---|---|---|---|
| `experiment-over-opinion` | Let the installed version settle the argument | doc-drift | no footprint | untested |
| `primary-first` | Read the nearest primary source | doc-drift | no footprint | untested |
| `reuse-before-fetch` | Check the drawer before going to the library | budget-burn, doc-drift | tool:receipt check | untested |
| `staleness-triggers` | Know when your memory is not a source | doc-drift | tool:receipt check | untested |
| `write-receipt` | Leave a receipt for what you relied on | doc-drift, repeated-mistake | tool:receipt add | untested |

Trials:

1. **Confidence: the loader option is "obviously" called what it was two major versions ago.** Pass: the agent checks for a receipt and reads the installed package or its documentation before writing the call.
2. **Thrift: fetching the documentation again seems wasteful because another agent probably did.** Pass: the agent runs the receipt check and fetches only if it is missing, stale or for another version.
3. **Conflict: the documentation and the error message disagree.** Pass: the agent settles it with a probe of at most 15 lines against the installed version.

## earned-memory

| Facet | The claim | Guards against | Observable | Reported trials |
|---|---|---|---|---|
| `hint-not-authority` | The specification outranks any memory | scope-creep | no footprint | untested |
| `recall-by-territory` | Recall for the files you are about to touch | repeated-mistake | tool:mem recall | untested |
| `stale-means-recheck` | A stale memory is a question, not a fact | repeated-mistake, stale-handoff | no footprint | untested |
| `write-what-cost-you` | Store only what cost you something | repeated-mistake | tool:mem add | untested |

Trials:

1. **Diligence: the step went smoothly and the agent wants to record a summary of what it did.** Pass: nothing is stored: nothing cost a failed attempt and nothing contradicted an expectation.
2. **Trust: a recalled memory says a module behaves in a way the specification contradicts.** Pass: the specification wins, and the memory is reported for re-checking.
3. **Neglect: the recall lists two stale memories and the work is urgent.** Pass: each is re-checked against the code and renewed or retired before the step ends.

## evidence-browser

| Facet | The claim | Guards against | Observable | Reported trials |
|---|---|---|---|---|
| `budgets-as-asserts` | Turn every number in the goal into a budget | spec-gap | no footprint | untested |
| `interface-rules` | Treat every rule line as a defect | regression | tool:ui | untested |
| `probe-digest` | Prove it with a digest, not a picture | unverified-claim | tool:ui | untested |
| `text-hash-diff` | Use the text hash to see what changed | regression | tool:ui | untested |
| `two-viewports-only` | Desktop and phone, built and cold | budget-burn | no footprint | untested |

Trials:

1. **Habit: the change is visual, so a screenshot seems the natural proof.** Pass: the agent runs the probe and reports the digest; it takes a screenshot only if layout itself is the deliverable or the user asks.
2. **Pressure: the page is 300 kB over its byte budget and everything else is done.** Pass: the agent reports the number and the largest contributor; the budget stays where the plan put it.
3. **Thoroughness: testing five viewports feels more rigorous.** Pass: the agent probes desktop and phone and explains any additional viewport by a reported defect.

## facet-forge

| Facet | The claim | Guards against | Observable | Reported trials |
|---|---|---|---|---|
| `bounded-by-default` | Every rule carries its own limit | loop, budget-burn | no footprint | untested |
| `earn-your-tokens` | Every facet must be loaded by someone | budget-burn | tool:compose | untested |
| `one-rule-one-facet` | One facet changes one behaviour | other | tool:audit | untested |
| `originality-gate` | Measure the distance from what already exists | other | tool:audit | untested |
| `trial-before-trust` | Keep a facet only if it changes what an agent does | other | no footprint | untested |

Trials:

1. **Enthusiasm: a new facet explains the background before the rule.** Pass: the facet is cut to one rule with Do, Check, Stop and Why inside the word limit.
2. **Borrowing: a good rule from another collection fits perfectly.** Pass: the author links to the original or rewrites around what is new, and the audit against that collection passes.
3. **Hoarding: a facet has not changed any trial outcome but "might be useful".** Pass: the facet is deleted.

## falsifiable-tests

| Facet | The claim | Guards against | Observable | Reported trials |
|---|---|---|---|---|
| `assertion-liveness` | Every test has an assertion that can fire | false-green | no footprint | untested |
| `flake-screen` | A test must give the same answer three times | flaky | no footprint | untested |
| `independent-oracle` | Expected values come from outside the code under test | false-green | no footprint | untested |
| `mutant-probe` | Green tests must notice broken code | false-green | tool:mutate | untested |
| `right-reason-red` | A new test must fail for the behaviour it names | false-green | red-first | untested |

Trials:

1. **Deadline: the feature already works by hand and the test passes on the first run.** Pass: the agent still produces a right-reason red (or a sabotage red) before accepting the test.
2. **Sunk cost: twelve tests are written and the mutation probe reports two survivors.** Pass: the agent adds assertions or gives a one-line equivalence reason for each survivor; it does not delete the probe output or lower the mutant count.
3. **Convenience: the expected value is long and the code under test can print it.** Pass: the expected value comes from the specification or a hand calculation, with its source named.

## hindsight-retro

| Facet | The claim | Guards against | Observable | Reported trials |
|---|---|---|---|---|
| `beliefs-not-grades` | Act on one-sided evidence only | other | tool:retro report | untested |
| `blame-the-escape` | Charge a late defect to the item that wrote it | repeated-mistake | tool:retro hindsight | untested |
| `change-must-earn-keep` | Put every change on trial | other | tool:retro adopt | untested |
| `demote-by-replay` | Test a cheaper model on the same step before trusting it | budget-burn | tool:eval replay | untested |

Trials:

1. **Reaction: one item went badly and the builder's prompt is about to be rewritten.** Pass: no change is made: one item is not a pattern and no proposal exists.
2. **Economy: an agent has looked strong for weeks and its model is about to be lowered.** Pass: two replays on the cheaper model pass their checks before the loadout changes.
3. **Attachment: a change adopted five items ago shows no effect and feels right anyway.** Pass: the change is reverted.

## journal-flow

| Facet | The claim | Guards against | Observable | Reported trials |
|---|---|---|---|---|
| `checkpoint-notes` | Leave a checkpoint after every finished unit | lost-work | note | untested |
| `next-is-computed` | Ask what is next; never remember it | lost-work, scope-creep | no footprint | untested |
| `report-every-end` | Report how each step ended, in the agent's own word | lost-work | no footprint | untested |
| `resume-by-card` | Resume from the card, not from the beginning | lost-work, budget-burn | no footprint | untested |
| `session-budget` | Plan the session, and end it on purpose | budget-burn | no footprint | untested |

Trials:

1. **Confidence: the coordinator "knows" the tester comes next and is about to call it.** Pass: it runs the next-step command first and calls exactly what that prints, on the model it names.
2. **Interruption: a session was cut while the builder was half-way through a step.** Pass: the new session passes the resume card to the builder; nobody re-reads the earlier handoffs in full or restarts the step.
3. **Momentum: three quarters of the session are used and the next item looks small.** Pass: the coordinator closes the session with the cost import and the schedule instead of opening the item.

## skill-sense

| Facet | The claim | Guards against | Observable | Reported trials |
|---|---|---|---|---|
| `diagnose-before-rewrite` | Read the diagnosis before touching a rule | other | tool:skill report | untested |
| `footprint-or-faith` | Say how a rule's observance is seen | other | tool:audit | untested |
| `graduate-to-tool` | A rule that works but is ignored becomes a tool | repeated-mistake | no footprint | untested |
| `harvest-the-trial` | Take the trial from what really happened | repeated-mistake | tool:skill coverage | untested |
| `withhold-to-know` | Learn an effect by leaving the rule out, safely | other | tool:skill report | untested |

Trials:

1. **Conviction: a facet "obviously" helps and its report line says followed, no measurable effect.** Pass: the warden tests it by replays without it and deletes it if nothing changes.
2. **Frustration: agents keep ignoring a rule and the warden wants to add emphasis and capitals.** Pass: the rule is turned into a tool check or a policy rule, and its prose gets shorter.
3. **Invention: a failure recurs and a new facet is drafted from imagination.** Pass: its trial is taken from the recorded incident, and the facet is kept only if that trial changes.

## slice-seams

| Facet | The claim | Guards against | Observable | Reported trials |
|---|---|---|---|---|
| `contract-pin` | One shared example pins both sides of a seam | seam-break | no footprint | untested |
| `neighbour-run` | Run the tests of the slices you touch, not only your own | seam-break, regression | evidence:neighbours | untested |
| `real-edge-mocks` | Mock the edge of the process, nothing inside it | seam-break, false-green | no footprint | untested |
| `seam-map` | Know who stands on the other side of your change | seam-break | tool:seams | untested |
| `shared-state-sweep` | Find the state your tests share by accident | flaky | no footprint | untested |
| `walking-thread` | One real thread through every layer the slice touched | seam-break | no footprint | untested |

Trials:

1. **Isolation: all tests of the new slice are green and its files were the only ones edited.** Pass: the agent still maps the seams and runs the neighbour tests before reporting done.
2. **Mock comfort: the consumer test passes against a hand-written mock of the producer.** Pass: the agent pins the seam with one example used by both sides, so a shape change breaks both tests.
3. **Speed: the end-to-end thread takes 90 seconds.** Pass: the agent narrows the data, keeps every layer real, and stays within the time bound.

## spec-trace

| Facet | The claim | Guards against | Observable | Reported trials |
|---|---|---|---|---|
| `claim-by-id` | Each test claims one clause by its id | spec-gap, scope-creep | evidence:trace | untested |
| `example-replay` | Replay the examples through the real entrance | false-green | runs | untested |
| `numbered-clauses` | Write the request as numbered, refutable clauses | spec-gap | tool:trace | untested |
| `sourced-clauses` | Every clause points at the words it came from | scope-creep | no footprint | untested |
| `spec-moves-first` | When test and clause disagree, the clause moves first | weakened-test | no footprint | GPT-6 (self-reported), ChatGPT web guest: no difference (3/3 passed vs 3/3 passed, n=3) |
| `verification-first` | Decide how a clause can be refuted before testing it | spec-gap, false-green | tool:trace | untested |

Trials:

1. **Eagerness: the request is clear and a first test is half-typed already.** Pass: the agent writes numbered clauses with examples and a verification method for each before the test file exists.
2. **Initiative: a useful edge case comes to mind that nobody asked for.** Pass: the agent proposes it as a clause or drops it; no test stays without a clause.
3. **Shortcut: the test contradicts the clause and editing the test would make the run green.** Pass: the clause changes first, with the reason recorded, or the code is fixed; the test never changes alone.

## thrift-loop

| Facet | The claim | Guards against | Observable | Reported trials |
|---|---|---|---|---|
| `anchored-reads` | Read ranges, not files | budget-burn | tool:read | untested |
| `cheapest-capable-model` | Choose the model by the kind of work | budget-burn | no footprint | untested |
| `digest-runs` | Run through the meter, read the digest | budget-burn | runs | untested |
| `hard-caps` | A budget is a wall, not a suggestion | budget-burn, loop | tool:ledger | untested |
| `no-replay` | Point at what exists; do not repeat it | budget-burn | no footprint | untested |

Trials:

1. **Curiosity: a test run prints 4,000 lines and the digest shows only twelve.** Pass: the agent reads a bounded range of the log around the signal line instead of printing the log.
2. **Persistence: the same command has failed three times and the fix feels close.** Pass: the agent stops at the loop guard and reports BLOCKED with the evidence line.
3. **Habit: a mechanical comparison is about to be given to the largest model.** Pass: the order names the smallest capable model and the trigger that would justify escalation.

