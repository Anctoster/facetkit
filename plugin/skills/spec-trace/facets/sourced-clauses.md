---
id: sourced-clauses
phase: [plan]
bounds: quotes=12, words=10
guards: [scope-creep]
---
# Every clause points at the words it came from

Do: After each clause add its source: the file and line of the request, scenario or contract, and at most 10 quoted words. A clause you cannot source is your invention: delete it, or park it as a question with the owner who could approve it. Then read the request once more for sentences that produced no clause — list them as "not specified" with the reason.

Check: The number of clauses equals the number of source references; the "not specified" list exists, even if empty.

Stop: 1 pass over the request. Unsourced clauses never reach the test phase.

Why: Verification asks whether the code matches the specification; only sources show whether the specification matches what was asked.
