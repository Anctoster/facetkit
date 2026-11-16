---
id: write-receipt
phase: [design, build]
needs: [receipt]
bounds: facts=3
guards: [doc-drift, repeated-mistake]
footprint: [tool:receipt add]
ablatable: replay
---
# Leave a receipt for what you relied on

Do: After reading, record it: `facet receipt add --topic "<library feature>" --package <name> --url <primary source> --fact "…" --fact "…"`. Write up to 3 facts, each something the code will depend on: a name, a signature, a default, a removal. Mention the receipt topic in the handoff beside the code that depends on it.

Check: `facet receipt list` shows the topic as fresh with the installed version.

Stop: 3 facts per receipt. A fourth belongs to another topic.

Why: The next agent inherits the fact instead of fetching it again or guessing it again.
