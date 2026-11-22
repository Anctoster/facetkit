// A domain item's proof rests on the files it declares, read from disk, not on the git tree (plan 2.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sourceState } from '../lib/proof.mjs';

const tree = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'facet-declared-'));
    fs.mkdirSync(path.join(root, 'work', 'D1'), { recursive: true });
    fs.writeFileSync(path.join(root, 'work', 'D1', 'spec.json'), '{"walls":3}');
    fs.writeFileSync(path.join(root, 'work', 'D1', 'out.png'), 'png');
    fs.writeFileSync(path.join(root, 'notes.md'), 'unrelated');
    return root;
};

test('declared state covers the declared files and nothing else', () => {
    const root = tree();
    const a = sourceState(root, { only: ['work/D1/**'] });
    assert.equal(a.files, 2);
    assert.deepEqual(a.declared, ['work/D1/**']);
    assert.equal(a.git, false);
    fs.writeFileSync(path.join(root, 'notes.md'), 'edited');
    assert.equal(sourceState(root, { only: ['work/D1/**'] }).state, a.state, 'an undeclared file does not move the state');
    fs.writeFileSync(path.join(root, 'work', 'D1', 'spec.json'), '{"walls":4}');
    const b = sourceState(root, { only: ['work/D1/**'] });
    assert.notEqual(b.state, a.state, 'a declared file does');
    assert.ok(b.dirty.some((d) => d.path === 'work/D1/spec.json'));
});

test('the declaration is part of the state, and an empty pattern is a blind spot', () => {
    const root = tree();
    const one = sourceState(root, { only: ['work/D1/**'] });
    const two = sourceState(root, { only: ['work/D1/**', 'work/D1/missing/**'] });
    assert.notEqual(one.state, two.state);
    assert.ok(two.blind.some((b) => b.includes('work/D1/missing/**')));
    assert.equal(one.blind.length, 0);
});

test('without a declaration the state is the whole tree, as before', () => {
    const root = tree();
    assert.equal(sourceState(root).files, 3);
    assert.equal(sourceState(root).declared, undefined);
});
