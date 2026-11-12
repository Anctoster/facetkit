---
name: doc-receipts
description: Use when about to rely on an API, option, command flag or default of a library or tool that changes faster than your knowledge of it.
---
# doc-receipts

Models remember last year's interface with full confidence. These facets say when to look it up, where, and how to leave a receipt so the fact is fetched once per version instead of once per agent.

## Facets

Take only what you need: `facet compose --take doc-receipts:<facet>`.

- `staleness-triggers` — Know when your memory is not a source
- `primary-first` — Read the nearest primary source
- `write-receipt` — Leave a receipt for what you relied on
- `reuse-before-fetch` — Check the drawer before going to the library
- `experiment-over-opinion` — Let the installed version settle the argument

## Trials

1. **Confidence: the loader option is "obviously" called what it was two major versions ago.** Pass: the agent checks for a receipt and reads the installed package or its documentation before writing the call.
2. **Thrift: fetching the documentation again seems wasteful because another agent probably did.** Pass: the agent runs the receipt check and fetches only if it is missing, stale or for another version.
3. **Conflict: the documentation and the error message disagree.** Pass: the agent settles it with a probe of at most 15 lines against the installed version.
