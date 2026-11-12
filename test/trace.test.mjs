import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseClauses, parseRefs, renderTrace, trace } from '../lib/trace.mjs';
import { tmp, write } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');
const SPEC = `# Reservation

- R1: a free flat can be reserved — example: flat 12, 24 h (verify: test)
- **R2**: a reserved flat is refused with 409 (verify: test)
| R3 | the bundle stays under 300 kB | (verify: measure) |
- R4: the legal text is approved by a lawyer (verify: manual)
- R5: expired reservations are released

\`\`\`
- R9: inside a code block, not a clause
\`\`\`
Some prose mentioning R7 in the middle of a line.
`;

test('clauses: ids, methods and text are read; code blocks and prose are not', () => {
    const c = parseClauses(SPEC);
    assert.deepEqual(c.map((x) => x.id), ['R1', 'R2', 'R3', 'R4', 'R5']);
    assert.deepEqual(c.map((x) => x.method), ['test', 'test', 'measure', 'manual', null]);
    assert.equal(c[1].text, 'a reserved flat is refused with 409');
    assert.equal(c[2].text, 'the bundle stays under 300 kB');
});

test('refs: bracket and tag forms are found, plain words are not', () => {
    const refs = parseRefs("test('[R1] reserves', () => {});\n// see R2 in the spec\n@P07-R3 @smoke\n");
    assert.deepEqual([...refs.keys()], ['R1', 'P07-R3']);
});

test('trace: uncovered, orphan, unplanned, unclaimed and by-hand clauses are told apart', () => {
    const root = tmp();
    write(root, 'spec.md', SPEC);
    write(root, 'tests/reserve.test.mjs', "test('[R1] reserves a free flat', () => {});\ntest('[R8] something nobody asked for', () => {});\n");
    write(root, 'tests/other.test.mjs', "test('adds numbers', () => {});\n");
    write(root, 'tests/helper.mjs', '// [R2] not a test file\n');
    const r = trace(root, { spec: ['spec.md'], tests: ['tests'] });
    assert.deepEqual(Object.keys(r.claims), ['R1']);
    assert.deepEqual(r.uncovered.map((c) => c.id), ['R2', 'R3', 'R5']);
    assert.deepEqual(r.orphans.map((o) => o.id), ['R8']);
    assert.deepEqual(r.unplanned.map((c) => c.id), ['R5']);
    assert.deepEqual(r.byHand.map((c) => c.id), ['R4']);
    assert.deepEqual(r.unclaimed, ['tests/other.test.mjs']);
    const text = renderTrace(r);
    assert.match(text, /UNCOVERED R2/);
    assert.match(text, /ORPHAN +R8/);
    assert.doesNotMatch(renderTrace(r, { plan: true }), /UNCOVERED/);
});

test('trace: ids of another family are not reported as orphans', () => {
    const root = tmp();
    write(root, 'spec.md', '- R1: one thing (verify: test)\n');
    write(root, 'tests/a.test.mjs', "test('[R1] one thing [ADR-7]', () => {});\n");
    const r = trace(root, { spec: ['spec.md'], tests: ['tests'] });
    assert.equal(r.orphans.length, 0);
    assert.equal(r.uncovered.length, 0);
});

test('cli: --plan fails until every clause has a method, the full trace fails until every clause is claimed', () => {
    const root = tmp();
    write(root, 'spec.md', '- R1: one thing (verify: test)\n- R2: another thing\n');
    write(root, 'tests/a.test.mjs', "test('[R1] one thing', () => {});\n");
    const run = (...args) => spawnSync('node', [CLI, 'trace', '--spec', 'spec.md', '--tests', 'tests', ...args], { cwd: root, encoding: 'utf-8' });
    assert.equal(run('--plan').status, 1);
    write(root, 'spec.md', '- R1: one thing (verify: test)\n- R2: another thing (verify: test)\n');
    assert.equal(run('--plan').status, 0);
    assert.equal(run().status, 1);
    write(root, 'tests/b.test.mjs', "test('[R2] another thing', () => {});\n");
    const ok = run();
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /clauses 2 · claimed by a test 2 · uncovered 0/);
});

test('cli: render writes one file per role and phase and --check notices a stale one', () => {
    const root = tmp();
    const run = (...args) => spawnSync('node', [CLI, 'render', '--dir', 'out', ...args], { cwd: root, encoding: 'utf-8' });
    assert.equal(run().status, 0);
    assert.equal(run('--check').status, 0);
    write(root, 'out/slice-builder.build.md', 'edited by hand\n');
    assert.equal(run('--check').status, 1);
});
