---
id: probe-digest
phase: [ui, proof]
needs: [ui]
bounds: urls=2, probes=2
guards: [unverified-claim]
footprint: [tool:ui]
---
# Prove it with a digest, not a picture

Do: Serve the production build locally and probe it: `facet ui <url> --item <id>`. Work from the digest — requests, bytes by kind, LCP, CLS, errors, third parties, rule findings, text hash — and open the JSON it names only for the key that failed. For a change, probe the base and the result and compare the two digests line by line.

Check: The handoff carries the digest lines for desktop and phone and the path of the details file.

Stop: 2 URLs per slice, 2 probes each: before and after.

Why: A screenshot costs thousands of tokens and proves one viewport at one moment to nobody who cannot see it.
