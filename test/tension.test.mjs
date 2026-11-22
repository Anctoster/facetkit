// Plan 2.12: initiative, step 0 — a tension is recorded and shown at the close; I1 and I5.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readJournal } from '../lib/journal.mjs';
import { noticed, openedByStep, silentPasses } from '../lib/tension.mjs';
import { gitInit, story, tmp, write } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');

test('cli: an agent records a tension in its running step; the close shows the list to a person', () => {
    const root = tmp();
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal', govern: { required: 0 } }));
    write(root, 'facet.items.json', '{}');
    gitInit(root);
    const f = (...a) => spawnSync(process.execPath, [CLI, ...a], { cwd: root, encoding: 'utf-8', env: { ...process.env, FACET_WRITER: 'ann' } });
    f('flow', 'open', 'A', '--route', '', '--force');
    f('flow', 'start', 'open');
    f('flow', 'end', 'open', '--status', 'DONE', '--force');
    f('flow', 'start', 'map');
    const r = f('tension', 'add', 'the', 'retry', 'loop', 'in', 'src/io.mjs', 'never', 'gives', 'up', '--where', 'src/io.mjs:40', '--proposal', 'cap it at 3');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /tension recorded in map/);
    const t = readJournal(path.join(root, '.facet', 'journal')).find((e) => e.kind === 'tension');
    assert.deepEqual([t.step, t.agent, t.where, t.text, t.proposal], ['map', 'context-cartographer', 'src/io.mjs:40', 'the retry loop in src/io.mjs never gives up', 'cap it at 3']);
    assert.match(f('tension', 'list', '--item', 'A').stdout, /1 tension\(s\)\n {2}· map \(context-cartographer\) at src\/io\.mjs:40: the retry loop/);
    assert.notEqual(f('tension', 'add', '--item', 'A').status, 0, 'a tension says what was noticed');
    const closed = f('flow', 'close', '--item', 'A', '--force');
    assert.equal(closed.status, 0, closed.stderr);
    assert.match(closed.stdout, /A: 1 tension\(s\) recorded by the agents — read them:/);
});

function item(id, { tension = null, escapeFiles = null } = {}) {
    const s = story();
    s.open(id, [{ id: 'build', agent: 'builder', phase: 'build' }, { id: 'proof', agent: 'inspector', phase: 'proof', verdict: true }]);
    s.say({ kind: 'step.start', item: id, step: 'build', agent: 'builder', at: '2026-11-22T10:00:00.000Z' });
    if (tension) s.say({ kind: 'tension', item: id, step: 'build', agent: 'builder', text: tension });
    s.say({ kind: 'step.end', item: id, step: 'build', agent: 'builder', status: 'DONE', at: '2026-11-22T11:00:00.000Z' });
    s.say({ kind: 'verdict', item: id, verdict: 'PASS', fixes: [] });
    s.say({ kind: 'item.close', item: id });
    if (escapeFiles) s.say({ kind: 'escape', item: id, fix: 'abc', files: escapeFiles });
    return s.events;
}

test('I1: tensions per closed item', () => {
    const ev = [...item('A', { tension: 'x' }), ...item('B')];
    assert.deepEqual(noticed(ev), { items: 2, perItem: 0.5, withAny: 1 });
});

test('I5: a defect after acceptance in a file the agent opened, with no tension from it, is a silent pass', () => {
    const reads = [{ file: 'src/io.mjs', at: '2026-11-22T10:30:00.000Z' }, { file: 'src/late.mjs', at: '2026-11-22T12:00:00.000Z' }];
    const opened = (ev) => (i) => openedByStep(ev, i, { reads, listed: () => ['src/listed.mjs'] });
    const silent = item('A', { escapeFiles: ['./src/io.mjs'] });
    assert.deepEqual(silentPasses(silent, opened(silent)).rows[0].silent, [{ step: 'build', agent: 'builder' }]);
    const spoke = item('A', { tension: 'io looks wrong', escapeFiles: ['src/io.mjs'] });
    assert.equal(silentPasses(spoke, opened(spoke)).silent, 0, 'the agent said so');
    const elsewhere = item('A', { escapeFiles: ['src/late.mjs'] });
    assert.equal(silentPasses(elsewhere, opened(elsewhere)).silent, 0, 'read after the step: not this step\'s');
    const listed = item('A', { escapeFiles: ['src/listed.mjs'] });
    assert.equal(silentPasses(listed, opened(listed)).value, 1, 'a file the handoff lists was opened');
});

test('a tension the domain engine wrote is read into the core journal as a tension', { skip: !['python3', 'python'].some((p) => spawnSync(p, ['--version']).status === 0) }, async () => {
    const { coreEvent, readDomainJournal } = await import('../lib/domainlog.mjs');
    const python = ['python3', 'python'].find((p) => spawnSync(p, ['--version']).status === 0);
    const engine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'domains', 'arch', 'skills', 'arch-item', 'scripts');
    const dir = tmp('facetkit-domain-');
    const r = spawnSync(python, ['-c', `
import sys; sys.path.insert(0, sys.argv[1])
import archflow
j = archflow.Journal(sys.argv[2])
j.add("open", item="D1", route="model")
j.add("tension", item="D1", step="read", agent="source-reader", where="sheet:A-01", text="skala nieczytelna", proposal="zapytac")
`, engine, dir], { encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stderr);
    const t = readDomainJournal(path.join(dir, 'journal.jsonl')).lines.map((l) => coreEvent(l, { domain: 'arch', journal: 'j' })).find((e) => e.kind === 'tension');
    assert.deepEqual([t.item, t.step, t.agent, t.where, t.text, t.proposal], ['D1', 'read', 'source-reader', 'sheet:A-01', 'skala nieczytelna', 'zapytac']);
});

test('board: the Trust tab carries I1 and I5', async () => {
    const { boardData, renderBoard } = await import('../lib/board.mjs');
    const ev = item('A', { tension: 'x', escapeFiles: ['src/io.mjs'] });
    const d = boardData(ev, { openedBy: () => [{ step: 'build', agent: 'builder', files: ['src/io.mjs'] }] });
    assert.deepEqual(d.initiative.I1, { items: 1, perItem: 1, withAny: 1 });
    assert.equal(d.initiative.I5.escapes, 1);
    assert.match(renderBoard(d), /What agents noticed beyond their task/);
});
