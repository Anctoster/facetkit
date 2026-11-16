// sign: who vouches for a record. A digest shows that a file matches itself; anybody who can edit
// the file can recompute it. A signature shows that the holder of a private key stood behind
// exactly this content — and a project decides which public keys it trusts, and for what.
//
//  key      Ed25519 (node:crypto, no dependency). The private key stays outside the repository
//           (~/.facet/keys/<id>.pem, mode 600, or the file FACET_KEY names). Its id is derived from
//           the public key, so an id cannot be claimed for another key.
//  trust    .facet/trust.json in the project: [{ id, name, role, pub, added }]. Adding a key is a
//           reviewed change of a tracked file — the same door every other rule comes through.
//           Roles: writer (journal events), witness (re-ran the checks), releaser (benchmarks).
//  sign     over a digest string. Nothing is signed that was not hashed first.
// What a signature does not do: it does not make the content true. It makes it attributable.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sha256 } from './text.mjs';

const rawPublic = (key) => key.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
const publicFrom = (pub) => crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pub, 'base64')]), format: 'der', type: 'spki' });
export const keyId = (pub) => sha256(Buffer.from(pub, 'base64'), 16);
export const keysDir = () => process.env.FACET_KEYS ?? path.join(os.homedir(), '.facet', 'keys');

/** A new key pair: { id, pub, pem }. Nothing is written. */
export function newKey() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pub = rawPublic(publicKey);
    return { id: keyId(pub), pub, pem: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
}
/** Stores the private key for its owner only; returns the path. */
export function saveKey(key, dir = keysDir()) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, `${key.id}.pem`);
    fs.writeFileSync(file, key.pem, { mode: 0o600 });
    return file;
}
/** The key this process signs with: FACET_KEY (a file), else the only key in the keys directory, else null. */
export function loadKey({ file = process.env.FACET_KEY, dir = keysDir() } = {}) {
    let from = file;
    if (!from && fs.existsSync(dir)) {
        const all = fs.readdirSync(dir).filter((f) => f.endsWith('.pem'));
        if (all.length === 1) from = path.join(dir, all[0]);
    }
    if (!from || !fs.existsSync(from)) return null;
    const privateKey = crypto.createPrivateKey(fs.readFileSync(from, 'utf-8'));
    const pub = rawPublic(crypto.createPublicKey(privateKey));
    return { id: keyId(pub), pub, privateKey };
}
export const sign = (key, digest) => ({ alg: 'ed25519', key: key.id, sig: crypto.sign(null, Buffer.from(String(digest)), key.privateKey ?? crypto.createPrivateKey(key.pem)).toString('base64') });
export function verify(pub, digest, sig) {
    try {
        return crypto.verify(null, Buffer.from(String(digest)), publicFrom(pub), Buffer.from(sig, 'base64'));
    } catch {
        return false;
    }
}

export const trustFile = (root) => path.join(root, '.facet', 'trust.json');
/** Trusted keys of a project. A key whose id does not match its public key is dropped, and said so. */
export function loadTrust(root) {
    const file = trustFile(root);
    const list = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')).keys ?? [] : [];
    return { keys: list.filter((k) => keyId(k.pub) === k.id), forged: list.filter((k) => keyId(k.pub) !== k.id).map((k) => k.id) };
}
export function addTrust(root, { pub, name, role = 'writer', now = new Date().toISOString() }) {
    const file = trustFile(root);
    const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : { keys: [] };
    const entry = { id: keyId(pub), name, role, pub, added: now };
    data.keys = [...data.keys.filter((k) => k.id !== entry.id), entry];
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    return entry;
}

/**
 * What the signatures on a record are worth here. Each: trusted (a key the project trusts, in a
 * role that may sign this), unknown (valid form, key not trusted), or bad (does not verify — the
 * record was changed after signing, or the signature was copied from another record).
 */
export function judgeSignatures(digest, signatures = [], trust = { keys: [] }, { roles = null } = {}) {
    const rows = signatures.map((s) => {
        const known = trust.keys.find((k) => k.id === s.key);
        if (!known) return { key: s.key, state: 'unknown', name: null, role: null };
        if (!verify(known.pub, digest, s.sig)) return { key: s.key, state: 'bad', name: known.name, role: known.role };
        return { key: s.key, state: roles && !roles.includes(known.role) ? 'wrong-role' : 'trusted', name: known.name, role: known.role };
    });
    const trusted = rows.filter((r) => r.state === 'trusted');
    return { rows, trusted: trusted.length, bad: rows.filter((r) => r.state === 'bad').length, authentic: trusted.length > 0 && !rows.some((r) => r.state === 'bad'), by: trusted.map((r) => `${r.name} (${r.role})`) };
}
/** Verifiers for journal events, keyed by key id (see journal.signatureReport). */
export const eventVerifiers = (trust) => Object.fromEntries(trust.keys.map((k) => [k.id, (id, sig) => verify(k.pub, id, sig)]));
/** A signer for journal events (see journal.setSigner). */
export const eventSigner = (key) => (id) => ({ k: key.id, s: sign(key, id).sig });
