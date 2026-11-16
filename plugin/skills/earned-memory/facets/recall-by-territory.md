---
id: recall-by-territory
phase: [map]
bounds: recalls=1, words=120
guards: [repeated-mistake]
footprint: [tool:mem recall]
ablatable: replay
---
# Recall for the files you are about to touch

Do: Before reading code, ask what is known about that territory: `facet mem recall --files <the files of the item> --agent <you>`. Copy the returned lines into your handoff under "Known", so later agents inherit them without recalling again. A memory is a hint with an address: before you rely on one, look at the lines it is anchored to.

Check: The handoff has a "Known" section, or the line "nothing known about this territory".

Stop: 1 recall per step, 120 words. Memories that did not fit are not fetched one by one.

Why: Knowledge loaded just in case is paid for by every agent and used by none.
