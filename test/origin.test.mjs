// Plan 2.8, steps 3–6: the source step of a finding, the charge, and K1–K5.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { qualityLoop } from '../lib/board.mjs';
import { readJournal } from '../lib/journal.mjs';
import { chainBreak, delayOf, findOrigin, measuredSource } from '../lib/origin.mjs';
import { buildTrustGraph } from '../lib/trustgraph.mjs';
import { gitInit, story, tmp, write } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');
const states = (...oks) => oks.map((ok, i) => ({ step: `s${i + 1}`, check: async () => ok }));

test('measured: three steps, the second breaks what the first made → regression at step 2', async () => {
    assert.deepEqual(await measuredSource(states(true, false, false)), { step: 's2', cause: 'regression', runs: 3 });
    assert.equal((await measuredSource(states(true, true, true, true, false))).step, 's5');
    assert.equal((await measuredSource(states(false, true, true, false, false, false, false, false))).step, 's4', 'met after s2, broken by s4 — found by bisection');
    assert.deepEqual(await measuredSource(states(false, false, false)), { step: 's1', cause: 'not-done', runs: 3 }, 'never met: the by step did not do it');
    assert.equal((await measuredSource(states(true, true))).cause, 'holds');
    assert.equal(await measuredSource(states(true, null, false)), null, 'a check that cannot run measures nothing');
});

test('chain: 25 → 20 → 20 — the source is the step that produced the first differing link', async () => {
    const values = { drawing: 25, spec: 20, model: 20 };
    const links = [{ name: 'drawing', step: null }, { name: 'spec', step: 'read' }, { name: 'model', step: 'build' }];
    assert.deepEqual(await chainBreak(links, async (a, b) => values[a.name] === values[b.name]), { link: 'spec', after: 'drawing', step: 'read' });
    assert.equal(await chainBreak(links, async (a, b) => (a.name === 'drawing' ? null : values[a.name] === values[b.name])), null, 'a human link is skipped');
});

test('findOrigin: no criterion → the brief, nobody charged; chain before snapshots; else judged', async () => {
    const steps = ['order', 'read', 'build', 'proof'];
    const none = await findOrigin({ steps, criterion: null, briefStep: 'order' });
    assert.deepEqual([none.step, none.method, none.cause, none.charged], ['order', 'human', 'brief', false]);
    const criterion = { id: 'A1', check: 'unit', by: 'build', chain: ['drawing', 'spec', 'model'] };
    const links = [{ name: 'drawing', step: null }, { name: 'spec', step: 'read' }, { name: 'model', step: 'build' }];
    const chain = await findOrigin({ steps, criterion, briefStep: 'order', links, compare: async (a) => a.name !== 'drawing', states: states(true, false) });
    assert.deepEqual([chain.method, chain.step], ['chain', 'read']);
    const judged = await findOrigin({ steps, criterion, briefStep: 'order', judgedStep: 'proof' });
    assert.deepEqual([judged.method, judged.step], ['judged', 'proof']);
    assert.equal(delayOf(steps, 'read', 'proof'), 2);
    assert.equal(delayOf(steps, 'build', null), 2, 'found after acceptance: after the last step');
});

function judgedItem(origins = [], extra = []) {
    const s = story();
    s.open('A', [{ id: 'read', agent: 'reader', phase: 'build' }, { id: 'build', agent: 'builder', phase: 'build' }, { id: 'check', agent: 'checker', phase: 'proof', verdict: true }, { id: 'proof', agent: 'inspector', phase: 'proof', verdict: true }]);
    for (const [step, agent] of [['read', 'reader'], ['build', 'builder'], ['check', 'checker'], ['proof', 'inspector']]) {
        s.say({ kind: 'step.start', item: 'A', step, agent, model: 'm' });
        s.say({ kind: 'step.end', item: 'A', step, agent, status: 'DONE' });
    }
    s.say({ kind: 'verdict', item: 'A', verdict: 'REWORK', fixes: [{ agent: 'builder' }] });
    for (const o of origins) s.say({ kind: 'origin', item: 'A', ...o });
    for (const e of extra) s.say(e);
    s.say({ kind: 'verdict', item: 'A', verdict: 'PASS', fixes: [] });
    s.say({ kind: 'item.close', item: 'A' });
    return s.events;
}

