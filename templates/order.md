<!-- max-lines: 50 -->
# <ITEM> — work order

## Inputs
- request: <path or link>
- specification, scenarios: <paths>

## Done when
- (the done-criteria in the requester's words, numbered in the block below; check: a tool and its threshold, or [user])
```criteria
[{ "id": "C1", "text": "<what is true when it is met>", "check": "<tool> [<measure> <op> <number>] | [user]", "by": "<step>" }]
```

## Stop conditions
- (one line per NEEDS-USER trigger)

## Budget
- caps.json: runs, minutes

## Evidence
$ <command that shows the starting state> → exit <code>

## Files changed
- none
