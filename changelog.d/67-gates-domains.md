### Added
- **The gates in the domains** (plan 2.10, arch-flow and viz-flow). When a working step ends DONE, the engines refuse three things:
  - **H2:** changed files that hold the checks — `checkFiles` in `domain.json`, hashed at the step's start. `approve-checks <step> --by <person>` lifts it; no agent of the route may.
  - **H4:** placeholders in the item's JSON files — `placeholders` in `domain.json`. In arch: a zone without a name, an element on the default layer or without an id. In viz: a default material in use, objects without a material.
  - **H9:** a handoff that does not give every criterion of the step its status.

  H1 was already the engines' rule (an OK only with the tool's receipt). `gates.py` is shared by both domains. An approval is imported as the core's `check-files:<step>` approval. The working agents of both domains are told how to write H9.
