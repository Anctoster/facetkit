# Skill intelligence: which rules work, why, and how to make them better

A collection of skills is a collection of beliefs. Most systems can tell you that a rule was written and that somebody is convinced of it. facetkit measures three more things about every facet, from records it already keeps, and turns them into one diagnosis and one action.

## Three measurements

| | Question | Source |
|---|---|---|
| **Exposure** | Was the rule in what the agent read for this step — or deliberately withheld? | `step.start` records the facets of the loadout (`facets`, `withheld`) |
| **Adherence** | Did the agent do what the rule says? | the facet's **footprint** against the run ledger and the journal |
| **Effect** | Did the failure the rule guards against become rarer? | verdicts and late defects, each with a **failure mode** |

### Footprints

A facet declares in its front matter what the record shows when it was followed:

```yaml
guards: [false-green]          # the failure modes it exists to prevent (facet skill modes)
footprint: [tool:mutate]       # tool:<facet command> · evidence:<name> · event:<kind> · note · runs · red-first
ablatable: no                  # only for rules whose absence could do harm no later check would catch
```

Every `facet` command used with `--item` leaves a line in the item's ledger, so "the agent ran `facet capsule verify` during this step" is a fact, not a claim. A rule whose observance leaves no trace has no footprint — on purpose — and is then judged only by withholding.

### Failure modes

Blame is recorded with a cause from a fixed vocabulary: `facet flow verdict REWORK --fix slice-builder:seam-break`, `facet retro hindsight --fix <commit> --mode false-green --record`. With `"skillint": { "requireCause": true }` a rework without a cause is refused — the rule "name the cause" was graduated into the tool rather than written into a prompt.

`false-green · seam-break · spec-gap · scope-creep · weakened-test · unverified-claim · stale-handoff · doc-drift · budget-burn · loop · flaky · regression · lost-work · repeated-mistake · unasked-assumption · security · other`

For a facet with `guards`, "good" means *no incident of those modes for that agent in that item* — a rule is judged on the failure it was written for, not on everything that went wrong.

## From correlation to experiment

Comparing steps where a rule was followed with steps where it was not is a correlation: careful agents follow rules and also make fewer mistakes. To know, leave the rule out on purpose.

```json
"facetkit": { "skillint": { "ablate": { "rate": 0.1, "seed": "2026" } } }
```

With a rate above zero, `facet flow start` withholds **at most one** facet from a step, chosen by a seeded draw over the facets that may be withheld, writes the reduced rules to `.work/<item>/rules-<step>.md` and prints the path for the coordinator to pass on. Rules marked `ablatable: no` — budget caps, the inspector's independence, threshold guards, the gate — are never withheld. Withholding is **off by default**: it trades a little quality now for knowledge, and that is the project owner's decision.

Faster and without risk to real work: replay a recorded step without the facet (`facet eval replay`, then `facet compose --take …` for the reduced rules) and compare the checks.

## Diagnoses

`facet skill report` prints one line of numbers and one action per facet:

| Diagnosis | Means | Action |
|---|---|---|
| works | the failure is rarer with the rule, the intervals do not overlap | keep; protect the wording from growth |
| works when followed, mostly ignored | it helps and agents skip it | **graduate**: turn its Check into a tool or a policy rule, shorten the prose |
| ignored | adherence is low, no effect can be shown | reword shorter, move earlier; graduate if its Check can be a tool |
| followed, no measurable effect | agents do it and nothing changes | retire, or the models have outgrown it — confirm by two replays without it |
| model-dependent | followed on some models only | fix that model's loadout or raise the model; do not rewrite the rule |
| followed; effect unknown | every step had it, nothing to compare | enable withholding or replay without it |
| unobservable | no footprint | give it one, or learn its effect by withholding |
| thin / never used | fewer than five exposures | no conclusion |

`facet skill coverage` turns the question around: for each failure mode, how many incidents, which loaded facets guard it. **GAP** — incidents and no loaded guard — comes with a trial *harvested from the recorded incident*, so a new facet starts from something that happened. **RECURRING** — a guard is loaded and the failure returns — points at that guard's diagnosis, not at another rule.

## The life of a rule

```
 incident ──► harvested trial ──► facet (prose, with guards and footprint)
                                     │  measured: exposure · adherence · effect
                 ┌───────────────────┼─────────────────────┐
                 ▼                   ▼                     ▼
        ignored → reword     works but ignored →     followed, no effect →
                             graduate into a tool     retire
                                     │
                                     ▼
                         a check or a policy rule; the prose shrinks to one line or disappears
```

The direction is deliberate: prose is the weakest way to hold a line. A healthy collection gets **shorter** over time, because the rules that matter become tools and the rules that do not are deleted. The skill `skill-sense` gives these steps to the agent that maintains the collection, two facets per session at most.

## What this cannot tell you

- With withholding off, effects are correlations. The report says so on its last line.
- Adherence is as good as the footprint: "ran `facet mutate`" does not prove the survivors were handled well.
- Small numbers: nothing is concluded from fewer than five steps on either side, and intervals are 80 %.
- A failure nobody recorded with a cause guards nothing and blames nobody.

## Experiments (0.6.0)

Seeded withholding answers "what happens without this rule" in passing. An experiment asks it on purpose:

```bash
facet experiment new EXP-001 --facet thrift-loop:digest-runs --seed 2026 --min 20 --model sonnet
facet experiment start EXP-001      # from now on each step that loads the facet is assigned an arm
facet experiment report             # control vs treatment, with intervals, and what may be concluded
```

The manifest is written once, before the data. The arm of a unit (one step of one item) is a function of the seed, so the assignment can be recomputed by anyone. Units on another model or of another task class are left out and counted. A facet marked `ablatable: no` is never withheld. With fewer than `--min` units in either arm the verdict is "not enough data"; a difference found once is *exploratory*; a second experiment declared with `--confirms EXP-001` makes it *validated* only if it shows the same direction. The report ends with a decision for a person — nothing is retired automatically.
