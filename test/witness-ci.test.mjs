// Plan 2.4: a witness in CI — the key comes from a secret, the pack from the pull request, and
// checks that need a program the runner lacks (Archicad, Blender) are not run there.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { witnessed } from '../lib/board.mjs';
import { safeEnv } from '../lib/shell.mjs';
import { addTrust, keyFromPem, newKey } from '../lib/sign.mjs';
import { gitInit, tmp, write } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');

test('the witness key never reaches a command, whatever govern.env names', () => {
    const env = { PATH: '/bin', FACET_WITNESS_KEY: 'k', MY_SECRET: 's' };
    assert.deepEqual(Object.keys(safeEnv({ allow: ['FACET_WITNESS_KEY', 'MY_SECRET'], env })).sort(), ['MY_SECRET', 'PATH']);
    assert.deepEqual(Object.keys(safeEnv({ allow: ['MY_SECRET'], env, never: ['my_secret'] })), ['PATH']);
});

test('a key from PEM text, as a secret holds it — with real or escaped line breaks', () => {
    const k = newKey();
    assert.equal(keyFromPem(k.pem).id, k.id);
    assert.equal(keyFromPem(k.pem.replace(/\n/g, '\\n')).id, k.id);
    assert.throws(() => keyFromPem('not a key'));
});

test('board: the share of packs an independent witness reproduced, from the last pack of each item', () => {
    const ev = [
        { kind: 'proof.create', item: 'A', digest: 'a1' },
        { kind: 'proof.witness', item: 'A', level: 'independent', differs: [] },
        { kind: 'proof.create', item: 'B', digest: 'b1' },
        { kind: 'proof.witness', item: 'B', level: 'rerun', differs: [] },
        { kind: 'proof.create', item: 'C', digest: 'c1' },
        { kind: 'proof.witness', item: 'C', level: null, differs: ['scan'] },
        { kind: 'proof.create', item: 'D', digest: 'd1' },
        { kind: 'proof.witness', item: 'D', level: 'independent', differs: [] },
        { kind: 'proof.create', item: 'D', digest: 'd2' }, // a new pack: the old witness does not carry over
    ];
    assert.deepEqual(witnessed(ev), { packs: 4, independent: 1, rerun: 1 });
});

test('cli: proof witness --pack --key-env --record — signed by the CI key, the key hidden from checks, Archicad checks not run', () => {
    const root = tmp();
    const keys = path.join(tmp(), 'keys');
    const env = { ...process.env, FACET_KEYS: keys, FACET_WRITER: 'ann' };
    delete env.FACET_WITNESS_KEY;
    // the commands are node, not shell built-ins, so the test reads the same on Windows
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal', govern: { checks: { nokey: 'node -e "process.exit(process.env.FACET_WITNESS_KEY ? 1 : 0)"', model: { run: 'node -e 0', requires: ['archicad'] } } } }));
    write(root, 'facet.items.json', '{}');
    write(root, 'src/a.txt', 'one\n');
    gitInit(root);
    const f = (...args) => spawnSync('node', [CLI, ...args], { cwd: root, encoding: 'utf-8', env });
    assert.equal(f('key', 'new').status, 0);
    const ci = newKey();
    addTrust(root, { pub: ci.pub, name: 'ci', role: 'witness' });
    spawnSync('git', ['add', '.facet/trust.json'], { cwd: root });
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'trust ci'], { cwd: root });
    f('flow', 'open', 'A', '--route', '', '--force');
    for (const step of ['open', 'map', 'red', 'build', 'proof']) {
        f('flow', 'start', step);
        f('flow', 'end', step, '--status', 'DONE', '--force');
    }
    assert.equal(f('check', 'nokey').status, 0);
    assert.equal(f('check', 'model').status, 0);
    assert.equal(f('proof', 'create').status, 0);
    const pack = path.join(root, '.work', 'ci', 'A.pack.json');
    fs.mkdirSync(path.dirname(pack), { recursive: true });
    fs.copyFileSync(path.join(root, '.work', 'A', 'proof', 'manifest.json'), pack);
    const ciEnv = { ...env, FACET_KEYS: path.join(tmp(), 'none'), FACET_WRITER: 'ci', FACET_WITNESS_KEY: ci.pem.replace(/\n/g, '\\n') };
    const w = spawnSync('node', [CLI, 'proof', 'witness', '--pack', '.work/ci/A.pack.json', '--key-env', 'FACET_WITNESS_KEY', '--out', '.work/ci/out/A.pack.json', '--record', '.work/ci/out/A.record.json'], { cwd: root, encoding: 'utf-8', env: ciEnv });
    assert.equal(w.status, 0, w.stderr);
    assert.match(w.stdout, /not run here: model needs archicad/);
    assert.match(w.stdout, /witness: 1\/1 checks gave the recorded answer · could not run: model/);
    const rec = JSON.parse(fs.readFileSync(path.join(root, '.work', 'ci', 'out', 'A.record.json'), 'utf-8'));
    assert.equal(rec.record.signature.key, ci.id);
    assert.deepEqual(rec.record.notRun, ['model']);
    assert.equal(rec.level, null, 'a record that could not run every check vouches for nothing');
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.work', 'ci', 'out', 'A.pack.json'), 'utf-8')).witnesses.length, 1);
    assert.equal(JSON.parse(fs.readFileSync(pack, 'utf-8')).witnesses.length, 0, 'the pack the pull request carries is left as it was');
    // with Archicad at hand the same check runs
    const all = spawnSync('node', [CLI, 'proof', 'witness', '--pack', '.work/ci/A.pack.json', '--key-env', 'FACET_WITNESS_KEY', '--with', 'archicad', '--record', '.work/ci/out/B.record.json', '--out', '.work/ci/out/B.pack.json'], { cwd: root, encoding: 'utf-8', env: ciEnv });
    assert.match(all.stdout, /witness: 2\/2 checks gave the recorded answer/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.work', 'ci', 'out', 'B.record.json'), 'utf-8')).level, 'rerun', 'same machine as the pack');
    // a missing or malformed key is refused before anything runs
    const none = spawnSync('node', [CLI, 'proof', 'witness', '--pack', '.work/ci/A.pack.json', '--key-env', 'NO_SUCH_VAR'], { cwd: root, encoding: 'utf-8', env: ciEnv });
    assert.notEqual(none.status, 0);
    assert.match(none.stderr, /NO_SUCH_VAR: the variable is empty or not set/);
    const bad = spawnSync('node', [CLI, 'proof', 'witness', '--pack', '.work/ci/A.pack.json', '--key-env', 'FACET_WITNESS_KEY'], { cwd: root, encoding: 'utf-8', env: { ...ciEnv, FACET_WITNESS_KEY: 'garbage' } });
    assert.match(bad.stderr, /does not hold a private key/);
});
