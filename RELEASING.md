# Releasing facetkit

A checklist for the first public release and for every later one. Commands assume you are in the repository root.

## Before the first release (once)

1. **Decide the names.** Check that `facetkit` is free on GitHub (your account or organisation) and on npm (`npm view facetkit`). If it is taken, rename in: `package.json` (`name`), `.claude-plugin/marketplace.json`, both READMEs (the plugin manifest is generated from `package.json`).
2. **Put your name in.** `LICENSE` (copyright line), `package.json` (`author`, `repository`, `homepage`, `bugs`), `marketplace.json` (`owner`). Replace `<owner>` / `<właściciel>` in `README.md` and `README.pl.md`.
3. **Look for anything private.** This repository must not contain a journal, a memory store, attestations, transcripts or a `.work/` folder from a real project:
   ```bash
   git status --ignored
   node bin/facet scan --ref "$(git hash-object -t tree /dev/null)"    # scans every file as if it were new
   grep -rIl "VIS\|Marina" . --exclude-dir=.git                         # the project facetkit grew up in: only the README may mention it
   npm run benchmark && npm run test:viz && npm run test:arch                                # the guards against adversarial cases; the domain tools
   ```
4. **Create the repository** (public, no template, no auto-generated README or licence), then:
   ```bash
   git init -b main && git add -A
   git update-index --chmod=+x bin/facet          # npm puts bin/ on the PATH; the file must be executable
   git commit -m "feat: facetkit 0.5.0"
   git remote add origin git@github.com:<owner>/facetkit.git && git push -u origin main
   ```
5. **Repository settings on GitHub.**
   - *About*: description and topics below; website = the repository's README or your page.
   - *Security* → enable **private vulnerability reporting** (SECURITY.md points to it), secret scanning and push protection.
   - *Actions* → allow; the `ci` workflow runs tests and the audit on Node 20 and 22.
   - *Discussions* → on (field reports and trial results need a home).
   - *Social preview*: export `docs/assets/flow.svg` to a 1280×640 PNG and upload it.

**Description (EN):** Evidence-first engineering for teams of AI agents — composable skill facets, measuring tools, and one journal from which state, cost and the trust in a result are computed.

**Opis (PL):** Inżynieria oparta na dowodach dla zespołów agentów AI — składane umiejętności, narzędzia, które mierzą, i jeden dziennik, z którego wylicza się stan pracy, koszt i zaufanie do wyniku.

**Topics:** `ai-agents` `claude-code` `claude-code-plugin` `agent-skills` `tdd` `mutation-testing` `spec-driven-development` `llm-evaluation` `ai-governance` `developer-tools`

## Every release

```bash
npm test                                   # the library (Python and Go probes run when the toolchains are present)
npm run audit                              # the skill collection
node bin/facet hypotheses --write HYPOTHESES.md
node bin/facet scan                        # nothing blocking in what changed
npm run build:plugin && claude plugin validate plugin   # the plugin folder (needs Claude Code)
```

1. **Prepare the release in one command:** `npm run release:prepare <version>` (on a branch `release/<version>`). It:
   - writes the version into `package.json` and rebuilds the plugin folder;
   - recounts the READMEs' numbers from their sources (`scripts/counts.mjs`, one source for both READMEs);
   - gathers `changelog.d/` into the dated section of the version in `CHANGELOG.md` (the fragments are removed only after the file was written and read back);
   - runs the release check.

   Run twice, it changes nothing. Pull requests never do these steps: a pull request adds its entry as a fragment in `changelog.d/` (see its README) and leaves `CHANGELOG.md` and the READMEs' numbers alone, so parallel pull requests do not conflict. Review the gathered section, then commit. The plugin directory accepts from an unverified publisher only Markdown, JSON/YAML and images in the submitted folder: submit `plugin/`, never the repository root.
2. If skills changed, re-run the audit against the collections named in the README and commit `AUDIT.md`.
3. If the library changed materially, refresh `docs/dogfood.md` (the commands are in the file).
4. Check before tagging: `node scripts/release-check.mjs v<version>`. The tag, `package.json` and a dated `## [<version>] — YYYY-MM-DD` section of `CHANGELOG.md` must agree; the READMEs' numbers must be the sources'; no fragment may be left in `changelog.d/`. What a pull request only warns about blocks here.
5. Merge to `main`, then tag **the merge commit on `main`** and push the tag: `git fetch origin && git tag v<version> origin/main && git push origin v<version>`. Never tag a local branch that may be behind `main` (the first `v0.7.1` tag pointed at such a commit). `facet init --github` and the guides pin the Action to `v<version>`: until the tag exists, a workflow written by them cannot find the Action.
6. The tag starts `.github/workflows/release.yml`, which publishes to npm and makes the GitHub release. It refuses when:
   - the tag is not on `main`;
   - the tag, `package.json` and `CHANGELOG.md` disagree, the READMEs' numbers drifted, or fragments were not gathered;
   - the version is already on npm (a published version cannot be replaced);
   - tests, the audit, the benchmark or the domain tests fail.

   If it passes, it runs `npm publish --provenance --access public` with the secret `NPM_TOKEN` (an npm *automation* or granular token with publish rights for `facetkit`). Then it creates the GitHub release with the changelog section as its notes, or updates the notes of a release drafted by hand.
7. Claude Code users install with `/plugin marketplace add <owner>/facetkit` and `/plugin install facetkit@facetkit`. Try it yourself on a clean machine after each release.

## Not yet verified (do this before announcing)

- The plugin has not been installed from a marketplace: validate and install it once.
- `action.yml` runs on this repository's own pull requests (`assurance`, `uses: ./`); it has not run from a tag in another repository: open a pull request in a test repository with `uses: <owner>/facetkit@v0.7.1`.
- `npx facetkit` has not been tried from the registry: after publishing, run `npx facetkit demo` in an empty folder.
