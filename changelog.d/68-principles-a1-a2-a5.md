### Added
- **Principles A1, A2, A5** (plan 2.11, core).
  - **A1:** a step that owns a measured criterion does not end DONE without the criterion's result measured in the step — after its start, by its run when one is named, and passing. Evidence records its `run`.
  - **A2:** the statuses a step's handoff gives its criteria are kept in `step.end`. In the trust graph, `blocked`/`partial` with a reason charges nothing, and a `done` refuted by a check charges twice.
  - **A5:** `facet audit` reports a trust score, a share of trust or a rating in agent definitions, loadouts or handoff templates as an error.
