---
id: gate-before-close
phase: [run]
needs: [flow]
bounds: attempts=2
guards: [unverified-claim]
ablatable: no
---
# The policy closes the item, not the last agent

Do: Before closing, look at what the record supports: `facet assure --item <id>`. Each line is a rule, its level, and the evidence found. For a rule that is not met, produce the evidence with the tool that measures it — `facet check`, `facet scan`, `facet trace`, `facet mutate` — never by writing that it holds. Then `facet flow close`, which evaluates the same policy and refuses when it is not met.

Check: `facet assure` exits 0 for the required level before `facet flow close` is called.

Stop: 2 attempts to satisfy a rule. After that it is a person's decision: show the rule and its reason and ask.

Why: An item that closes because everyone reported DONE has been checked by nobody in particular.
