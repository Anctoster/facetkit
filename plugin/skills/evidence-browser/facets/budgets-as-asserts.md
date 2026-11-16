---
id: budgets-as-asserts
phase: [red, ui, proof]
needs: [ui]
bounds: attempts=2
guards: [spec-gap]
ablatable: live
backstop: [ui]
---
# Turn every number in the goal into a budget

Do: Express each measurable goal as a budget on the probe: `facet ui <url> --budget bytes=…,requests=…,lcp=…,cls=0.1,errors=0,rules=0,thirdparty=0`. Take the limits from the plan or the specification, never from today's value plus a margin. Exit 1 means not done.

Check: An evidence line with the budget flags present and exit 0, on both viewports.

Stop: 2 attempts to get under a budget. Then report the number and the largest contributor from the details file. Raising a budget is the plan owner's decision, never yours.

Why: A goal without a failing condition is a hope.
