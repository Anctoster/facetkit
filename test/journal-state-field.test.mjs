import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { evidenceOf } from '../lib/govern.mjs';
import { readJournal, stateOf } from '../lib/journal.mjs';
import { gitInit, tmp, write } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');

test('source state: written as state since 0.8; an old event with src as a string is read by its rule; src as an object is a domain line, not a state', () => {
    assert.equal(stateOf({ state: 's1' }), 's1');
    assert.equal(stateOf({ src: 's0' }), 's0', 'an event written before 0.8');
    assert.equal(stateOf({ src: { journal: '_arch/journal.jsonl', n: 3, hash: 'a'.repeat(64) } }), null, 'a pointer to a domain line says nothing about the sources');
    assert.equal(stateOf({}), null);
    const at = (extra) => ({ kind: 'evidence', item: 'A', name: 'unit', ok: true, at: '2026-11-22T10:00:00.000Z', ...extra });
    const stale = (e) => evidenceOf([{ kind: 'item.open', item: 'A', steps: [] }, e], 'A', { source: 's1' }).unit.stale;
    assert.equal(stale(at({ state: 's0' })), true, 'measured on other sources');
    assert.equal(stale(at({ src: 's0' })), true, 'the same, written the old way');
    assert.equal(stale(at({ state: 's1' })), false);
    assert.equal(stale(at({ src: { journal: 'j', n: 1, hash: 'h' } })), false, 'an imported domain result is not made stale by its pointer');
});

test('cli: a check writes the source state as state, never as src', () => {
    const root = tmp();
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal', govern: { checks: { truth: `${JSON.stringify(process.execPath)} -e "process.exit(0)"` } } }));
    write(root, 'facet.items.json', JSON.stringify({ items: { A: { deps: [], route: [], gates: [] } } }));
    write(root, 'src/a.txt', 'one\n');
    gitInit(root);
    const f = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf-8', env: { ...process.env, FACET_WRITER: 'ann' } });
    f('flow', 'open', 'A', '--route', '', '--force');
    assert.equal(f('check', 'truth').status, 0);
    const e = readJournal(path.join(root, '.facet', 'journal')).find((x) => x.kind === 'evidence' && x.name === 'truth');
    assert.match(e.state, /^[0-9a-f]{32}$/);
    assert.equal(e.src, undefined);
});
