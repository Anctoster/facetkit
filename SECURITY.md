# Security

## Reporting a vulnerability

Please do not open a public issue for a vulnerability. Use GitHub's private vulnerability reporting for this repository ("Security" → "Report a vulnerability"). You should receive an answer within seven days.

## What facetkit does and does not do

- It runs **your** commands (`facet run`, `facet check`, `facet eval judge`, the test command of `facet mutate`). It adds no sandbox: anything those commands can do, they can do. Run agents and their commands with the permissions you would give a new colleague on their first day.
- `facet mutate` and `facet canary` change source files temporarily and restore them. If the process is killed in between, restore with `git checkout -- <file>` (and `facet canary reveal` for a planted canary).
- `facet scan` is a set of patterns. It finds common secrets, dangerous commands and injected instructions; it does not prove their absence. Keep your usual secret scanning.
- The journal, the memory store and attestations are plain text meant to be committed. They contain file names, command lines and notes written by agents. **Review them before making a repository public.** `facet scan` checks the text stores agents read for injected instructions, but nothing stops a person from writing a secret into a note.
- An attestation is a digest, not a signature. It shows that a file matches the journal it was computed from; it does not prove who wrote the journal. Sign commits or attestation files with your own tooling if you need that.
- Transcripts imported by `facet cost import` are read for token counts only; their content is not stored.
