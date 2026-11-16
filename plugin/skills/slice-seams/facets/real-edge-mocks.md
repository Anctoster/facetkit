---
id: real-edge-mocks
phase: [red]
bounds: mocks=3
guards: [seam-break, false-green]
ablatable: no
---
# Mock the edge of the process, nothing inside it

Do: Replace only what leaves the process: network, clock, mail, payment, the file-system root. Everything inside runs for real — the router, validation, the repository on an in-memory or temporary database. Give each mock a comment naming the edge it stands for. Never mock the module your slice integrates with.

Check: The handoff lists every mock in the new tests with its edge; none of them replaces a module of the project.

Stop: 3 mocks in one test file. A fourth means the unit is cut in the wrong place: report that instead of adding it.

Why: A mock replaces the seam with your assumption about the seam.
