// Plan 2.7: the isolation a measurement was taken in — ci, container, declared:<name> or none.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { environment, inContainer, isolationOf } from '../lib/envinfo.mjs';
import { readJournal } from '../lib/journal.mjs';
import { tmp, write } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');

test('isolation: CI first, then a container, then what the project declares, else none', () => {
    assert.equal(isolationOf({ env: { CI: 'true' }, container: true, declared: 'sandbox' }), 'ci');
    assert.equal(isolationOf({ env: { CI: 'false' }, container: true }), 'container');
    assert.equal(isolationOf({ env: { CI: '0' }, container: false, declared: 'claude-code' }), 'declared:claude-code');
    assert.equal(isolationOf({ env: {}, container: false }), 'none');
    assert.throws(() => isolationOf({ env: {}, container: false, declared: 'a b' }), /short name/);
    assert.throws(() => isolationOf({ env: {}, container: false, declared: '../x' }), /short name/);
});

test('isolation: a container is seen from its marker files or from the init process cgroup', () => {
    const none = { exists: () => false, read: () => '0::/\n' };
    assert.equal(inContainer(none), false);
    assert.equal(inContainer({ ...none, exists: (f) => f === '/.dockerenv' }), true);
    assert.equal(inContainer({ ...none, exists: (f) => f === '/run/.containerenv' }), true);
    assert.equal(inContainer({ ...none, read: () => '12:cpu:/kubepods/besteffort/pod1\n' }), true);
    assert.equal(inContainer({ ...none, read: () => '0::/system.slice/docker-abc.scope\n' }), true);
    assert.equal(inContainer({ ...none, read: () => { throw new Error('no /proc'); } }), false);
});

test('isolation: part of the environment record and its digest', () => {
    const e = environment(tmp(), { tools: false, declared: 'sandbox' });
    assert.match(e.isolation, /^(ci|container|declared:sandbox)$/);
});

test('cli: every evidence records the isolation it was measured in; govern.isolation is checked', () => {
    const root = tmp();
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal', govern: { isolation: 'claude-code', checks: { ok: 'node -e 0' } } }));
    write(root, 'facet.items.json', '{}');
    const env = { ...process.env, FACET_WRITER: 'ann', CI: '' };
    const f = (...a) => spawnSync(process.execPath, [CLI, ...a], { cwd: root, encoding: 'utf-8', env });
    f('flow', 'open', 'A', '--route', '', '--force');
    assert.equal(f('check', 'ok').status, 0);
    const ev = readJournal(path.join(root, '.facet', 'journal')).filter((e) => e.kind === 'evidence');
    assert.match(ev.at(-1).isolation, /^(container|declared:claude-code)$/, 'not CI here: observed container, or the declared sandbox');
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal', govern: { isolation: 'two words', checks: { ok: 'node -e 0' } } }));
    const bad = f('check', 'ok');
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /govern\.isolation must be a short name/);
});
