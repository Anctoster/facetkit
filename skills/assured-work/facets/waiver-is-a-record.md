---
id: waiver-is-a-record
phase: [run]
bounds: waivers=1
guards: [security, unverified-claim]
ablatable: no
---
# An exception is a named decision of a person

Do: You never waive a rule. When a rule cannot be met and the user decides to close anyway, record their decision in their name: `facet waive <rule> --item <id> --reason "<their reason>" --by <their name>`. The same holds for approvals a scan asks for: `facet approve <what> --by <name>` only after the person said yes to that exact thing. Quote the waiver in your report.

Check: Every waiver and approval in `facet attest` carries the name of a person, and your report lists them.

Stop: 1 waiver per item on your own asking. A second failed rule means the item is not ready: say so instead of asking again.

Why: A silent exception is how a process that looks strict stops being one.
