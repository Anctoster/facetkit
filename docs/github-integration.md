# GitHub integration

[🇬🇧 English] | [🇵🇱 Polski](github-integration.pl.md) · Before: [Quick start](quick-start.md) → [Project integration](project-integration.md)

The FacetKit Action checks every pull request and keeps one comment on it up to date:

> ### ✅ FacetKit — level **L3** (required: L2)
> | Check | Result | Details |
> | :--- | :--- | :--- |
> | Security scan | ✅ PASS | scan: 4 changed file(s) · 0 finding(s) · 0 blocking |
> | Tests | ✅ PASS | npm test passed |
> | Mutation probe | ✅ PASS | 90 % of mutants noticed (9/10) |

It needs no configuration in your project, and it works whether or not you use the agents.

## Set it up

```bash
facet init --github        # writes .github/workflows/facetkit.yml, and nothing else
```

or write the file yourself:

```yaml
name: facetkit
on:
  pull_request:
permissions:
  contents: read
  pull-requests: write          # for the comment; without it the report is still in the job summary
jobs:
  assurance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0        # required: the change is measured from where the PR leaves its target branch
      - uses: actions/setup-node@v4       # your toolchain and dependencies, so that the tests can run
        with:
          node-version: 22
      - run: npm ci
      - uses: Anctoster/facetkit@v0.7.1   # pin a release or a commit SHA
        with:
          min-level: L2
```

Commit it and open a pull request. To make it a merge condition: **Settings → Branches → branch protection → Require status checks → `assurance`**.

## Inputs and outputs

| Input | Default | |
|---|---|---|
| `min-level` | `L2` | the lowest level that passes |
| `test-command` | guessed | from `package.json` (npm, pnpm, yarn, bun), `pyproject.toml` / `pytest.ini` / `setup.cfg` / `tox.ini` (pytest), `go.mod`, `pom.xml`, `gradlew` |
| `item-id` | from the branch | an id like `ABC-12` or `ITEM-3` in the branch name, then in the PR title, else `PR-<number>` |
| `comment` | `true` | write the report as a PR comment |
| `node-version` | `22` | Node.js for FacetKit itself |

Outputs: `level` (`L0`–`L4`) and `passed` (`true`/`false`). The full result is uploaded as the artifact `facetkit-report` (`facetkit-report.json`) and shown in the job summary.

## What the level means

**Stateless** — the usual case, and the only one when you do not use the agents:

| Level | The run saw |
|---|---|
| L1 | a clean security scan of the change (no secret, forbidden file, dangerous command or injected instruction) |
| L2 | the tests pass |
| L3 | at least 80 % of deliberate breakages of the changed lines were noticed by the tests |

This level describes one CI run. It is not signed and it is not a proof pack.

**Journal** — when the item of the PR is in the project journal (you use the agents and commit `.facet/`): the level is the one the journal proves (verdict, independence, checks, mutation, waivers — see [Governance](governance.md)), after `facet journal` has verified the journal and `facet proof verify` the proof pack, if the item has one. The run itself does not raise it.

A check that fails makes the run fail whatever the level. A scan that could not read a file (binary, too large) is a warning, not a pass of that file.

## Choosing the level

- **Start with `L2`**: the scan and the tests. Nothing changes for your team except a comment.
- **Move to `L3`** when the comment shows mostly noticed mutants. Every `survived` line in the report is a missing assertion.
- With the agents, require what your policy requires (`govern.required` in `facet.json`).

## Good to know

- **Forks.** Use the `pull_request` event, never `pull_request_target`: the PR's code runs in this job. On a PR from a fork the token cannot write comments — the run says so and still passes or fails on its own merits.
- **Time.** The mutation probe runs the tests once per mutant (10 by default, on the changed lines only). Keep the test command fast, or point `test-command` at the relevant tests.
- **Secrets.** The tests run with only a basic set of environment variables (paths, locale, toolchains); the GitHub token is never passed to them. A test that needs a variable gets it through `govern.env` in `facet.json`.
- **Monorepos.** The Action checks the repository root. For a package in a subfolder, run `npx facetkit ci-verify` in a `run:` step with `working-directory:`.
- **Locally.** `facet ci-verify --base main` gives the same report before you push.

## Without the Action

Any CI can run the same check:

```bash
git fetch origin main                              # with full history (no --depth)
npx --yes facetkit ci-verify --base "$(git merge-base origin/main HEAD)" --min-level L2 --test-cmd "npm test"
```

It exits 0 when the level is reached and no check failed, writes `facetkit-report.json`, and prints the report as Markdown.
