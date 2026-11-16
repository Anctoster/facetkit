# Hypotheses, lessons, trust, healing and the economy

Five mechanisms turn the journal from a record of what happened into knowledge the team acts on. They share three rules: every number is read from the journal, unknown counts as the worst case, and nothing that changes how the team works happens without a named person.

```
 recurring mistake ──► proposal ──► hypothesis ──► experiment ──► verdict ──► lesson ──► what agents are given
        ▲                                                                        │
        └──────────── heal: weak points found in the record ◄── trust graph ◄────┘
                                        economy: what each rule, agent and check costs and returns
```

## Hypotheses — `facet hypo`

A hypothesis is a claim with a prediction fixed before the data: an outcome, a direction, and the smallest effect worth having. Its verdict is computed from the design that tests it (`facet intel`): `untested`, `testing`, `promising` (found once), `supported` (found again on an independent sample), `contradicted` / `refuted`, `no-effect` (the interval rules out an effect of the stated size) or `inconclusive`. Nobody sets a verdict by hand.

```bash
facet hypo new H-oracle --claim "an independent oracle gives more clean closes" --facet falsifiable-tests:independent-oracle --margin 0.05 --design IO-1
facet hypo
```

## Lessons: cognitive memory and learning — `facet learn`

The journal remembers events; `facet mem` remembers facts about places in the code; a **lesson** is a rule of conduct a hypothesis earned: *in this situation, do this*. Agents are not retrained — what changes is what they are given.

- A supported hypothesis becomes `use-facet`, a refuted or null one `avoid-facet`; `facet learn apply --by NAME` records the decision.
- **Confidence is recomputed, never stored**: it starts from the verdict (0.9 supported, 0.6 found once), rises with every later item where the lesson was applied and the agent was not blamed, falls with every one where it was, fades by half every 60 items it goes unused, and halves when the model changes.
- At each step the lessons that fit the situation (agent, task class, difficulty, model) are recalled, most trusted first, within a word budget; they add facets, leave facets out, or append a note. A running experiment outranks a lesson. A lesson below 0.5 stops being applied by itself.

## Trust graph — `facet trustgraph`

Nodes are agents on a model, judges, checks and results; edges (produced, checked, judged) come from the journal. A node's trust is the lower bound its record supports, so a node nobody has observed has trust 0: unknown, not trusted. A check is marked down when it passed an item that later showed a defect, or gave both answers on the same sources. A result is as trustworthy as its weakest support, and that support is named: `facet trustgraph --item P07`.

## Self-healing — `facet heal`

Detectors read the record for the team's own weak points: an agent or judge whose work does not hold, a check that was contradicted or that never fails, a faded lesson, a recurring mistake nothing addresses, a rule that is routinely waived, a file no check covers.

Remedies are of two classes. **Automatic** ones are reversible and touch only the team's own configuration: run a weak agent one model up on probation, stop counting a contradicted check, retire a faded lesson, file a proposal. Everything else names the command **for a person**. After eight closed items the detector runs again: gone means healed; still there means failed, and it goes to a person — an automatic remedy is never repeated on the same weakness. `facet heal undo KEY` reverses one. Healing never edits a facet, changes the policy, waives a rule or lowers a requirement.

## Capability economy — `facet economy`

Each rule costs its words on every delivery and is worth the measured change in clean closes times what a rework cycle costs here. A role's word budget buys, in order: **core** rules (safety, never priced), **proven** rules by return, and a fixed share for **unpriced** ones — because the only way to price a rule is to deliver it inside an experiment. Rules with a measured null or negative return are left out, with the reason. For labour: the cheapest model whose earned trust meets what the task's risk demands; when none has earned it, the largest works and cheaper ones are tried where a mistake is cheap.

## Limits

No hypothesis has been tested on real work yet, so no lesson exists and every rule is unpriced; the mechanisms are tested on constructed journals. Trust needs observations: with a few closed items almost everything is "unknown". The value of a rule counts only rework it prevents — a rule that prevents a rare, expensive defect is undervalued until that defect is priced too.
