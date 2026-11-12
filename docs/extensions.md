# Extensions

An extension is an ES module listed under `"facetkit": { "extensions": ["./path.mjs", "some-package"] }`. Its default export may contain any of:

| Key | Shape | Effect |
|---|---|---|
| `checks` | `{ name: async ({ cwd, item, events }) => ({ ok, value }) }` | `facet check name` runs it and records evidence `name` |
| `rules` | `[ policy rules ]` | appended to the policy (see [governance](governance.md)) |
| `route` | `(step, { state, base, events }) => model \| null` | overrides the model of a step; `null` leaves the decision to the built-in router |
| `commands` | `{ name: () => void }` | adds `facet <name>` |

`examples/extension-changelog.mjs` is a complete example with a check and a rule.

## Built-in equivalents

These ship with the library and need no extension; they are described here because they are the three most asked-for.

### Model routing

```json
"facetkit": { "router": { "enabled": true, "minN": 5, "minLow": 0.7, "exploreEvery": 6 } }
```

The model of a step starts from the role's phase model in `loadouts.json`. With the router enabled, a cheaper model is used **only** when the agent has at least `minN` closed items on it and the lower bound of its first-pass rate is at least `minLow`. `exploreEvery: 6` sends every sixth normal-tier item of an agent one step cheaper on probation, so that the evidence can exist; hard tiers are never explored. A model that was tried and fell short is not retried. After two failed attempts of a step the flow moves one step up for that step, whatever the router says. `facet flow next` prints the reason next to the model.

### Evaluation

`facet eval matrix | compare | replay | judge` — see the README. An extension can add its own judge as a `check`.

### Security checks

`facet scan` — see [governance](governance.md). Configure `"govern": { "forbidden": ["deploy/env/**", "*.pem"], "stores": ["docs/agents/memory"] }`. Add organisation-specific patterns as a `check` in an extension.
