---
id: verify-on-read
phase: [design, build, red, proof]
needs: [capsule, read]
bounds: drift=33
guards: [stale-handoff]
footprint: [tool:capsule verify]
ablatable: live
backstop: [handoff]
---
# Check the anchors before you believe the notes

Do: Your first action on receiving a handoff: `facet capsule verify <handoff>`. Anchors reported ok you may trust without opening the file. Moved: use the new range. Drifted or missing: re-read only those with `facet read`, and note under `## For <author>` what changed.

Check: The first evidence line of your own handoff is the verify result.

Stop: If more than 33 percent of the anchors drifted, the handoff is stale: return it with status BLOCKED instead of repairing it yourself.

Why: Re-reading everything to be safe pays twice; trusting stale notes pays later, with interest.
