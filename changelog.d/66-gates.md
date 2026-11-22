### Added
- **Gates against work declared done without being done** (plan 2.10, core). When a step ends DONE, four gates are checked:
  - **H1** — every OK its criteria rest on carries a receipt of the registered command (checked again at `verdict PASS`);
  - **H2** — a `build`/`ops` step did not change tests, check scripts, thresholds or the policy (`govern.checkFiles`; only a person's `facet approve check-files:<step>` lifts it);
  - **H4** — no placeholder in the lines it added (`TODO`, `FIXME`, not implemented, an empty body; `govern.placeholders`);
  - **H9** — its handoff names every criterion of the step as `done`, `blocked — why` or `partial — what is left`.

  The step's own changes are taken since its snapshot when there is one. The producing agents are told how to write H9.
