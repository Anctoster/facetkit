#!/usr/bin/env node
// verify-bundle: checks a facetkit proof bundle with nothing but this file and Node 20+ (plan 2.6).
// No imports from facetkit: read it, then run it. It is written to be audited in one sitting.
//
//   node verify-bundle.mjs <bundle.json> [--trust .facet/trust.json] [--json]
//
// What it checks:
//   seal       the bundle is as it was exported (SHA-256 over canonical JSON; /1 bundles: over JSON as written)
//   manifest   the pack matches its own digest (schema 3: canonical JSON; schema 2: JSON as written)
//   author     with --trust: the pack is signed by a trusted key, and no signature on it is bad
//   journal    every carried journal segment is an unbroken hash chain (schema-2 events: SHA-256 ids;
//              older events: SHA-1 line links), forks resolved by epoch as facet resolves them
//   events     every event the pack rests on is a line of the carried journal
//   witnesses  with --trust: no witness record signed by a key trusted as `witness` disagrees
// What it does not do: recompute the assurance level from the journal (that needs facet's policy
// engine: `facet proof verify --bundle` does it), and compare the sources (`--root` in facet).
// So a pack whose claims were edited and re-digested is caught here only through its signature:
// verify with --trust. Statuses: VALID, TAMPERED, UNSIGNED, MISMATCH — as facet gives them.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- canonical JSON (RFC 8785 for the values JSON carries) -----------------------------------
export function canon(v) {
    if (v === null) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number') {
        if (!Number.isFinite(v)) throw new TypeError(`canon: ${v} has no JSON form`);
        return JSON.stringify(v);
    }
    if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
    if (typeof v === 'object') {
        return `{${Object.keys(v)
            .filter((k) => v[k] !== undefined)
            .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
            .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`)
            .join(',')}}`;
    }
    throw new TypeError(`canon: a ${typeof v} has no JSON form`);
}
const sha256 = (data, n = 64) => crypto.createHash('sha256').update(data).digest('hex').slice(0, n);
const sha1 = (data, n = 8) => crypto.createHash('sha1').update(data).digest('hex').slice(0, n);

// ---- Ed25519 ---------------------------------------------------------------------------------
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const keyId = (pub) => sha256(Buffer.from(pub, 'base64'), 16);
function verifySig(pub, digest, sig) {
    try {
        const key = crypto.createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(pub, 'base64')]), format: 'der', type: 'spki' });
        return crypto.verify(null, Buffer.from(String(digest)), key, Buffer.from(sig, 'base64'));
    } catch {
        return false;
    }
}
/** Each signature: trusted, bad (a trusted key, a signature that does not match), wrong-role or unknown. */
function judge(digest, signatures, keys, roles = null) {
    const rows = (signatures ?? []).map((s) => {
        const k = keys.find((x) => x.id === s.key);
        if (!k) return { key: s.key, state: 'unknown' };
        if (!verifySig(k.pub, digest, s.sig)) return { key: s.key, state: 'bad', name: k.name };
        return { key: s.key, state: roles && !roles.includes(k.role) ? 'wrong-role' : 'trusted', name: k.name, role: k.role };
    });
    const trusted = rows.filter((r) => r.state === 'trusted');
    return { rows, bad: rows.some((r) => r.state === 'bad'), authentic: trusted.length > 0 && !rows.some((r) => r.state === 'bad'), by: trusted.map((r) => `${r.name} (${r.role})`) };
}
/** Trusted keys: a key whose id is not the hash of its public key is dropped, as facet drops it. */
export const trustedKeys = (trust) => (Array.isArray(trust?.keys) ? trust.keys : []).filter((k) => k && typeof k.pub === 'string' && keyId(k.pub) === k.id);

// ---- the journal's hash chain ----------------------------------------------------------------
const SCHEMA = 2;
const GENESIS = '00000000';
const FORK_DEPTH = 8;
const parse = (line) => {
    try {
        return JSON.parse(line);
    } catch {
        return null;
    }
};
const eventId = ({ id: _id, sg: _sg, ...rest }) => sha256(canon(rest));
const linkOf = (line, e) => (e?.v === SCHEMA ? (eventId(e) === e.id ? e.id : null) : sha1(line));
/** Index of the first line that does not continue the chain, or -1. */
export function brokenAt(lines) {
    const accepted = [];
    const hashes = [];
    let current = false;
    for (let i = 0; i < lines.length; i++) {
        const e = parse(lines[i]);
        if (e === null || (e.v !== undefined && e.v !== SCHEMA) || (current && e.v !== SCHEMA)) return i;
        const link = linkOf(lines[i], e);
        if (link === null) return i;
        if (e.prev === (hashes.length ? hashes.at(-1) : GENESIS)) {
            accepted.push(e);
            hashes.push(link);
            current ||= e.v === SCHEMA;
            continue;
        }
        let j = -2;
        for (let k = hashes.length - 2; k >= Math.max(-1, hashes.length - 1 - FORK_DEPTH); k--) if ((k < 0 ? GENESIS : hashes[k]) === e.prev) {
            j = k;
            break;
        }
        if (j === -2) return i;
        // a fork: the later epoch replaces what the earlier one appended; otherwise the line is set aside (not part of the history)
        const ep = e.ep ?? 0;
        if (accepted.slice(j + 1).every((d) => (d.ep ?? 0) < ep)) {
            accepted.length = j + 1;
            hashes.length = j + 1;
            accepted.push(e);
            hashes.push(link);
        }
    }
    return -1;
}

// ---- the bundle ------------------------------------------------------------------------------
const textOf = (value, schema) => (schema >= 3 ? canon(value) : JSON.stringify(value));
const packDigest = ({ digest: _d, signatures: _s, witnesses: _w, ...body }) => sha256(textOf(body, body.schemaVersion));
const witnessDigest = ({ signature: _s, ...record }) => sha256(canon(record));
const witnessProblem = (w, manifest, keys) => {
    if (!w.signature) return 'not signed';
    if ((manifest.signatures ?? []).some((s) => s.key === w.signature.key)) return 'signed by a key that also signed the pack';
    const state = judge(witnessDigest(w), [w.signature], keys, ['witness']).rows[0].state;
    return state === 'trusted' ? null : state;
};

/** { status, item, level, steps: [{ name, ok, text }] }. `trust` is the parsed .facet/trust.json, or null. */
export function verifyBundle(bundle, { trust = null } = {}) {
    const steps = [];
    const step = (name, ok, text) => steps.push({ name, ok, text });
    const version = bundle?.schema === 'facetkit-proof-bundle/2' ? 2 : bundle?.schema === 'facetkit-proof-bundle/1' ? 1 : 0;
    if (!version) return { status: 'MISMATCH', item: null, level: null, steps: [{ name: 'schema', ok: false, text: 'not a facetkit-proof-bundle/2 file' }] };
    const { manifest, policy, checks, events = [], segments = {} } = bundle;
    const facts = bundle.facts ?? {};
    const sealed = { manifest, policy, checks, facts, events, segments };
    step('seal', sha256(version >= 2 ? canon(sealed) : JSON.stringify(sealed)) === bundle.seal, version >= 2 ? 'the bundle is as it was exported' : 'the bundle is as it was exported (legacy bundle: sealed over JSON as written)');
    const known = manifest?.schemaVersion === 3 || manifest?.schemaVersion === 2;
    step('manifest', known && packDigest(manifest) === manifest.digest, known ? 'the manifest matches its own digest' : `a pack of schema ${manifest?.schemaVersion}, this file reads 3 and 2`);
    const keys = trust ? trustedKeys(trust) : null;
    if (keys) {
        const who = judge(manifest?.digest, manifest?.signatures, keys);
        step('author', !who.bad && who.authentic, who.bad ? 'a signature does not match the manifest' : who.authentic ? `signed by ${who.by.join(', ')}` : 'not signed by a key you trust');
    }
    const names = Object.keys(segments);
    const broken = names.filter((n) => brokenAt(segments[n]) !== -1);
    step('journal', names.length > 0 && broken.length === 0, names.length ? (broken.length ? `the history was edited in ${broken.join(', ')}` : `${names.length} journal segment(s), every chain whole`) : 'the bundle carries no journal');
    const asText = (e) => (version >= 2 ? canon(e) : JSON.stringify(e));
    const carried = new Set(names.flatMap((n) => segments[n]).map((l) => {
        const e = parse(l);
        return e === null ? null : asText(e);
    }));
    const strangers = events.filter((e) => !carried.has(asText(e))).length;
    step('events', strangers === 0, strangers ? `${strangers} event(s) are not in the journal the bundle carries` : 'every event comes from the carried journal');
    if (keys) {
        const mine = (manifest?.witnesses ?? []).filter((w) => w.digest === manifest.digest);
        const against = mine.filter((w) => w.sameSources && (w.differs ?? []).length && !witnessProblem(w, manifest, keys));
        const forIt = mine.filter((w) => w.sameSources && !(w.differs ?? []).length && w.total > 0 && !(w.notRun ?? []).length && !witnessProblem(w, manifest, keys));
        const at = manifest?.environment ?? {};
        const independent = forIt.some((w) => w.host && at.host && w.host !== at.host && w.env && at.digest && w.env !== at.digest);
        step('witnesses', !against.length, against.length ? `a trusted witness did not reproduce: ${against.flatMap((w) => w.differs).join(', ')}` : forIt.length ? `reproduced by a trusted witness (${independent ? 'independent' : 'rerun'})` : 'no trusted witness reproduced it');
    }
    const failed = steps.find((x) => !x.ok);
    const status = !failed ? 'VALID' : failed.name === 'author' ? 'UNSIGNED' : ['seal', 'manifest', 'journal', 'events'].includes(failed.name) ? 'TAMPERED' : 'MISMATCH';
    return { status, item: manifest?.item ?? null, level: manifest?.level ?? null, steps };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--trust');
    if (!file) {
        console.error('usage: node verify-bundle.mjs <bundle.json> [--trust .facet/trust.json] [--json]');
        process.exit(2);
    }
    const read = (f) => JSON.parse(fs.readFileSync(f, 'utf-8'));
    const at = args.indexOf('--trust');
    const v = verifyBundle(read(file), { trust: at >= 0 ? read(args[at + 1]) : null });
    if (args.includes('--json')) console.log(JSON.stringify(v));
    else {
        console.log(`proof bundle of ${v.item ?? '?'}: ${v.status}${v.status === 'VALID' ? ` — ${v.level} as claimed (the level is not recomputed here)` : ''}`);
        for (const s of v.steps) console.log(`  ${s.ok ? '✓' : '✗'} ${s.name.padEnd(9)} ${s.text}`);
        if (at < 0) console.log('  · no --trust: who made the pack and what witnesses said are not judged');
    }
    process.exit(v.status === 'VALID' ? 0 : 1);
}
