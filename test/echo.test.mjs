// Plan 2.9: the echo of understanding — U1–U4, the gate at the end of a step, two failures send the brief back.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { qualityLoop } from '../lib/board.mjs';
import { checkEcho, fixedOf, literals } from '../lib/echo.mjs';
import { readJournal } from '../lib/journal.mjs';
import { tmp, write } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');
const criteria = [
    { id: 'A1', text: 'External walls are 25 см thick on "Level 1"', check: 'spec_compare', by: 'build' },
    { id: 'A2', text: 'junction.step <= 0.05 along the seam', check: 'junction.step <= 0.05', by: 'build' },
    { id: 'A3', text: 'The client likes the colour', check: '[user]', by: 'proof' },
];
const fixed = ['The designed buildings and the site terrain.', 'Cameras.'];
const good = { step: 'build', criteria: [{ id: 'A1', value: 'external walls 25 см on "Level 1"', action: 'set wall type', check: 'spec_compare' }, { id: 'A2', value: 'junction.step at most 0.05', action: 'blend seam', check: 'junction.step' }], fixed: ['the designed buildings and the site terrain', 'cameras'], unknown: [] };

test('literals: numbers with units, quoted words and identifiers, as written', () => {
    assert.deepEqual(literals('Wall 25 cm on "Level 1"; junction.step <= 0.05, CAM_aerial_N, D1-02, 300 m'), ['Level 1', '25 cm', '0.05', '300 m', 'junction.step', 'CAM_aerial_N', 'D1-02']);
    assert.deepEqual(fixedOf('# B\n## Fixed\nThe buildings.\n- Cameras\n## Views\nx\n'), ['The buildings.', 'Cameras']);
    assert.deepEqual(fixedOf('## Fixed\nnone\n'), []);
});

test('U1–U3 pass: every criterion of the step, its values as written, every Fixed line', () => {
    const r = checkEcho(good, { step: 'build', criteria, fixed });
    assert.equal(r.ok, true, JSON.stringify(r.problems));
    assert.deepEqual([r.u1, r.u2, r.u3, r.u4], [1, 1, 1, 0]);
});

test('an echo without one criterion is refused (U1)', () => {
    const r = checkEcho({ ...good, criteria: good.criteria.slice(0, 1) }, { step: 'build', criteria, fixed });
    assert.equal(r.ok, false);
    assert.match(r.problems[0].why, /criterion A2 of this step is not in the echo/);
});

test('an echo with "20 см" where the brief says "25 см" is refused (U2)', () => {
    const wrong = { ...good, criteria: [{ ...good.criteria[0], value: 'external walls 20 см on "Level 1"' }, good.criteria[1]] };
    const r = checkEcho(wrong, { step: 'build', criteria, fixed });
    assert.equal(r.ok, false);
    assert.match(r.problems.find((p) => p.u === 'U2').why, /the brief says "25 см"/);
    assert.equal(checkEcho({ ...good, criteria: [{ ...good.criteria[0], value: 'external walls 25см on "Level 1"' }, good.criteria[1]] }, { step: 'build', criteria, fixed }).ok, true, 'a space between number and unit is not a different value');
});

test('a Fixed line not named is refused (U3); a criterion the brief does not have is a question, not a refusal (U4)', () => {
    assert.match(checkEcho({ ...good, fixed: ['cameras'] }, { step: 'build', criteria, fixed }).problems[0].why, /Fixed: "The designed buildings/);
    const extra = checkEcho({ ...good, criteria: [...good.criteria, { id: 'Z1', value: 'also repaint', action: 'x', check: 'y' }] }, { step: 'build', criteria, fixed });
    assert.deepEqual([extra.ok, extra.u4, extra.problems.at(-1).u], [true, 1, 'U4']);
});

test('cli: a step that owns criteria does not end without a passing echo; two failures send the brief back, charged to the brief', () => {
    const root = tmp();
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal', govern: { checks: { spec_compare: 'node -e 0', 'junction.step': 'node -e 0' } } }));
    write(root, 'facet.items.json', '{}');
    const f = (...a) => spawnSync(process.execPath, [CLI, ...a], { cwd: root, encoding: 'utf-8', env: { ...process.env, FACET_WRITER: 'ann' } });
    f('flow', 'open', 'A', '--route', '', '--force');
    write(root, '.work/A/order.md', `# A\n## Done when\n\`\`\`criteria\n${JSON.stringify(criteria)}\n\`\`\`\n## Fixed\n${fixed.join('\n')}\n`);
    assert.equal(f('criteria', 'approve', '--item', 'A', '--by', 'ann').status, 0);
    for (const s of ['open', 'map', 'red']) {
        f('flow', 'start', s);
        f('flow', 'end', s, '--status', 'DONE', '--force');
    }
    f('flow', 'start', 'build');
    const blocked = f('flow', 'end', 'build', '--status', 'DONE');
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /build owns criteria A1, A2 and has no echo that passed/);
    write(root, '.work/A/echo.json', JSON.stringify({ ...good, criteria: good.criteria.slice(0, 1) }));
    assert.equal(f('echo', 'check', 'build', '--item', 'A').status, 1);
    const second = f('echo', 'check', 'build', '--item', 'A');
    assert.match(second.stderr, /two failed echoes in a row — the brief cannot be read/);
    const o = readJournal(path.join(root, '.facet', 'journal')).filter((e) => e.kind === 'origin').at(-1);
    assert.deepEqual([o.cause, o.charged, o.step, o.criterion], ['brief-unreadable', false, 'open', 'A2']);
    write(root, '.work/A/echo.json', JSON.stringify(good));
    assert.equal(f('echo', 'check', 'build', '--item', 'A').status, 0);
    assert.equal(f('flow', 'end', 'build', '--status', 'DONE', '--force').status, 0);
    assert.equal(readJournal(path.join(root, '.facet', 'journal')).filter((e) => e.kind === 'echo').length, 3);
});

test('board: U6 questions after the work began, U7 silent assumptions, U8 returns that were the brief\'s', () => {
    const ev = [
        { kind: 'item.open', item: 'A', steps: [{ id: 'order' }, { id: 'work' }, { id: 'proof', verdict: true }] },
        { kind: 'step.start', item: 'A', step: 'work' },
        { kind: 'step.end', item: 'A', step: 'work', status: 'NEEDS-USER' },
        { kind: 'step.end', item: 'A', step: 'order', status: 'NEEDS-USER' },
        { kind: 'verdict', item: 'A', verdict: 'REWORK', fixes: [{ agent: 'b', mode: 'unasked-assumption' }, { agent: 'c', mode: 'spec-gap' }] },
        { kind: 'origin', item: 'A', from: 'return', cause: 'brief-unreadable' },
    ];
    const q = qualityLoop(ev);
    assert.deepEqual([q.U6.value, q.U7.value, q.U8.value], [1, 0.5, 1]);
});
