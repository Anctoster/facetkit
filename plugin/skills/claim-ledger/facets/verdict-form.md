---
id: verdict-form
phase: [proof]
bounds: fixes=7
guards: [unverified-claim]
ablatable: no
---
# Say PASS, REWORK or NEEDS-USER, then prove it

Do: Put the verdict on the first line and use exactly one of three words. PASS only when every done-criterion is met, or is marked "not verifiable here" with the reason. REWORK comes with numbered fixes, each naming its owner, the exact change, and the command that will show it fixed. NEEDS-USER states the decision required in one sentence. No adjectives and no "mostly".

Check: Each rework item has an owner and a checking command; each done-criterion has a result.

Stop: 7 rework items. With more, list the 7 most severe and recommend re-planning instead of patching.

Why: A verdict that needs interpretation gets the interpretation the reader hoped for.