test('charge: the source step 1, each judge in between 0.5; without origins the verdict\'s fixes; a tool defect goes to the tool', () => {
    const node = (g, id) => g.nodes.get(id);
    const plain = buildTrustGraph(judgedItem());
    assert.deepEqual([node(plain, 'agent:builder@m').bad, node(plain, 'agent:reader@m').bad], [1, 0], 'no origin: the fixes decide');
    const g = buildTrustGraph(judgedItem([{ criterion: 'A1', step: 'read', agent: 'reader', method: 'chain', charged: true, foundAt: 'proof' }]));
    assert.deepEqual([node(g, 'agent:reader@m').bad, node(g, 'agent:builder@m').bad, node(g, 'judge:checker@m').bad, node(g, 'judge:inspector@m').bad], [1, 0, 0.5, 0]);
    const brief = buildTrustGraph(judgedItem([{ criterion: 'Z9', step: 'read', agent: null, method: 'human', cause: 'brief', charged: false }]));
    assert.equal(node(brief, 'agent:builder@m').bad + node(brief, 'agent:reader@m').bad, 0, 'not in the brief: nobody who worked');
    const tool = buildTrustGraph(judgedItem([{ criterion: 'A1', step: 'build', agent: null, tool: 'spec_compare', method: 'measured', charged: false }]));
    assert.equal(node(tool, 'tool:spec_compare').bad, 1);
    assert.equal(node(tool, 'agent:builder@m').bad, 0);
});

test('K1–K5 from the journal', () => {
    const ev = judgedItem([{ criterion: 'A1', step: 'read', method: 'chain', delay: 3 }, { criterion: 'A2', step: 'build', method: 'judged', delay: 1 }], [
        { kind: 'criterion', item: 'A', criteria: [{ id: 'A1', check: 'unit' }, { id: 'A2', check: 'lint x = 0' }, { id: 'A3', check: '[user]' }], hash: 'h' },
        { kind: 'evidence', item: 'A', name: 'unit', ok: true },
    ]);
    const q = qualityLoop(ev);
    assert.deepEqual([q.K1.value, q.K1.short], [0.5, ['A']]);
    assert.deepEqual([q.K2.value, q.K3.value, q.K4.value, q.K5.value], [0, 0, 1, 0.5]);
});

test('cli: a REWORK with --criterion records the source step, found by bisecting the snapshots of the steps', () => {
    const root = tmp();
    const check = 'node -e "process.exit(require(\'fs\').existsSync(\'ok.txt\') ? 0 : 1)"';
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal', eval: { snapshot: ['open', 'map', 'red', 'build', 'proof'] }, govern: { checks: { unit: check } } }));
    write(root, 'facet.items.json', '{}');
    write(root, '.gitignore', '.facet/\n.work/\n');
    write(root, 'src.txt', 'x\n');
    gitInit(root);
    const f = (...a) => spawnSync(process.execPath, [CLI, ...a], { cwd: root, encoding: 'utf-8', env: { ...process.env, FACET_WRITER: 'ann' } });
    f('flow', 'open', 'A', '--route', '', '--force');
    write(root, '.work/A/order.md', `# A\n## Done when\n\`\`\`criteria\n${JSON.stringify([{ id: 'C1', text: 'ok.txt exists', check: 'unit', by: 'map' }])}\n\`\`\`\n`);
    assert.equal(f('criteria', 'approve', '--item', 'A', '--brief', '.work/A/order.md', '--by', 'ann').status, 0);
    const step = (id, before) => {
        before?.();
        f('flow', 'start', id);
        f('flow', 'end', id, '--status', 'DONE', '--force');
    };
    step('open');
    step('map'); // the map step makes ok.txt: it exists when red starts
    step('red', () => write(root, 'ok.txt', 'made by map\n'));
    step('build', () => fs.rmSync(path.join(root, 'ok.txt'))); // red removed it again
    step('proof');
    const v = f('flow', 'verdict', 'REWORK', '--fix', 'builder', '--criterion', 'C1');
    assert.equal(v.status, 0, v.stderr);
    const o = readJournal(path.join(root, '.facet', 'journal')).filter((e) => e.kind === 'origin').at(-1);
    assert.deepEqual([o.criterion, o.step, o.method, o.cause, o.from], ['C1', 'red', 'measured', 'regression', 'return']);
    assert.match(v.stdout, /origin C1: red .* measured, regression/);
    // a criterion nobody stated: the brief
    const missing = f('origin', '--item', 'A', '--criterion', 'Z9', '--from', 'human', '--cause', 'new-wish');
    assert.match(missing.stdout, /Z9: source open \(route-conductor, not charged\) — human, new-wish/);
});
