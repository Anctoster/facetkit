import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cell, MARKER, postPrComment, renderPrReport } from '../lib/explain-pr.mjs';
import { changeBase, detectTestCommand, resolveItemId, sourceFiles } from '../lib/github-context.mjs';
import { tmp, write } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');
const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf-8' });
// this suite itself runs inside GitHub Actions: the CLI under test must not read the real run's environment
const quiet = (extra = {}) => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GITHUB_') && k !== 'FACET_ITEM'));
    return { ...env, ...extra };
};
const event = (dir, body) => {
    const file = path.join(dir, 'event.json');
    fs.writeFileSync(file, JSON.stringify(body));
    return file;
};

test('item: the flag, else an id in the branch, else in the PR title, else PR-<n>; an unsafe id is refused', () => {
    const dir = tmp();
    assert.equal(resolveItemId('ITEM-7', {}), 'ITEM-7');
    assert.throws(() => resolveItemId('../../etc', {}), /not usable/);
    assert.equal(resolveItemId('', { GITHUB_HEAD_REF: 'feat/p07-login' }), 'P07');
    assert.equal(resolveItemId('', { GITHUB_EVENT_PATH: event(dir, { pull_request: { number: 5, title: 'Fix ABC-12 rounding' } }) }), 'ABC-12');
    assert.equal(resolveItemId('', { GITHUB_EVENT_PATH: event(dir, { pull_request: { number: 5, title: 'no id here' } }) }), 'PR-5');
    assert.equal(resolveItemId(undefined, {}), 'LOCAL-CHECK');
});

test('change: the merge base with the PR target; a shallow checkout gets a clear error, not an empty change', () => {
    const dir = tmp();
    write(dir, 'a.txt', 'a\n');
    git(dir, 'init', '-q');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'one');
    const first = git(dir, 'rev-parse', 'HEAD').stdout.trim();
    git(dir, 'update-ref', 'refs/remotes/origin/main', first);
    write(dir, 'b.txt', 'b\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'two');
    assert.equal(changeBase(dir, { env: { GITHUB_BASE_REF: 'main' } }).ref, first);
    assert.match(changeBase(dir, { env: { GITHUB_BASE_REF: 'develop' } }).error, /fetch-depth: 0/);
    assert.equal(changeBase(dir, { env: {} }).ref, 'HEAD', 'outside CI: the uncommitted changes');
    assert.equal(changeBase(dir, { base: first, env: {} }).ref, first);
    assert.match(changeBase(dir, { base: 'nope', env: {} }).error, /not a commit/);
    assert.equal(changeBase(dir, { env: { GITHUB_ACTIONS: 'true', GITHUB_EVENT_PATH: event(dir, { before: first }) } }).ref, first);
});

test('test command and source files: guessed from what the project has; tests are not mutated', () => {
    const dir = tmp();
    assert.equal(detectTestCommand(dir), null);
    assert.equal(detectTestCommand(dir, ' make check '), 'make check');
    write(dir, 'pyproject.toml', '[project]\nname="x"\n');
    assert.equal(detectTestCommand(dir), 'pytest -q');
    write(dir, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));
    write(dir, 'pnpm-lock.yaml', '');
    assert.equal(detectTestCommand(dir), 'pnpm test');
    for (const f of ['src/a.ts', 'src/a.test.ts', 'tests/b.py', 'pkg/c_test.go', 'src/DTest.java', 'README.md', 'test_e.py']) write(dir, f, 'x\n');
    assert.deepEqual(sourceFiles(dir, ['src/a.ts', 'src/a.test.ts', 'tests/b.py', 'pkg/c_test.go', 'src/DTest.java', 'README.md', 'test_e.py', 'gone.js']), ['src/a.ts']);
});

test('report: output of a command cannot break the table or open HTML; stateless says what it is not', () => {
    assert.equal(cell('a | b `c` <img>\nnext'), "a \\| b 'c' &lt;img&gt; next");
    assert.equal(cell('x'.repeat(300)).length, 160);
    const md = renderPrReport({ itemId: 'P07', level: 'L2', minLevel: 'L2', passed: true, mode: 'stateless', checks: { scan: { status: 'PASS', details: 'scan: 1 file' }, tests: { status: 'PASS', details: 'npm test | passed' } } });
    assert.ok(md.startsWith(MARKER));
    assert.match(md, /npm test \\\| passed/);
    assert.match(md, /not a proof pack/);
    assert.doesNotMatch(md, /Witness/);
});

