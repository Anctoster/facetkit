import assert from 'node:assert/strict';
import { test } from 'node:test';
import { provenLevel, witnessDigest, witnessed } from '../lib/proof.mjs';
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
    assert.deepEqual([ok.level, ok.rejected.length], ['rerun', 0], 'it vouches; where it ran is not said, so it is a rerun');
    for (const [w, why] of [
        [record(), /not signed/], // written into the pack by hand
        [signedBy(author), /also signed the pack/], // the author re-running its own checks
        [signedBy(writerKey), /without the witness role/],
        [signedBy(stranger), /does not trust/],
        [{ ...signedBy(witnessKey), reproduced: 1, total: 1 }, /does not match the record/], // edited after signing
    ]) {
        const v = witnessed({ ...pack, witnesses: [w] }, trust);
        assert.equal(v.level, null, String(why));
        assert.match(v.rejected[0].why, why);
    }
    assert.equal(witnessed({ ...pack, witnesses: [signedBy(witnessKey)] }).level, null, 'without the project\'s trust list nothing vouches');
});

test('witness: only a vouching record counts, for or against — a hand-written disagreement is rejected and changes nothing', () => {
    const forged = witnessed({ ...pack, witnesses: [signedBy(witnessKey), record({ reproduced: 1, differs: ['scan'] })] }, trust);
    assert.deepEqual([forged.level, forged.against, forged.rejected.map((r) => r.why)], ['rerun', [], ['not signed']]);
    const real = witnessed({ ...pack, witnesses: [signedBy(witnessKey), signedBy(witnessKey, record({ reproduced: 1, differs: ['scan'] }))] }, trust);
    assert.deepEqual([real.level, real.against], [null, ['scan']]);
});

test('witness: the signature covers the canonical record, whatever the order of its keys', () => {
    const r = record();
    const reordered = Object.fromEntries(Object.entries(r).reverse());
    assert.equal(witnessDigest(r), witnessDigest(reordered));
    const w = { ...reordered, signature: sign(witnessKey, witnessDigest(r)) };
    assert.equal(witnessed({ ...pack, witnesses: [w] }, trust).level, 'rerun');
});

test('witness levels: a trusted record from another machine and environment is independent; from the same machine it is a rerun', () => {
    const made = { ...pack, environment: { host: 'h-author', digest: 'e-author' } };
    const at = (host, env) => signedBy(witnessKey, record({ host, env }));
    assert.equal(witnessed({ ...made, witnesses: [at('h-author', 'e-author')] }, trust).level, 'rerun', 'same machine');
    assert.equal(witnessed({ ...made, witnesses: [at('h-author', 'e-other')] }, trust).level, 'rerun', 'same machine, another setup');
    assert.equal(witnessed({ ...made, witnesses: [at('h-ci', 'e-ci')] }, trust).level, 'independent', 'another machine');
    assert.equal(witnessed({ ...made, witnesses: [at(null, null)] }, trust).level, 'rerun', 'a record that does not say where it ran');
    assert.equal(witnessed({ ...pack, witnesses: [at('h-ci', 'e-ci')] }, trust).level, 'rerun', 'a pack that does not say where it was made');
    // the machine is part of what is signed: moving a local record to "another machine" breaks its signature
    const moved = { ...at('h-author', 'e-author'), host: 'h-ci', env: 'e-ci' };
    assert.equal(witnessed({ ...made, witnesses: [moved] }, trust).level, null);
    // the best vouching record decides, unless anyone disagrees
    assert.equal(witnessed({ ...made, witnesses: [at('h-author', 'e-author'), at('h-ci', 'e-ci')] }, trust).level, 'independent');
    assert.equal(witnessed({ ...made, witnesses: [at('h-ci', 'e-ci'), signedBy(witnessKey, record({ differs: ['scan'] }))] }, trust).level, null);
    assert.equal(witnessed({ ...made, witnesses: [at('h-ci', 'e-ci'), record({ differs: ['scan'] })] }, trust).level, 'independent', 'an unsigned disagreement does not count');
});

test('witness levels: L4 stands only with an independent witness; every other level is what the journal gives', () => {
    assert.equal(provenLevel('L4 calibrated', 'independent'), 'L4 calibrated');
    for (const w of ['rerun', null]) assert.equal(provenLevel('L4 calibrated', w), 'L3 falsified');
    for (const l of ['L0 claimed', 'L1 reproduced', 'L2 specified', 'L3 falsified']) assert.equal(provenLevel(l, null), l);
});
