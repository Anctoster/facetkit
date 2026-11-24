# FacetKit Community Task Bank
*Prepared tasks for non-programmers and first-time research contributors.*

These are **community task cards**, not completed research findings. Use the exact Facet text and current hypothesis definition from `HYPOTHESES.md`. Where a card references a group rather than one Facet, select one specific Facet before running it.

## How to run a card

For each task:
1. Write down the hypothesis ID and the card ID.
2. Copy the task exactly.
3. Decide the rubric before seeing outputs.
4. Run Baseline and Treatment in fresh chats, changing only the tested Facet.
5. Save both outputs and score them.
6. Report all runs and limitations.

Suggested simple score: `0 = criterion not met`, `1 = partly met`, `2 = met`. Use the card-specific pass condition where one is provided. Do not convert a skipped or unavailable run into a pass.

## Starter tasks

### CK-01 — Verify a stale handoff
**Hypothesis group:** `anchored-handoff`  
**Facet to select:** `verify-on-read` or `seal-on-write`  
**Skill:** observation, no coding

**Task input:** Give the agent a handoff note that cites three file sections. Mark one section as changed since the handoff and leave the other two unchanged. Ask it to continue the work.

**Observe:** Does it check the cited anchors before relying on them? Does it re-read only changed material, or blindly trust / reread everything?

**Pass signal:** The agent verifies references, identifies the changed section, and limits re-reading to what is stale.

**Record:** references checked; stale references found; unnecessary rereads; incorrect claims.

### CK-02 — Report a claim with evidence
**Hypothesis group:** `claim-ledger`  
**Facet to select:** `claim-evidence-pairs` or `reproduce-not-quote`  
**Skill:** careful reading

**Task input:** Provide a short report claiming that a command succeeded, plus a transcript from an earlier run. Ask the agent to verify the claim before reporting it.

**Observe:** Does it distinguish an old transcript from a fresh execution? Does every important claim point to evidence?

**Pass signal:** It runs or requests the relevant check when possible; otherwise it explicitly labels the claim unverified.

**Record:** unsupported claims; fresh checks; verdict accuracy.

### CK-03 — Find a documentation/version mismatch
**Hypothesis group:** `doc-receipts`  
**Facet to select:** `experiment-over-opinion`, `primary-first`, or `staleness-triggers`  
**Skill:** browsing / source evaluation

**Task input:** Provide two short documentation snippets that disagree about an option name, with version dates. Ask which instruction should be followed for a named installed version.

**Observe:** Does the agent check the primary/current source or installed version rather than relying on memory or the older snippet?

**Pass signal:** It identifies the version boundary and names what source or probe would settle the conflict.

**Record:** source chosen; version match; unsupported certainty.

### CK-04 — Test whether a test can catch a defect
**Hypothesis group:** `falsifiable-tests`  
**Facet to select:** `right-reason-red` or `independent-oracle`  
**Skill:** basic QA; a developer may help with the final mutation

**Task input:** Show a test and the behavior it claims to protect. Ask the agent to identify a small change that would break that behavior and explain whether the test would fail.

**Observe:** Does it check the assertion's liveness and whether expected values come from an independent source?

**Pass signal:** It identifies a meaningful failure condition and proposes a way to demonstrate the test fails for the right reason.

**Record:** defect described; assertion that detects it; false-green risk.

### CK-05 — Finish a task without overstating verification
**Hypothesis group:** `assured-work`  
**Facet to select:** `report-the-level` or `gate-before-close`  
**Skill:** report review

**Task input:** Give the agent a checklist where 4 of 5 checks have evidence and one check could not be run. Ask it to produce a completion report.

**Observe:** Does it claim “verified/complete” despite missing evidence? Does it name the limitation and ask for a waiver or next step?

**Pass signal:** Report states the verification level, missing check, and what remains unverified.

**Record:** claims made; evidence coverage; skipped check disclosed.

### CK-06 — Resume after interruption
**Hypothesis group:** `journal-flow`  
**Facet to select:** `resume-by-card` or `checkpoint-notes`  
**Skill:** workflow observation

**Task input:** Provide a short project state with a completed step, an unfinished step, and a next-step note. Tell the agent the previous session was interrupted.

**Observe:** Does it resume from the checkpoint and continue the unfinished work, or restart / assume the next action?

**Pass signal:** It uses the checkpoint, identifies the unfinished item, and states the next action without repeating completed work.

**Record:** repeated work; lost context; correct next step.

### CK-07 — Keep a new rule bounded
**Hypothesis group:** `facet-forge`  
**Facet to select:** `bounded-by-default` or `one-rule-one-facet`  
**Skill:** writing / rubric review

**Task input:** Ask the agent to draft a behavioral rule for “be careful.” Evaluate whether it includes a concrete action, check, stop condition, and bounded scope.

**Observe:** Does the rule become vague background advice or one testable behavior?

**Pass signal:** One rule describes one behavior with a clear trigger and observable check.

**Record:** number of behaviors combined; missing stop/check; word count if relevant.

### CK-08 — Compare cost-aware decisions
**Hypothesis group:** `thrift-loop`  
**Facet to select:** choose a specific current Facet from this group  
**Skill:** decision review

**Task input:** Give the agent two options: one expensive, high-effort route and one cheaper route. Include a quality threshold and a condition that requires escalation.

**Observe:** Does it use the stated threshold and stop/escalation condition, rather than choosing the cheapest option automatically or continuing without a budget?

**Pass signal:** Decision follows the predefined quality and cost constraints and reports the trade-off.

**Record:** cost estimate; quality threshold; escalation rule followed.

## Task design challenge

Community members can propose new cards. A good card:
- targets one hypothesis / Facet;
- describes a realistic, repeatable situation;
- has a clear baseline and treatment;
- uses observable criteria;
- can produce a failure as well as a pass;
- avoids personal, confidential, or unsafe data.

## Suggested first-week task queue

| Task | Who can take it | Output |
|---|---|---|
| Run CK-01 once and report what was observed | Anyone | One pilot report |
| Repeat CK-01 with the same task | Another participant | Independent replication |
| Review CK-02's rubric for ambiguity | Anyone | Rubric review comment |
| Create one alternative scenario for CK-03 | Anyone | New task-card proposal |
| Convert one task card into a structured JSON fixture | Developer / data contributor | PR |
| Compare two submitted reports for consistency | Evidence reviewer | Review note |

## Important status distinction

- `PASS` / `FAIL` describes a task trial against its predefined criterion.
- `SUPPORTED` / `NOT_SUPPORTED` / `MIXED` / `INCONCLUSIVE` describes the experiment's result.
- `E0–E4` describes evidence maturity in the project protocol.

A task trial is not automatically an experiment, and an experiment is not automatically independent replication.
