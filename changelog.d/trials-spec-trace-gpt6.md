### Added
- **Three confirmed trials** in `trials/results.json`: `spec-trace:numbered-clauses`, `sourced-clauses` and `verification-first` on GPT-6 (self-reported), 0/3 → 3/3 each (#79, #80, #81), with their side effects.

### Changed
- **Trial kit** and the **Trial result** template: pass or fail is judged by the scenario's criterion in plain words, never by the rule's own markers, which a control run cannot know.
