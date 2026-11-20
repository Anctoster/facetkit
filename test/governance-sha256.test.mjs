import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { attest, DEFAULT_POLICY, digestOf, policyHash } from '../lib/govern.mjs';
import { proofDigest } from '../lib/proof.mjs';
import { sha } from '../lib/text.mjs';
import { gitInit, story, tmp, write } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');

test('governance: a policy and an attestation are hashed with SHA-256 over canonical JSON', () => {
    const s = story();
    s.item('A');
    const a = attest(s.events, 'A');
    assert.match(a.policy, /^[0-9a-f]{64}$/);
    assert.match(a.digest, /^[0-9a-f]{64}$/);
    assert.equal(a.policy, policyHash(DEFAULT_POLICY));
    const reordered = DEFAULT_POLICY.map((r) => Object.fromEntries(Object.entries(r).reverse()));
    assert.equal(policyHash(reordered), a.policy, 'the order of keys does not change the hash');
    assert.equal(digestOf(a), a.digest);
    assert.notEqual(digestOf({ ...a, level: 'L4 calibrated' }), a.digest, 'an edited attestation no longer matches');
});

test('governance: an attestation written before 0.7.1 is still checked by its own rule', () => {
    const body = { item: 'A', level: 'L1 reproduced', policy: 'abcdefabcdef' };
    const old = { ...body, digest: sha(JSON.stringify(body), 16) };
    assert.equal(digestOf(old), old.digest);
    assert.notEqual(digestOf({ ...old, level: 'L4 calibrated' }), old.digest);
});

test('cli: a proof made with a short SHA-1 policy hash says to make it again', () => {
    const root = tmp();
    const node = JSON.stringify(process.execPath);
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal', govern: { checks: { truth: `${node} -e "process.exit(0)"` } } }));
    write(root, 'facet.items.json', '{}');
    write(root, 'src/a.txt', 'one\n');
    gitInit(root);
    const f = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf-8', env: { ...process.env, FACET_KEYS: path.join(tmp(), 'none'), FACET_WRITER: 'ann' } });
    f('flow', 'open', 'A', '--route', '', '--force');
    for (const step of ['open', 'map', 'red', 'build', 'proof']) {
        f('flow', 'start', step);
        f('flow', 'end', step, '--status', 'DONE', '--force');
    }
    assert.equal(f('check', 'truth').status, 0);
    assert.equal(f('proof', 'create').status, 0);
    const file = path.join(root, '.work', 'A', 'proof', 'manifest.json');
    const m = JSON.parse(fs.readFileSync(file, 'utf-8'));
    assert.match(m.policy.hash, /^[0-9a-f]{64}$/);
    const before = { ...m, policy: { hash: m.policy.hash.slice(0, 12) } };
    fs.writeFileSync(file, JSON.stringify({ ...before, digest: proofDigest(before) }));
    const out = f('proof', 'verify');
    assert.equal(out.status, 1);
    assert.match(out.stdout, /made before 0\.7\.1, with a short SHA-1 hash of its policy that is no longer accepted: create the proof again/);
});
