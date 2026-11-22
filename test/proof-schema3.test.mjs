// Plan 2.6, guard part: pack schema 3 and bundle /2 — every digest is SHA-256 over canonical JSON;
// schema 2 packs and /1 bundles are read as legacy.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canon } from '../lib/canon.mjs';
import { LEGACY_BUNDLE_SCHEMA, PROOF_SCHEMA, proofDigest, verifyBundle, verifyProof } from '../lib/proof.mjs';
import { sha256 } from '../lib/text.mjs';
import { readJournal } from '../lib/journal.mjs';
import { cases, honest, reversed } from './proof-fixtures.mjs';

test('schema 3: the digest is over canonical JSON, so the order of keys does not matter', () => {
    const { bundle } = honest();
    const m = bundle.manifest;
    assert.equal(m.schemaVersion, PROOF_SCHEMA);
    assert.equal(proofDigest(m), m.digest);
    const reordered = reversed(m);
    assert.notEqual(JSON.stringify(reordered), JSON.stringify(m));
    assert.equal(proofDigest(reordered), m.digest);
    assert.match(m.basis, /^[0-9a-f]{64}$/, 'the basis is a full SHA-256');
});

test('bundle /2: each case gets its status, with and without a trust list', () => {
    const { cases: all, trust } = cases();
    for (const c of all) {
        assert.equal(verifyBundle(c.bundle).status, c.plain, `${c.name} (no trust list)`);
        assert.equal(verifyBundle(c.bundle, { trust }).status, c.trusted, `${c.name} (trusted keys)`);
    }
});

test('legacy: a schema-2 pack in a /1 bundle — digests over JSON as written — is still read', () => {
    const { bundle } = honest();
    const { digest: _d, signatures: _s, witnesses: _w, ...body } = bundle.manifest;
    const old = { ...body, schemaVersion: 2 };
    // what 0.7 wrote: the digest over JSON.stringify, in the order the keys were written
    const pack = { ...old, digest: sha256(JSON.stringify(old)), signatures: [], witnesses: [] };
    assert.equal(proofDigest(pack), pack.digest);
    const { manifest: _m, schema: _x, seal: _y, exportedAt, ...rest } = bundle;
    const legacy = { schema: LEGACY_BUNDLE_SCHEMA, exportedAt, ...rest, manifest: pack };
    legacy.seal = sha256(JSON.stringify({ manifest: legacy.manifest, policy: legacy.policy, checks: legacy.checks, facts: legacy.facts, events: legacy.events, segments: legacy.segments }));
    const v = verifyBundle(legacy);
    assert.equal(v.steps.find((s) => s.name === 'seal').ok, true, 'a /1 seal is checked by its own rule');
    assert.equal(v.steps.find((s) => s.name === 'manifest').ok, true, 'a schema-2 digest is checked by its own rule');
    assert.match(v.steps.find((s) => s.name === 'seal').text, /legacy/);
    // the canonical seal of the same content is not accepted for a /1 bundle
    assert.equal(verifyBundle({ ...legacy, seal: sha256(canon({ manifest: legacy.manifest, policy: legacy.policy, checks: legacy.checks, facts: legacy.facts, events: legacy.events, segments: legacy.segments })) }).status, 'TAMPERED');
});

test('legacy: verifyProof reads schema 2 with a note, refuses an unknown schema', () => {
    const { bundle, root } = honest();
    const events = readJournal(`${root}/.work/journal`);
    const v3 = verifyProof(root, events, bundle.manifest, { project: { journalIntact: true } });
    assert.equal(v3.status, 'VALID', JSON.stringify(v3.reasons));
    const { digest: _d, signatures: _s, witnesses: _w, ...body } = bundle.manifest;
    const v4 = { ...body, schemaVersion: 4 };
    assert.equal(verifyProof(root, events, { ...v4, digest: proofDigest(v4), signatures: [], witnesses: [] }).status, 'MISMATCH');
    const v2 = { ...body, schemaVersion: 2 };
    const r = verifyProof(root, events, { ...v2, digest: proofDigest(v2), signatures: [], witnesses: [] }, { project: { journalIntact: true } });
    assert.ok(r.notes.some((n) => /legacy: schema 2/.test(n)));
    assert.equal(r.status, 'MISMATCH', 'a schema-2 basis is 32 characters: a full one is not what 0.7 wrote');
});
