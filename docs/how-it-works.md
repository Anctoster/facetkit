# How facetkit works — for the person who has to act on it

facetkit keeps one record of the work — the **journal** — and answers questions from it. Agents do the work; tools measure it; a policy decides when an item may close; people decide the exceptions. Everything below is a different way of reading the same record.

```
request ─► item opens ─► agents work step by step ─► tools record evidence ─► policy decides ─► proof pack
                 ▲              │                                                      │
                 └── the route adapts when the record says the item is riskier ◄───────┘
```

## If you are a developer

You want the next command and nothing else.

```bash
facet explain --for dev        # what to do now, what is not met yet
facet flow next                # one action: which agent, which model, which rules
facet handoff check build      # is the handoff whole, before the inspector sees it
facet fitness                  # did this change break an architecture rule
```

Example: after `build`, `facet flow end build --status DONE` answers *"src/api/leads.js changed and is not listed under Files changed"*. The builder adds one line and ends the step again — instead of an hour later when the inspector sends the item back.

## If you lead the team

You want to know where time and rework go, and whether the rules you give agents help.

```bash
facet explain --for lead       # first-time-right, causes of rework, tokens, per item
facet skill report             # each rule: is it read, followed, does it help — and one action
facet trust                    # closed items by level; defects found later, with an upper bound
facet board                    # everything on one page
```

Example from a real project, first eight items: every item needed at least one rework; the most frequent cause was a stale handoff (8 times); two thirds of the tokens were spent by the coordinator. 0.7 answers the first with an automatic handoff check and the second with a coordinator that does less.

## If you are the client or product owner

You want to know what is done and how sure the team is — in words.

```bash
facet explain --for client --html status.html
```

The page says, per piece of work: *done* or *in progress*, and how sure the team is — from "reported as done, not independently checked" to "the tests were shown to catch deliberately planted mistakes". It also says what it does not cover: mistakes nobody has found yet.

## If you audit the work

You want every rule, exception and signature, and to check them yourself.

```bash
facet explain --for auditor
facet proof verify --item P07            # VALID, STALE, DECAYED, TAMPERED, UNSIGNED, MISMATCH or UNKNOWN
facet proof witness --item P07           # run the checks again yourself and compare
facet proof export --item P07 && facet proof verify --bundle P07.proof.json --root <your copy>
```

A proof pack is signed by a key the project trusts, names the sources it is valid for (content, executable bits, links), the environment it was measured in, and the benchmark that says how much its guards catch. Anyone can recompute it from the journal.

## The words, once

| Word | Means |
|---|---|
| item | one piece of work with an id (P07) |
| step | one agent's turn on an item (map, red, build, proof…) |
| handoff | the short file one step leaves for the next |
| evidence | a result a tool measured — never a sentence an agent wrote |
| level | how much the evidence supports: L0 claimed … L4 calibrated |
| waiver | a person's named decision to close despite a failed rule |
| facet | one rule given to an agent, with a check and a stop |
| witness | a second run of the checks, by someone else, on the same sources |
