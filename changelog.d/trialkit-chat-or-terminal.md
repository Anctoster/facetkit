### Added
- **Trial kit** in English and Polish (`docs/trial-kit.md`, `docs/trial-kit.pl.md`): for each of the 42 trial scenarios, which facets it tests and whether a web chat is enough or an agent with a terminal is needed; the 13 facets no scenario tests yet; a four-level trap ladder with ready wording for when the control passes 3/3 (ceiling); which models to test; when to extend to 10 + 10 runs; side effects as results.
- **First reported trial** in `trials/results.json`: `spec-trace:spec-moves-first` on GPT-6 (self-reported), no difference at a ceiling (#77).

### Changed
- **Running a trial** and the **Trial result** template ask for the control first, the trap level and the side effects; the Trial board text points to the kit.