test('comment: one comment per PR on the REST API, updated in place; no PR means no request', async () => {
    const dir = tmp();
    const calls = [];
    const fake = (existing) => async (url, options = {}) => {
        calls.push({ url, method: options.method ?? 'GET' });
        if (!options.method) return { ok: true, json: async () => existing };
        return { ok: true, json: async () => ({}) };
    };
    const env = { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_EVENT_PATH: event(dir, { pull_request: { number: 5 } }) };
    assert.equal(await postPrComment(`${MARKER}\nbody`, { env, fetchImpl: fake([]) }), true);
    assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), ['GET https://api.github.com/repos/o/r/issues/5/comments?per_page=100', 'POST https://api.github.com/repos/o/r/issues/5/comments']);
    calls.length = 0;
    await postPrComment(`${MARKER}\nbody`, { env, fetchImpl: fake([{ id: 9, body: 'other' }, { id: 11, body: `${MARKER}\nold` }]) });
    assert.equal(`${calls[1].method} ${calls[1].url}`, 'PATCH https://api.github.com/repos/o/r/issues/comments/11');
    const denied = async (url, options = {}) => (options.method ? { ok: false, status: 403, text: async () => '' } : { ok: true, json: async () => [] });
    await assert.rejects(postPrComment('x', { env, fetchImpl: denied }), /pull-requests: write/);
    assert.equal(await postPrComment('x', { env: { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' }, fetchImpl: () => assert.fail('no request') }), false);
});

/** A tiny project with a price function, its test, and one commit to compare against. */
function project(testBody) {
    const dir = tmp('facetkit-ci-');
    write(dir, 'src/price.mjs', 'export const total = (a, b) => a + b;\n');
    write(dir, 'test/price.test.mjs', `import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { total } from '../src/price.mjs';\ntest('total', () => { ${testBody} });\n`);
    git(dir, 'init', '-q');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'base');
    const base = git(dir, 'rev-parse', 'HEAD').stdout.trim();
    write(dir, 'src/price.mjs', 'export const total = (a, b) => a * b;\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'change');
    return { dir, base };
}
const verify = (dir, base, extra = []) => {
    const out = path.join(dir, 'gh-output.txt');
    const r = spawnSync(process.execPath, [CLI, 'ci-verify', '--base', base, '--item', 'T-1', '--test-cmd', `"${process.execPath}" --test test/price.test.mjs`, ...extra], { cwd: dir, encoding: 'utf-8', env: quiet({ GITHUB_OUTPUT: out }) });
    return { ...r, report: JSON.parse(fs.readFileSync(path.join(dir, 'facetkit-report.json'), 'utf-8')), output: fs.existsSync(out) ? fs.readFileSync(out, 'utf-8') : '' };
};

test('ci-verify, stateless: a test that notices the change reaches L3; a weak one stops at L2; a red one fails', () => {
    const strong = project('assert.equal(total(2, 3), 6);');
    const s = verify(strong.dir, strong.base, ['--min-level', 'L3']);
    assert.equal(s.status, 0, s.stdout + s.stderr);
    assert.equal(s.report.mode, 'stateless');
    assert.equal(s.report.level, 'L3');
    assert.deepEqual(s.report.changed, ['src/price.mjs']);
    assert.match(s.output, /level=L3\npassed=true/);
    assert.match(s.stdout, /FacetKit — level \*\*L3\*\*/);

    const weak = project("assert.equal(typeof total(2, 3), 'number');");
    const w = verify(weak.dir, weak.base, ['--min-level', 'L3']);
    assert.equal(w.status, 1);
    assert.equal(w.report.level, 'L2');
    assert.equal(w.report.checks.mutate.status, 'WARN');

    const red = project('assert.equal(total(2, 3), 5);');
    const r = verify(red.dir, red.base, ['--min-level', 'L1']);
    assert.equal(r.status, 1);
    assert.equal(r.report.checks.tests.status, 'FAIL');
    assert.equal(r.report.level, 'L0');
});

test('ci-verify: with the item in the project journal the level comes from the journal, not from this run', () => {
    const { dir, base } = project('assert.equal(total(2, 3), 6);');
    const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf-8', env: quiet() });
    assert.equal(cli('init', '--minimal').status, 0);
    assert.equal(cli('flow', 'open', 'ITEM-1').status, 0);
    const v = spawnSync(process.execPath, [CLI, 'ci-verify', '--base', base, '--item', 'ITEM-1', '--min-level', 'L0'], { cwd: dir, encoding: 'utf-8', env: quiet() });
    const report = JSON.parse(fs.readFileSync(path.join(dir, 'facetkit-report.json'), 'utf-8'));
    assert.equal(report.mode, 'journal', v.stdout + v.stderr);
    assert.equal(report.checks.journal.status, 'PASS');
    assert.equal(report.level, 'L0', 'an item with no verdict proves nothing yet');
    assert.equal(report.checks.proof.status, 'SKIPPED');
    assert.equal(v.status, 0);
    const strict = spawnSync(process.execPath, [CLI, 'ci-verify', '--base', base, '--item', 'ITEM-1'], { cwd: dir, encoding: 'utf-8', env: quiet() });
    assert.equal(strict.status, 1, 'L0 does not meet the default L2');
});

test('ci-verify: the mutant count and the time limit must be whole numbers', () => {
    const r = spawnSync(process.execPath, [CLI, 'ci-verify', '--max', 'abc'], { cwd: tmp(), encoding: 'utf-8', env: quiet() });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--max must be a whole number/);
});

test('ci-verify: a change without source code says the mutation probe is not needed, and passes at L2', () => {
    const dir = tmp('facetkit-ci-');
    write(dir, 'src/price.mjs', 'export const total = (a, b) => a + b;\n');
    write(dir, 'test/price.test.mjs', "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { total } from '../src/price.mjs';\ntest('total', () => assert.equal(total(2, 3), 5));\n");
    git(dir, 'init', '-q');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'base');
    const base = git(dir, 'rev-parse', 'HEAD').stdout.trim();
    write(dir, 'README.md', '# docs only\n');
    const v = verify(dir, base);
    assert.equal(v.status, 0, v.stdout + v.stderr);
    assert.equal(v.report.level, 'L2');
    assert.equal(v.report.checks.mutate.status, 'NOT-NEEDED');
    assert.match(v.stdout, /Mutation probe \| ➖ not needed \| the change touches no source code/);
});
