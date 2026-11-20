import assert from 'node:assert/strict';
import { test } from 'node:test';
import { witnessDigest, witnessed } from '../lib/proof.mjs';
import { newKey, sign } from '../lib/sign.mjs';

// witnessed() reads only the digest, the pack's signatures and the witness records
const author = newKey();
const witnessKey = newKey();
const writerKey = newKey();
const stranger = newKey();
const trust = { keys: [author, witnessKey, writerKey].map((k, i) => ({ id: k.id, pub: k.pub, name: ['author', 'ci', 'dev'][i], role: ['writer', 'witness', 'writer'][i] })) };
const pack = { digest: 'd'.repeat(64), signatures: [sign(author, 'd'.repeat(64))] };
const record = (extra = {}) => ({ by: 'ci', at: '2026-11-20T00:00:00.000Z', digest: pack.digest, src: 's', sameSources: true, env: 'e', total: 2, reproduced: 2, differs: [], notRun: [], ...extra });
const signedBy = (key, r = record()) => ({ ...r, signature: sign(key, witnessDigest(r)) });

test('witness: an agreeing record counts only when signed by a trusted witness who did not sign the pack', () => {
    const ok = witnessed({ ...pack, witnesses: [signedBy(witnessKey)] }, trust);
    assert.deepEqual([ok.independent, ok.rejected.length], [true, 0]);
    for (const [w, why] of [
        [record(), /not signed/], // written into the pack by hand
        [signedBy(author), /also signed the pack/], // the author re-running its own checks
        [signedBy(writerKey), /without the witness role/],
        [signedBy(stranger), /does not trust/],
        [{ ...signedBy(witnessKey), reproduced: 1, total: 1 }, /does not match the record/], // edited after signing
    ]) {
        const v = witnessed({ ...pack, witnesses: [w] }, trust);
        assert.equal(v.independent, false, String(why));
        assert.match(v.rejected[0].why, why);
    }
    assert.equal(witnessed({ ...pack, witnesses: [signedBy(witnessKey)] }).independent, false, 'without the project\'s trust list nothing vouches');
});

test('witness: a disagreement counts from any record — a forged one can raise an alarm, never pass a pack', () => {
    const v = witnessed({ ...pack, witnesses: [signedBy(witnessKey), record({ reproduced: 1, differs: ['scan'] })] }, trust);
    assert.deepEqual([v.independent, v.against], [false, ['scan']]);
});

test('witness: the signature covers the canonical record, whatever the order of its keys', () => {
    const r = record();
    const reordered = Object.fromEntries(Object.entries(r).reverse());
    assert.equal(witnessDigest(r), witnessDigest(reordered));
    const w = { ...reordered, signature: sign(witnessKey, witnessDigest(r)) };
    assert.equal(witnessed({ ...pack, witnesses: [w] }, trust).independent, true);
});
