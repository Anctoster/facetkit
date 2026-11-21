import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { addTrust, loadTrust, newKey } from '../lib/sign.mjs';
import { tmp, write } from './helpers.mjs';

const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf-8' });
const commitAll = (cwd, msg) => {
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '-qm', msg);
};
const repo = () => {
    const root = tmp();
    write(root, 'README.md', 'x\n');
    git(root, 'init', '-q');
    commitAll(root, 'init');
    return root;
};

test('trust is read from the commit: a key added and not committed is not trusted, and the run is told', () => {
    const root = repo();
    const ann = newKey();
    addTrust(root, { pub: ann.pub, name: 'ann', role: 'writer' });
    const before = loadTrust(root);
    assert.deepEqual(before.keys, []);
    assert.equal(before.source, 'none');
    assert.deepEqual(before.uncommitted, [ann.id]);
    assert.match(before.warning, /differs from HEAD: uncommitted changes to trust are not counted \(not trusted until committed: \w+\)/);
    commitAll(root, 'trust ann');
    const after = loadTrust(root);
    assert.deepEqual([after.keys.map((k) => k.id), after.source, after.ref, after.warning], [[ann.id], 'commit', 'HEAD', null]);
});

test('trust: a key removed in the working copy still counts until the removal is committed; deleting the file too', () => {
    const root = repo();
    const ann = newKey();
    const bob = newKey();
    addTrust(root, { pub: ann.pub, name: 'ann' });
    addTrust(root, { pub: bob.pub, name: 'bob' });
    commitAll(root, 'trust ann and bob');
    const file = path.join(root, '.facet', 'trust.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    fs.writeFileSync(file, JSON.stringify({ keys: data.keys.filter((k) => k.name !== 'bob') }));
    const t = loadTrust(root);
    assert.deepEqual(t.keys.map((k) => k.name).sort(), ['ann', 'bob']);
    assert.match(t.warning, /uncommitted changes to trust are not counted$/);
    fs.rmSync(file);
    assert.match(loadTrust(root).warning, /deleted in the working copy; trust is still read from HEAD/);
    assert.equal(loadTrust(root).keys.length, 2);
});

test('trust: the same keys written differently (order, spacing, line ends) are not a difference', () => {
    const root = repo();
    const ann = newKey();
    addTrust(root, { pub: ann.pub, name: 'ann' });
    commitAll(root, 'trust ann');
    const file = path.join(root, '.facet', 'trust.json');
    const k = JSON.parse(fs.readFileSync(file, 'utf-8')).keys[0];
    fs.writeFileSync(file, `{"keys":[{"added":"${k.added}","role":"${k.role}","pub":"${k.pub}","name":"ann","id":"${k.id}"}]}\r\n`);
    assert.equal(loadTrust(root).warning, null);
});

test('trust: govern.trustRef reads another commit, e.g. the reviewed main branch', () => {
    const root = repo();
    const ann = newKey();
    addTrust(root, { pub: ann.pub, name: 'ann' });
    commitAll(root, 'trust ann');
    git(root, 'tag', 'reviewed');
    addTrust(root, { pub: newKey().pub, name: 'mallory' });
    commitAll(root, 'trust mallory on a branch nobody reviewed');
    assert.deepEqual(loadTrust(root, { ref: 'reviewed' }).keys.map((k) => k.name), ['ann']);
    assert.deepEqual(loadTrust(root).keys.map((k) => k.name).sort(), ['ann', 'mallory']);
    assert.throws(() => loadTrust(root, { ref: '--output=/tmp/x' }), /is not a git ref/);
});

test('trust outside git: the file is read as it is and marked uncommitted; an unreadable file is an error, not an empty list', () => {
    const root = tmp();
    const ann = newKey();
    addTrust(root, { pub: ann.pub, name: 'ann' });
    const t = loadTrust(root);
    assert.deepEqual([t.keys.length, t.source, t.ref], [1, 'uncommitted', null]);
    assert.match(t.warning, /outside git.*no proof reaches L4/);
    assert.equal(loadTrust(tmp()).source, 'none');
    write(root, '.facet/trust.json', '{ not json');
    assert.throws(() => loadTrust(root), /trust\.json is not readable/);
});
