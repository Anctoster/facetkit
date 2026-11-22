// Proof packs and bundles to verify, shared by the tests of schema 3 and of the stand-alone verifier.
import fs from 'node:fs';
import path from 'node:path';
import { readJournal, record } from '../lib/journal.mjs';
import { createProof, exportProof, sourceState, witnessDigest } from '../lib/proof.mjs';
import { newKey, sign } from '../lib/sign.mjs';
import { canon } from '../lib/canon.mjs';
import { sha256 } from '../lib/text.mjs';
import { gitInit, story, tmp, write } from './helpers.mjs';

function judged() {
    const s = story();
    s.open('A', [{ id: 'build', agent: 'builder', phase: 'build' }, { id: 'proof', agent: 'inspector', phase: 'proof', verdict: true }]);
    s.say({ kind: 'step.start', item: 'A', step: 'build', agent: 'builder', run: 'r1' });
    s.say({ kind: 'step.end', item: 'A', step: 'build', agent: 'builder', status: 'DONE' });
    s.say({ kind: 'step.start', item: 'A', step: 'proof', agent: 'inspector', run: 'r2' });
    s.say({ kind: 'evidence', item: 'A', name: 'scan', ok: true, value: 0, approvals: [] });
    s.say({ kind: 'step.end', item: 'A', step: 'proof', agent: 'inspector', status: 'DONE' });
    s.say({ kind: 'verdict', item: 'A', verdict: 'PASS', fixes: [] });
    return s.events;
}

/** One honest bundle: a pack signed by its author, with a witness record from another machine signed by a trusted witness. */
export function honest() {
    const root = tmp();
    write(root, 'src/a.mjs', 'export const a = 1;\n');
    gitInit(root);
    const dir = path.join(root, '.work', 'journal');
    const state = sourceState(root).state;
    for (const e of judged()) record(dir, { ...e, ...(e.kind === 'evidence' ? { state } : {}) }, { writer: 'ann' });
    const events = readJournal(dir);
    const author = newKey();
    const witnessKey = newKey();
    const manifest = createProof(root, events, 'A', { project: { journalIntact: true }, environment: { digest: 'env-author', comparable: true, node: '22', platform: 'linux', arch: 'x64', host: 'h-author' } });
    manifest.environment.host = 'h-author'; // outside the digest's concern here: what witnessLevelOf compares
    manifest.digest = undefined;
    const { digest: _d, signatures: _s, witnesses: _w, ...body } = manifest;
    const pack = { ...body, digest: sha256(canon(body)), signatures: [], witnesses: [] };
    pack.signatures.push(sign(author, pack.digest));
    const rec = { by: 'ci', at: '2026-11-22T12:00:00.000Z', digest: pack.digest, src: pack.source.state, sameSources: true, env: 'env-ci', host: 'h-ci', total: 1, reproduced: 1, differs: [], notRun: [] };
    pack.witnesses.push({ ...rec, signature: sign(witnessKey, witnessDigest(rec)) });
    const segments = { 'ann.jsonl': fs.readFileSync(path.join(dir, 'ann.jsonl'), 'utf-8').split('\n').filter(Boolean) };
    const bundle = JSON.parse(JSON.stringify(exportProof(pack, events, { segments })));
    const trust = { keys: [{ id: author.id, pub: author.pub, name: 'ann', role: 'writer' }, { id: witnessKey.id, pub: witnessKey.pub, name: 'ci', role: 'witness' }] };
    return { root, bundle, trust, author, witnessKey, rec };
}

const copy = (b) => JSON.parse(JSON.stringify(b));
/** The same value with every object's keys in reverse order: what another tool may write. */
export const reversed = (v) => (Array.isArray(v) ? v.map(reversed) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map((k) => [k, reversed(v[k])])) : v);
/**
 * Named bundles — honest and forged — each with what a verifier must answer, with and without the
 * trust list. `full` is facet's own verifier when it differs: it alone recomputes the level.
 */
export function cases() {
    const h = honest();
    const out = [];
    const add = (name, bundle, expect) => out.push({ name, bundle, ...expect });
    add('honest', h.bundle, { plain: 'VALID', trusted: 'VALID' });
    add('reordered keys', reversed(h.bundle), { plain: 'VALID', trusted: 'VALID' });
    let b = copy(h.bundle);
    b.manifest.level = 'L4 calibrated';
    add('level edited', b, { plain: 'TAMPERED', trusted: 'TAMPERED' });
    b = copy(h.bundle);
    b.events.push({ kind: 'waiver', item: 'A', rule: 'scan', reason: 'x' });
    add('event added', b, { plain: 'TAMPERED', trusted: 'TAMPERED' });
    b = copy(h.bundle);
    b.segments['ann.jsonl'][2] = b.segments['ann.jsonl'][2].replace('builder', 'someone');
    add('journal line edited', b, { plain: 'TAMPERED', trusted: 'TAMPERED' });
    b = copy(h.bundle);
    b.facts = { journalIntact: true, guardCatchLow: 1 };
    add('facts replaced', b, { plain: 'TAMPERED', trusted: 'TAMPERED' });
    b = copy(h.bundle);
    b.manifest.signatures = [];
    // signatures stand outside the digest and the seal covers them: removing one is an edit of the bundle
    add('signature removed', b, { plain: 'TAMPERED', trusted: 'TAMPERED' });
    b = copy(h.bundle);
    const forged = { ...h.rec, differs: ['scan'], reproduced: 0 };
    b.manifest.witnesses.push({ ...forged, signature: sign(h.witnessKey, witnessDigest(forged)) });
    b.seal = undefined;
    add('trusted witness disagrees', reseal(b), { plain: 'VALID', trusted: 'MISMATCH' });
    b = copy(h.bundle);
    b.manifest.witnesses[0].reproduced = 0;
    add('witness record edited', reseal(b), { plain: 'VALID', trusted: 'VALID', note: 'the edited record no longer counts; it does not count against the pack either' });
    b = copy(h.bundle);
    b.manifest.level = 'L4 calibrated';
    b.manifest.signatures = [];
    b.manifest.digest = sha256(canon((({ digest: _d, signatures: _s, witnesses: _w, ...body }) => body)(b.manifest)));
    // re-digested and re-sealed with the signature taken off: only recomputing the level, or asking for a signature, catches it
    add('level forged, re-digested, unsigned', reseal(b), { plain: 'MISMATCH', trusted: 'UNSIGNED', standalonePlain: 'VALID' });
    add('not a bundle', { schema: 'something-else' }, { plain: 'MISMATCH', trusted: 'MISMATCH' });
    return { cases: out, trust: h.trust, root: h.root };
}
/** A bundle sealed again after an edit: what someone who edits a bundle would do. */
export function reseal(b) {
    const { manifest, policy, checks, facts, events, segments } = b;
    return { ...b, seal: sha256(canon({ manifest, policy, checks, facts, events, segments })) };
}
