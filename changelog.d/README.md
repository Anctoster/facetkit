# changelog.d — one file per change

A pull request does not edit `CHANGELOG.md`: parallel pull requests would all write the same lines and
conflict. It adds one file here instead, and a release gathers them (`npm run release:prepare <version>`).

**Name:** `<id>-<slug>.md` — `<id>` is the pull request number (or another token no other fragment uses),
`<slug>` lowercase words joined by `-`: `64-changelog-fragments.md`.

**Content:** one or more sections of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), each with
bullets — `### Added`, `### Changed`, `### Deprecated`, `### Removed`, `### Fixed`, `### Security`:

```markdown
### Added
- **A new validator** (plan 2.10). What it does, in a sentence or three.
```

**Nothing for users** (a refactoring, a test, CI): say so instead of writing nothing —

```markdown
skip: tests only
```

`node scripts/changelog.mjs check` holds every fragment to this: no empty file, no other section, no
entry written twice, one fragment per id. In CI, a pull request must add a fragment and must not touch
`CHANGELOG.md` (a release pull request, branch `release/<version>`, is the exception). At release the
fragments become the dated section of the version, and are removed only after `CHANGELOG.md` was written
and read back. Running the release again adds nothing twice.
