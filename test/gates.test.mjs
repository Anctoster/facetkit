// Plan 2.10: gates against work declared done without being done — one refusal per gate.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkFileChanges, criteriaStatus, placeholderLines, receiptProblems } from '../lib/handoff.mjs';
import { gitInit, tmp, write } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');

test('H1: an OK without a receipt, or measured by another command than the registered one, is refused', () => {
    const c = [{ id: 'A1', check: 'unit', by: 'build' }, { id: 'A2', check: '[user]', by: 'build' }, { id: 'A3', check: 'scan', by: 'build' }];
    const hash = (s) => `h(${s})`;
    assert.deepEqual(receiptProblems(c, { unit: { ok: true, receipt: { cmd: 'h(npm test)' } }, scan: { ok: true } }, { commands: { unit: 'npm test' }, builtin: ['scan'], hash }), []);
    assert.match(receiptProblems(c, { unit: { ok: true } }, { hash })[0].what, /A1: the OK of unit has no receipt/);
    assert.match(receiptProblems(c, { unit: { ok: true, receipt: { cmd: 'h(true)' } } }, { commands: { unit: 'npm test' }, hash })[0].what, /another command than the registered one/);
});

test('H2: a change to tests, check scripts, thresholds or the policy is named', () => {
    assert.deepEqual(checkFileChanges(['src/a.mjs', 'test/a.test.mjs', 'lib/b.spec.ts', 'scripts/checks/x.sh', 'facet.json', 'py/test_a.py', 'domains/arch/x/domain.json', 'README.md']), ['test/a.test.mjs', 'lib/b.spec.ts', 'scripts/checks/x.sh', 'facet.json', 'py/test_a.py', 'domains/arch/x/domain.json']);
});

test('H4: TODO, FIXME, not implemented, an empty body are placeholders; ordinary code is not', () => {
    const found = placeholderLines({ 'a.mjs': ['const x = 1;', '// TODO later', 'export function f() {}', "throw new Error('not implemented');", 'const ok = todos.length;'], 'b.py': ['    pass', 'raise NotImplementedError', 'x = 2'] });
    assert.deepEqual(found.map((f) => `${f.file}:${f.line}`), ['a.mjs:2', 'a.mjs:3', 'a.mjs:4', 'b.py:1', 'b.py:2']);
});

test('H9: every criterion of the step with done | blocked | partial, and a reason for the last two', () => {
    const text = '## Criteria\n- A1: done\n- A2: blocked — the API key is missing\n- `A3` — partial\n';
    const r = criteriaStatus(text, ['A1', 'A2', 'A3', 'A4']);
    assert.deepEqual(r.found.A2, { status: 'blocked', reason: 'the API key is missing' });
    assert.deepEqual(r.problems.map((p) => p.what), ['criterion A3 is partial', 'criterion A4']);
});

test('cli: flow end refuses a build that changed a test (H2), left a TODO (H4), or names no status (H9); a person lifts H2', () => {
    const root = tmp();
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal', govern: { checks: { unit: 'node -e 0' } } }));
    write(root, 'facet.items.json', '{}');
    write(root, '.gitignore', '.facet/\n.work/\n');
    write(root, 'src/a.mjs', 'export const a = 1;\n');
    write(root, 'test/a.test.mjs', '// the test\n');
    gitInit(root);
    const f = (...a) => spawnSync(process.execPath, [CLI, ...a], { cwd: root, encoding: 'utf-8', env: { ...process.env, FACET_WRITER: 'ann' } });
    f('flow', 'open', 'A', '--route', '', '--force');
    write(root, '.work/A/order.md', `# A\n## Done when\n\`\`\`criteria\n${JSON.stringify([{ id: 'C1', text: 'a is 2', check: 'unit', by: 'build' }])}\n\`\`\`\n`);
    f('criteria', 'approve', '--item', 'A', '--by', 'ann');
    for (const s of ['open', 'map', 'red']) {
        f('flow', 'start', s);
        f('flow', 'end', s, '--status', 'DONE', '--force');
    }
    f('flow', 'start', 'build', '--snapshot');
    write(root, '.work/A/echo.json', JSON.stringify({ step: 'build', criteria: [{ id: 'C1', value: 'a is 2', action: 'set it', check: 'unit' }], fixed: [] }));
    f('echo', 'check', 'build', '--item', 'A');
    write(root, 'src/a.mjs', 'export const a = 2; // TODO tidy\n');
    write(root, 'test/a.test.mjs', '// the test, weakened\n');
    assert.equal(f('check', 'unit', '--item', 'A').status, 0);
    const handoff = (extra) => `# A — build report\n## Slices\n| Slice | Result | Evidence |\n|---|---|---|\n| a | green | unit |\n## Numbers\n1 → 2\n## Outside the map\n- none\n## Not verified\n- none\n## Commit message\nfix: a\n## Evidence\n$ node -e 0 → exit 0\n## Files changed\n- src/a.mjs\n- test/a.test.mjs\n${extra}`;
    write(root, '.work/A/build.md', handoff(''));
    const r = f('flow', 'end', 'build', '--status', 'DONE');
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /H2 build changed the checks it is judged by: test\/a\.test\.mjs/);
    assert.match(r.stderr, /H4 src\/a\.mjs: "export const a = 2; \/\/ TODO tidy"/);
    assert.match(r.stderr, /H9 criterion C1/);
    write(root, 'src/a.mjs', 'export const a = 2;\n');
    write(root, '.work/A/build.md', handoff('- C1: done\n'));
    assert.equal(f('approve', 'check-files:build', '--item', 'A', '--by', 'lead', '--note', 'the test named the old value').status, 0);
    const ok = f('flow', 'end', 'build', '--status', 'DONE');
    assert.doesNotMatch(ok.stderr, /\bH[1249]\b/, ok.stderr);
});
