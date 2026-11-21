// github-context: what a CI run is about — which item, which change, which test command.
// Everything here reads the environment GitHub Actions sets; outside CI the same functions give local answers.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SAFE_ITEM } from './shell.mjs';

const ITEM_IN_TEXT = /\b([A-Z]+-\d+|P\d+|ITEM-\d+)\b/i;
const ZERO_SHA = /^0+$/;

const readEvent = (env) => {
    const file = env.GITHUB_EVENT_PATH;
    if (!file || !fs.existsSync(file)) return {};
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
        return {};
    }
};

/** The item a run is about: the --item flag, else an id in the branch name, else one in the PR title, else PR-<n>. */
export function resolveItemId(flagItem, env = process.env) {
    const given = String(flagItem ?? '').trim();
    if (given) {
        // the id becomes a file name and a command-line argument: refuse anything that could leave its folder
        if (!SAFE_ITEM.test(given)) throw new Error(`the item id ${JSON.stringify(given)} is not usable: letters, digits, ".", "_" and "-" only`);
        return given;
    }
    const branch = (env.GITHUB_HEAD_REF || '').match(ITEM_IN_TEXT);
    if (branch) return branch[1].toUpperCase();
    const pr = readEvent(env).pull_request;
    const title = (pr?.title || '').match(ITEM_IN_TEXT);
    if (title) return title[1].toUpperCase();
    if (pr?.number) return `PR-${pr.number}`;
    return 'LOCAL-CHECK';
}

const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf-8' });
const commitExists = (cwd, ref) => git(cwd, 'cat-file', '-e', `${ref}^{commit}`).status === 0;

/** The commit the change starts from: the merge base with the PR's target, the commit before a push,
 *  or --base. Outside CI with no --base: HEAD, i.e. the uncommitted changes. */
export function changeBase(cwd, { base, env = process.env } = {}) {
    if (base) return commitExists(cwd, base) ? { ref: base, how: `--base ${base}` } : { error: `--base ${base} is not a commit here` };
    if (env.GITHUB_BASE_REF) {
        const target = `origin/${env.GITHUB_BASE_REF}`;
        const mb = git(cwd, 'merge-base', target, 'HEAD');
        if (mb.status === 0 && mb.stdout.trim()) return { ref: mb.stdout.trim(), how: `merge base with ${target}` };
        return { error: `cannot find where this PR leaves ${target} — check out with full history (actions/checkout with fetch-depth: 0)` };
    }
    if (env.GITHUB_ACTIONS === 'true') {
        const before = readEvent(env).before;
        if (before && !ZERO_SHA.test(before)) {
            if (commitExists(cwd, before)) return { ref: before, how: 'the commit before this push' };
            return { error: 'the commit before this push is not in the checkout — use actions/checkout with fetch-depth: 0' };
        }
        if (commitExists(cwd, 'HEAD~1')) return { ref: 'HEAD~1', how: 'the previous commit' };
        return { error: 'no earlier commit in the checkout — use actions/checkout with fetch-depth: 0' };
    }
    return { ref: 'HEAD', how: 'uncommitted changes' };
}

/** Files changed since `ref`: tracked changes and new untracked files. */
export function changedFiles(cwd, ref) {
    const tracked = git(cwd, 'diff', '--name-only', '--diff-filter=d', ref).stdout ?? '';
    const untracked = git(cwd, 'ls-files', '--others', '--exclude-standard').stdout ?? '';
    return [...new Set(`${tracked}\n${untracked}`.split('\n').map((f) => f.trim()).filter(Boolean))].sort();
}

const SOURCE = /\.(js|mjs|cjs|jsx|ts|tsx|py|go|java)$/;
const TEST = /(^|\/)(tests?|__tests__|spec|e2e)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py)$|(^|\/)test_[^/]*\.py$|Test\.java$/;

/** Changed files that are source code (not tests) and still exist. */
export function sourceFiles(cwd, files) {
    return files.filter((f) => SOURCE.test(f) && !TEST.test(f) && fs.existsSync(path.join(cwd, f)));
}

/** The project's test command: given explicitly, or guessed from the files a project usually has. */
export function detectTestCommand(cwd, explicit = '') {
    if (String(explicit).trim()) return String(explicit).trim();
    const has = (f) => fs.existsSync(path.join(cwd, f));
    if (has('package.json')) {
        try {
            const script = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')).scripts?.test ?? '';
            if (script && !script.includes('no test specified')) {
                if (has('pnpm-lock.yaml')) return 'pnpm test';
                if (has('yarn.lock')) return 'yarn test';
                if (has('bun.lockb') || has('bun.lock')) return 'bun test';
                return 'npm test';
            }
        } catch {
            // a broken package.json: fall through to the other guesses
        }
    }
    if (['pytest.ini', 'pyproject.toml', 'setup.cfg', 'tox.ini'].some(has)) return 'pytest -q';
    if (has('go.mod')) return 'go test ./...';
    if (has('pom.xml')) return 'mvn -q test';
    if (has('gradlew') && (has('build.gradle') || has('build.gradle.kts'))) return './gradlew test';
    return null;
}

/** The number of the pull request this run belongs to, or null. */
export function pullRequestNumber(env = process.env) {
    return readEvent(env).pull_request?.number ?? null;
}
