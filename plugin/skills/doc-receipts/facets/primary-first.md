---
id: primary-first
phase: [design, ops]
bounds: fetches=3
guards: [doc-drift]
ablatable: replay
---
# Read the nearest primary source

Do: Go in this order. First the installed package itself — its README, type definitions and changelog under `node_modules` are free and exactly the right version. Then the official documentation for that version. Then release notes or the migration guide. Then the source and its issues. Use articles and answers only to learn which term to look up. Read the section you need, not the site.

Check: The receipt's source is the project's own domain or repository, or a path inside the installed package.

Stop: 3 fetches per topic. Still unclear after that: stop reading and run an experiment.

Why: Second-hand explanations describe the version their author had.
