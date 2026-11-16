---
id: text-hash-diff
phase: [ui]
bounds: snapshots=1
guards: [regression]
footprint: [tool:ui]
ablatable: replay
---
# Use the text hash to see what changed

Do: Read `text #hash` in the digest. Same hash before and after a refactor: the visible text did not change. A different hash on a refactor is a regression — look at a text or accessibility snapshot of the page, not at pixels, to find the line. For an intended content change, state the expected difference in one sentence before probing.

Check: The handoff states the hash before and after and the word "expected" or "unexpected".

Stop: 1 snapshot read per unexpected difference. A screenshot only when layout is the deliverable or the user asks.

Why: Most visual regressions are text that appeared, vanished or moved; a hash finds that for the price of eight characters.
