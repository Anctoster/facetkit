# facetkit for architects

Two kinds of architect read this page. A **software architect** wants the shape of the code to hold while many people and agents change it. A **building architect** wants drawings and models produced by agents to be checked the way a drawing set is checked. Both get the same three things from facetkit: rules a tool enforces, decisions whose predictions are measured, and a record the client can read.

## Software architects

### Rules the code must keep — as a ratchet

```json
"fitness": [
  { "id": "client-not-server", "kind": "no-import", "from": "src/**", "to": "server/**" },
  { "id": "layers", "kind": "layers", "order": ["src/pages/**", "src/components/**", "src/lib/**"] },
  { "id": "no-cycles", "kind": "no-cycle", "within": "src/**" },
  { "id": "small-modules", "kind": "max-lines", "files": "src/**", "max": 600 },
  { "id": "narrow-api", "kind": "max-fan-in", "files": "src/lib/**", "max": 30 },
  { "id": "server-tested", "kind": "tested", "files": "server/**" }
]
```

`facet fitness --accept` records today's violations as the baseline; from then on a **new** violation fails `facet fitness` (and the evidence `fitness` of the item), and a fixed one is reported. The code may get better at any pace; it may not get worse. Rules work on JavaScript/TypeScript, Python, Go and Java.

### Decisions with a prediction

An architecture decision is a prediction about the system. Record it with what must keep holding if it was right:

```bash
facet decide new ADR-4 --title "The UI never talks to the database" \
      --decision "all data goes through the API" --rejected "direct queries from server components" \
      --fitness client-not-server
facet decide new ADR-5 --title "Small first load" --decision "three.js loads lazily" \
      --measure "node scripts/first-load-kb.mjs" --max 350
facet decide check
```

```text
ADR-4 HOLDING    The UI never talks to the database
    ✓ fitness client-not-server — clean
ADR-5 REVIEW     Small first load
    ✗ node scripts/first-load-kb.mjs — 412 (max 350)
```

Records are written to `docs/decisions/` as JSON and Markdown. A failed measure does not make a decision wrong; it makes it due for review, with the number that says why.

### Where the structure hurts

| Question | Command |
|---|---|
| What changes often and is used by many? | `facet atlas hotspots` |
| What changes together without importing each other? | `facet atlas coupling` |
| Who owns a file, what does a change reach, which agents does it need? | `facet route <files>` |
| Did a change turn out bigger than planned? | the route adapts by itself: `facet flow next` adds `blueprint-architect` when a change reaches five or more modules, eight or more files, more than one owner, or security-relevant files |

## Building architects

The method also runs outside code. Two plugins in the facetkit marketplace apply it to architectural work:

| Plugin | For |
|---|---|
| [`arch-flow`](../domains/arch/README.md) | Archicad production: source texts and raster drawings → a checked building description → a model on the right layers → complete drawing sets (projekt budowlany, projekt wykonawczy) as PDF and DWG → a schedule with quantified risk; variant sketching of site plan, layouts and facades compared by measured indicators |
| [`viz-flow`](../domains/viz/README.md) | visualization: Archicad → Blender → renders → images for the website, with briefs and measured stage checks |

What they share with the code team: one journal, briefs with criteria the architect approves once, an independent inspector who re-runs the checks, questions instead of guesses, and a page for the client:

```bash
facet explain --for client --lang pl --html status.html
```

## What it does not do

- It does not judge whether an architecture is good. It checks that the one you chose is kept, and tells you when its predictions stop holding.
- Fitness rules know imports, not runtime calls; layers by folder, not by meaning.
- arch-flow does not confirm compliance with building regulations: the composition of a drawing set is approved by the designer.
