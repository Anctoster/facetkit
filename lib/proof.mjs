// proof: a result is trusted for the exact state of the sources it was checked on, and for no other.
//
//  source state  one hash over every file of the working tree that git would track (tracked and
//                untracked, minus ignored paths and the team's own records): its content, whether
//                it may be executed, and — for a link — where it points, never what it points at.
//                A submodule counts by the commit it is at. It does not change when the same
//                content is committed, and it changes with any edit — a commit hash alone would
//                miss an edit made after the commit. What it cannot see is said in `blind`:
//                ignored files a build reads (name them in `govern.inputs`), empty directories,
//                and names that collide on a file system that folds case or Unicode forms.
//                A domain item (a model, a scene) is not a git tree: its state is the hash of the
//                files it declares (`only`: globs, e.g. work/D1-02/**), read from disk whether git
//                tracks them or not. A declared pattern that matches no file is said in `blind`.
//  evidence      carries the source state it was measured on (`state`; `src` before 0.8, see stateOf). When the tree moves on, that
//                evidence is stale: conservative invalidation — any change invalidates everything.
//                Invalidating only what depends on the changed files needs a dependency graph that
//                can be trusted; that is deliberately left for later.
//  trust decay   a check that declares what it covers ("covers": globs) is trusted for exactly those
//                files plus everything they import. Its evidence decays when one of them changes,
//                and only then: an edit to the documentation does not send the unit tests back,
//                and an edit to a module sends back every check whose scope reaches it. A change
//                that no check covers is reported as a blind spot rather than waved through.
//  proof pack    one manifest per item: the source state, the policy, every rule with its outcome,
//                the evidence with its origin, and a digest over all of it. It can be verified on
//                another clone: same sources and same journal give the same answer.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canon } from './canon.mjs';
import { attest, DEFAULT_POLICY, LEGACY_POLICY_HASH, legacyPolicyHash, LEVELS } from './govern.mjs';
import { brokenLines, stateOf } from './journal.mjs';
import { environmentDiff } from './envinfo.mjs';
import { judgeSignatures } from './sign.mjs';
import { sha256 } from './text.mjs';

export const PROOF_SCHEMA = 3;
/**
 * Schema 3 (plan 2.6): every digest of a pack and a bundle is SHA-256 over canonical JSON (canon), so a
 * pack read and written again by another tool, in another language, keeps its digest. Schema 2 hashed
 * JSON.stringify — the order the keys were written in — and is read as legacy, never rewritten.
 */
export const LEGACY_PROOF_SCHEMA = 2;
const textOf = (value, schema) => (schema >= 3 ? canon(value) : JSON.stringify(value));
/** Paths that are records about the work, not the work: they change with every event and prove nothing about the product. */
export const RECORDS = ['.work/**', '.facet/**', 'facet-board.html', 'node_modules/**', '.git/**'];
const glob = (pattern) => new RegExp(`^${pattern.replace(/[.+^$()|[\]\\{}]/g, '\\$&').replace(/\*\*/g, '§§').replace(/\*/g, '[^/]*').replaceAll('§§', '.*')}$`);
const git = (root, ...args) => spawnSync('git', args, { cwd: root, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
const hashFile = (abs) => crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 32);
/**
 * What one path is, as far as a result can depend on it: `f-:<hash>` a file, `fx:<hash>` an
 * executable file, `l:<hash of the target path>` a link, `m:<commit>` a submodule, `absent`.
 */
function entryOf(abs, st) {
    if (st.isSymbolicLink()) return `l:${sha256(fs.readlinkSync(abs), 32)}`;
    if (st.isDirectory()) return `m:${git(abs, 'rev-parse', 'HEAD').stdout.trim() || 'unknown'}`;
    if (!st.isFile()) return 'absent';
    return `f${process.platform !== 'win32' && st.mode & 0o111 ? 'x' : '-'}:${hashFile(abs)}`;
}

function walk(root, dir = '') {
    const out = [];
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            if (entry.name !== '.git' && entry.name !== 'node_modules') out.push(...walk(root, rel));
        } else if (entry.isFile() || entry.isSymbolicLink()) out.push(rel);
    }
    return out;
}

/**
 * Content hash of every source file: Map path → hash. With `cache` (a file path) a file whose size
 * and modification time are unchanged is not read again — on a large tree this is the whole cost.
 */
export function fileHashes(root, { ignore = [], cache = null, include = [], only = null } = {}) {
    const skip = [...RECORDS, ...ignore].map(glob);
    // declared artifacts are named by the domain, so they are read from disk: renders and model snapshots are often ignored by git
    const declared = only?.length ? only.map(glob) : null;
    const listed = declared ? null : git(root, 'ls-files', '-co', '--exclude-standard', '-z');
    const inGit = !declared && listed.status === 0;
    const files = (inGit ? listed.stdout.split('\0').filter(Boolean) : walk(root)).map((f) => f.split(path.sep).join('/')).filter((f) => !skip.some((re) => re.test(f))).filter((f) => !declared || declared.some((re) => re.test(f))).sort();
    let known = {};
    let cachedAt = 0;
    if (cache && fs.existsSync(cache)) {
        try {
            ({ at: cachedAt = 0, files: known = {} } = JSON.parse(fs.readFileSync(cache, 'utf-8')));
        } catch {
            known = {}; // a damaged cache costs time, never correctness
        }
    }
    const fresh = {};
    const out = new Map();
    const names = new Map(); // folded name → the names that fold to it
    for (const f of [...files, ...include.filter((x) => !files.includes(x))].sort()) {
        const abs = path.join(root, f);
        const key = f.normalize('NFC');
        const folded = key.toLowerCase();
        names.set(folded, [...(names.get(folded) ?? []), f]);
        let st = null;
        try {
            st = fs.lstatSync(abs);
        } catch { /* listed by git, gone from disk */ }
        if (!st) {
            out.set(key, 'absent');
            continue;
        }
        const k = known[key];
        // a cached hash is reused only when nothing the system records about the file moved, and the file is older than
        // the cache itself by more than the clock's grain — an edit in the same instant as the last hashing is read again
        const same = k && k.size === st.size && k.mtimeMs === st.mtimeMs && k.ctimeMs === st.ctimeMs && k.ino === st.ino && k.mode === st.mode && st.mtimeMs < cachedAt - 2000;
        const entry = same ? k.entry : entryOf(abs, st);
        fresh[key] = { size: st.size, mtimeMs: st.mtimeMs, ctimeMs: st.ctimeMs, ino: st.ino, mode: st.mode, entry };
        out.set(key, entry);
    }
    if (cache) {
        fs.mkdirSync(path.dirname(cache), { recursive: true });
        fs.writeFileSync(cache, JSON.stringify({ at: Date.now(), files: fresh }));
    }
    const collisions = [...names.values()].filter((v) => v.length > 1);
    const unmatched = declared ? only.filter((p, i) => !files.some((f) => declared[i].test(f))) : [];
    return Object.assign(out, { inGit, collisions, declared: declared ? [...only] : null, unmatched });
}
const digestOfHashes = (pairs) => sha256(pairs.map(([f, h]) => `${f}:${h}`).join('\n'), 32);

/**
 * The state of the working tree: { state, files, commit, tree, dirty: [{ path, sha }], git }.
 * With `only` (declared artifact globs) it is the state of those files alone: `declared` names the
 * globs, `dirty` lists every declared file (there is no commit to tell changed ones from), `git` is false.
 */
export function sourceState(root, { ignore = [], cache = null, hashes = null, include = [], only = null } = {}) {
    const skip = [...RECORDS, ...ignore].map(glob);
    const map = hashes ?? fileHashes(root, { ignore, cache, include, only });
    // the declaration is part of the state: the same files under another declaration are another claim
    const state = map.declared ? digestOfHashes([...map.declared.map((p, i) => [`declared#${i}`, p]), ...map]) : digestOfHashes([...map]);
    // what this state cannot vouch for, said rather than assumed away
    const blind = [...(map.collisions ?? []).map((c) => `names that are one file on a case- or form-folding file system: ${c.join(', ')}`), ...(map.unmatched ?? []).map((p) => `declared artifact matches no file: ${p}`)];
    if (map.declared) return { state, files: map.size, commit: null, tree: null, dirty: [...map].map(([f, sha]) => ({ path: f, sha })), git: false, blind, declared: map.declared };
    if (!map.inGit) return { state, files: map.size, commit: null, tree: null, dirty: [], git: false, blind };
    const dirty = git(root, 'status', '--porcelain', '-z').stdout.split('\0').filter(Boolean).map((l) => l.slice(3)).filter((f) => !skip.some((re) => re.test(f))).sort().map((f) => ({ path: f, sha: map.get(f.normalize('NFC')) ?? 'absent' }));
    return { state, files: map.size, commit: git(root, 'rev-parse', 'HEAD').stdout.trim() || null, tree: git(root, 'rev-parse', 'HEAD^{tree}').stdout.trim() || null, dirty, git: true, blind };
}

// ---- trust decay ---------------------------------------------------------------------------
/** Files a set of files depends on, through any number of imports (the files themselves included). */
export function importClosure(graph, files) {
    const seen = new Set(files);
    const todo = [...files];
    while (todo.length) for (const dep of graph?.imports.get(todo.pop()) ?? []) if (!seen.has(dep)) {
        seen.add(dep);
        todo.push(dep);
    }
    return seen;
}
/** What a check stands for: the files its patterns match, and everything those files import. */
export function scopeFiles(all, covers = ['**'], graph = null) {
    const res = covers.map(glob);
    const known = new Set(all);
    return [...importClosure(graph, all.filter((f) => res.some((re) => re.test(f))))].filter((f) => known.has(f) || graph?.imports.has(f)).sort();
}
/** For every named check: { digest, files, covers } on the sources as they are now. */
export function scopesNow(hashes, checks, graph = null) {
    const all = [...hashes.keys()];
    const out = {};
    for (const [name, covers] of Object.entries(checks)) {
        const files = scopeFiles(all, covers, graph);
        out[name] = { digest: digestOfHashes(files.map((f) => [f, hashes.get(f) ?? 'absent'])), files: files.length, covers, list: files };
    }
    return out;
}
/**
 * Which evidence of an item still holds. `snapshotOf(src)` returns the path → hash map recorded
 * with that source state (or null). Rows: { name, state: fresh | decayed | unbound, changed: [files] };
 * `uncovered` are files changed since the oldest evidence that no check's scope reaches.
 */
export function decay(events, item, { hashes, scopes, snapshotOf = () => null } = {}) {
    const latest = new Map();
    for (const e of events) if (e.kind === 'evidence' && e.item === item) latest.set(e.name, e);
    const rows = [];
    const moved = new Set();
    for (const e of latest.values()) {
        const now = scopes[e.name];
        const then = stateOf(e) ? snapshotOf(stateOf(e)) : null;
        const changed = then ? [...new Set([...hashes.keys(), ...Object.keys(then)])].filter((f) => (hashes.get(f) ?? 'absent') !== (then[f] ?? 'absent')).sort() : null;
        for (const f of changed ?? []) moved.add(f);
        if (!e.scope || !now) rows.push({ name: e.name, ok: e.ok, state: 'unbound', changed: [], why: 'recorded without a scope: it cannot be shown to hold for these sources' });
        else if (e.scope.digest === now.digest) rows.push({ name: e.name, ok: e.ok, state: 'fresh', changed: [], why: `nothing among its ${now.files} files changed` });
        else {
            const inScope = new Set(now.list);
            const hit = (changed ?? []).filter((f) => inScope.has(f) || !hashes.has(f));
            rows.push({ name: e.name, ok: e.ok, state: 'decayed', changed: hit, why: hit.length ? `changed since it was measured: ${hit.slice(0, 4).join(', ')}${hit.length > 4 ? `, +${hit.length - 4}` : ''}` : 'its scope is not what it was when it was measured' });
        }
    }
    // only evidence that was recorded with a scope can vouch for a file; an unbound one covers nothing
    const covered = new Set([...latest.values()].filter((e) => e.scope && scopes[e.name]).flatMap((e) => scopes[e.name].list));
    return { rows, uncovered: [...moved].filter((f) => !covered.has(f)).sort(), rerun: rows.filter((r) => r.state !== 'fresh').map((r) => r.name), trust: rows.length ? +(rows.filter((r) => r.state === 'fresh').length / rows.length).toFixed(2) : 0 };
}
export function renderDecay(d) {
    return [
        ...d.rows.map((r) => `  ${r.state === 'fresh' ? '✓' : '✗'} ${r.name.padEnd(16)} ${r.state.padEnd(8)} ${r.why}`),
        ...d.uncovered.slice(0, 8).map((f) => `  ? ${f} changed and no check covers it — add it to a check's "covers", or accept the blind spot knowingly`),
        d.rerun.length ? `trust ${Math.round(d.trust * 100)}% — run again only: facet check ${d.rerun.join(' ')}` : `trust ${Math.round(d.trust * 100)}% — every proof still stands for these sources`,
    ].join('\n');
}

/** What an attestation says, without what merely counts events: this is what must be reproducible. */
const basisOf = (a, schema = PROOF_SCHEMA) => {
    const basis = { item: a.item, level: a.level, rules: a.rules, evidence: a.evidence, waivers: a.waivers, approvals: a.approvals, policy: a.policy };
    return schema >= 3 ? sha256(canon(basis)) : sha256(JSON.stringify(basis), 32);
};
/** The digest covers what the pack states. Signatures and witness records are statements about the digest, so they stand outside it. */
export const proofDigest = ({ digest: _ignored, signatures: _s, witnesses: _w, ...body }) => sha256(textOf(body, body.schemaVersion));

/** Builds the manifest of an item on the sources as they are now. */
export function createProof(root, events, item, { policy = DEFAULT_POLICY, checks = [], project = {}, ignore = [], include = [], declared = null, scopes = null, environment = null, calibration = null, now = new Date().toISOString() } = {}) {
    const source = sourceState(root, { ignore, include, only: declared });
    const digests = scopes ? Object.fromEntries(Object.entries(scopes).map(([k, v]) => [k, v.digest])) : null;
    const a = attest(events, item, { policy, checks, project, source: source.state, scopes: digests });
    const evidence = events.filter((e) => e.kind === 'evidence' && e.item === item).map((e) => ({ name: e.name, ok: e.ok, value: e.value ?? null, by: e.by ?? e.w ?? null, at: e.at, src: stateOf(e), env: e.env ?? null, receipt: e.receipt ?? null, current: !!stateOf(e) && stateOf(e) === source.state }));
    const body = { schemaVersion: PROOF_SCHEMA, item, createdAt: now, source, scopes: digests, policy: { hash: a.policy }, level: a.level, rules: a.rules, waivers: a.waivers, approvals: a.approvals, evidence, basis: basisOf(a), journalIntact: project.journalIntact ?? null,
        // where it was measured, and what says the guards it rests on catch anything
        environment: environment ? { digest: environment.digest, comparable: environment.comparable, node: environment.node, platform: `${environment.platform}/${environment.arch}`, facetkit: environment.facetkit, tools: environment.tools, locks: environment.locks, isolation: environment.isolation ?? null } : null, calibration };
    return { ...body, digest: proofDigest(body), signatures: [], witnesses: [] };
}

/**
 * VALID      the manifest is unedited, the sources are the ones it describes, the journal still says the same;
 * TAMPERED   the manifest was changed after it was written;
 * STALE      the sources moved on: the proof belongs to another state and must be made again;
 * DECAYED    the sources moved on, and only some checks are touched by it: `rerun` names them;
 * MISMATCH   the journal no longer supports what the manifest claims;
 * UNKNOWN    the journal could not be verified, so nothing can be confirmed.
 */
export function verifyProof(root, events, manifest, { policy = DEFAULT_POLICY, checks = [], project = {}, ignore = [], include = [], scopes = null, trust = null, requireSignature = false, environment = null, benchmark = null } = {}) {
    const reasons = [];
    const notes = [];
    if (manifest.schemaVersion !== PROOF_SCHEMA && manifest.schemaVersion !== LEGACY_PROOF_SCHEMA) return { status: 'MISMATCH', reasons: [`schema version ${manifest.schemaVersion}, this tool reads ${PROOF_SCHEMA} (and ${LEGACY_PROOF_SCHEMA} as legacy)`] };
    if (manifest.schemaVersion === LEGACY_PROOF_SCHEMA) notes.push(`legacy: schema ${LEGACY_PROOF_SCHEMA} — its digests are over JSON as written, not canonical JSON, and are checked by that rule; facet proof create makes a schema ${PROOF_SCHEMA} pack`);
    if (proofDigest(manifest) !== manifest.digest) return { status: 'TAMPERED', reasons: ['the manifest does not match its own digest'] };
    // who stands behind the pack: a digest alone is recomputable by whoever edited the file
    const authorship = judgeSignatures(manifest.digest, manifest.signatures ?? [], trust ?? { keys: [] }, { roles: ['witness', 'writer', 'releaser'] });
    if (authorship.bad) return { status: 'TAMPERED', reasons: ['a signature does not match the manifest: it was changed after signing, or the signature was taken from another pack'], authorship };
    if (requireSignature && !authorship.authentic) return { status: 'UNSIGNED', reasons: [`this project accepts only packs signed by a trusted key; this one is ${manifest.signatures?.length ? 'signed by a key the project does not trust' : 'not signed'}`], authorship };
    notes.push(authorship.authentic ? `signed by ${authorship.by.join(', ')}` : 'not signed by a trusted key: the digest shows the pack is whole, not who made it');
    if (project.journalIntact !== true) return { status: 'UNKNOWN', reasons: [project.journalIntact === false ? 'the journal is damaged' : 'the journal was not verified'], authorship };
    if (manifest.environment && environment) {
        const moved = environmentDiff(manifest.environment, environment);
        notes.push(moved.length ? `measured in another environment — ${moved.slice(0, 3).join('; ')}: the checks may not give the same answer here` : 'same environment as where it was measured');
    }
    if (manifest.calibration?.benchmark && benchmark) {
        const b = manifest.calibration.benchmark;
        if (benchmark.digest !== b.digest) reasons.push(`the guard benchmark it names (${b.digest.slice(0, 12)}) is not the one of this tool (${benchmark.digest.slice(0, 12)})`);
        else notes.push(`guards calibrated by benchmark ${b.digest.slice(0, 12)}: ${b.passed}/${b.total} cases`);
    } else if (!manifest.calibration?.benchmark) notes.push('names no guard benchmark: how much its checks can catch is not stated');
    // a pack over declared artifacts is checked against the same declaration, never against the whole tree
    const source = sourceState(root, { ignore, include, only: manifest.source.declared ?? null });
    if (source.state !== manifest.source.state) {
        const was = new Map(manifest.source.dirty.map((d) => [d.path, d.sha]));
        const moved = source.dirty.filter((d) => was.get(d.path) !== d.sha).map((d) => d.path);
        reasons.push(`sources changed since the proof was made (${manifest.source.state} → ${source.state})${moved.length ? `: ${moved.slice(0, 5).join(', ')}` : ''}`);
        if (!scopes || !manifest.scopes || !Object.keys(manifest.scopes).length) return { status: 'STALE', reasons, source };
        // dependency-aware: the proof falls only where a changed file is inside a check's scope
        const rerun = Object.keys(manifest.scopes).filter((name) => scopes[name]?.digest !== manifest.scopes[name]).sort();
        if (rerun.length) return { status: rerun.length === Object.keys(manifest.scopes).length ? 'STALE' : 'DECAYED', reasons: [...reasons, `run again: ${rerun.join(', ')}`], rerun, source };
        reasons.push('no check covers what changed: every recorded proof still stands');
    }
    const a = attest(events, manifest.item, { policy, checks, project, source: manifest.source.state, scopes: manifest.scopes ?? null });
    // old records are read, not rewritten: a proof made before 0.7.1 is legacy and its policy hash is checked by its own rule
    const legacy = LEGACY_POLICY_HASH.test(manifest.policy?.hash ?? '');
    if (legacy) {
        notes.push('legacy: made before 0.7.1 — its policy hash is 12 characters of SHA-1 and is checked by that rule; facet proof create makes a current one');
        if (legacyPolicyHash(policy) !== manifest.policy.hash) reasons.push('the policy is not the one the proof was made under');
    } else if (a.policy !== manifest.policy.hash) reasons.push('the policy is not the one the proof was made under');
    // the manifest's own statements are compared too: re-signing an edited manifest must not make it true
    if (basisOf(a, manifest.schemaVersion) !== manifest.basis || a.level !== manifest.level || textOf(a.rules, manifest.schemaVersion) !== textOf(manifest.rules, manifest.schemaVersion) || textOf(a.waivers, manifest.schemaVersion) !== textOf(manifest.waivers, manifest.schemaVersion)) reasons.push(`the journal now gives ${a.level}, the manifest says ${manifest.level}`);
    const real = reasons.filter((r) => !r.startsWith('sources changed') && !r.startsWith('no check covers'));
    // a second run of the checks on these sources that gave another answer outranks everything the journal says
    const w = witnessed(manifest, trust);
    if (w.against.length) reasons.push(`a second run on the same sources did not reproduce: ${w.against.join(', ')}`);
    else if (!real.length) {
        notes.push(
            w.level === 'independent'
                ? 'reproduced on another machine, in another environment, by a trusted witness'
                : w.level === 'rerun'
                  ? 'reproduced by a trusted witness on the same machine: repeatability, not independence'
                  : 'not reproduced by a trusted witness yet (facet proof witness): the verdict rests on the journal',
        );
    }
    for (const r of w.rejected) notes.push(`a witness record${r.by ? ` by ${r.by}` : ''} does not count: ${r.why}`);
    const level = provenLevel(a.level, w.level, trust?.source);
    if (level !== a.level)
        notes.push(
            w.level === 'independent'
                ? `${a.level} needs trust read from a commit; here .facet/trust.json is read outside git, so who added the witness's key cannot be checked: it stands at ${level}`
                : `${a.level} needs a reproduction by an independent witness — another machine, another environment (for example CI): until then it stands at ${level}`,
        );
    return { status: real.length || w.against.length ? 'MISMATCH' : 'VALID', reasons, notes, level, claimedLevel: a.level, source, authorship, witnessed: w, legacy };
}

export const proofPath = (work, item) => path.join(work, item, 'proof', 'manifest.json');
export function renderProof(manifest, verdict) {
    return [
        `${manifest.item}: ${manifest.level} · proof ${verdict ? verdict.status : 'created'} · sources ${manifest.source.state} (${manifest.source.files} files${manifest.source.commit ? `, commit ${manifest.source.commit.slice(0, 8)}` : ', no git'}${manifest.source.dirty.length ? `, ${manifest.source.dirty.length} uncommitted` : ''})`,
        ...manifest.rules.map((r) => `  ${r.pass ? '✓' : r.waived ? '~' : '✗'} L${r.level} ${r.id.padEnd(16)} ${r.got}`),
        ...(manifest.environment?.isolation ? [`  · made in isolation ${manifest.environment.isolation}${manifest.environment.isolation.startsWith('declared:') ? ' (declared by the project, not observed)' : ''}`] : []),
        ...manifest.evidence.filter((e) => !e.current).map((e) => `  ! evidence ${e.name} was measured on ${e.src ?? 'an unrecorded state'}, not on these sources`),
        ...(verdict?.reasons ?? []).map((r) => `  → ${r}`),
        ...(verdict?.notes ?? []).map((r) => `  · ${r}`),
        ...(manifest.witnesses ?? []).map((w) => `  · witnessed by ${w.by ?? 'an unnamed run'}: ${w.reproduced}/${w.total} checks gave the recorded answer${w.differs?.length ? ` — differs: ${w.differs.join(', ')}` : ''}`),
    ].join('\n');
}

// ---- a proof that travels: the pack, the journal it rests on and the policy it was judged by, in one file ----
export const BUNDLE_SCHEMA = 'facetkit-proof-bundle/2';
/** Bundles of 0.7 and before: the seal over JSON as written, events compared as written. Read, never written. */
export const LEGACY_BUNDLE_SCHEMA = 'facetkit-proof-bundle/1';
const bundleVersion = (b) => (b?.schema === BUNDLE_SCHEMA ? 2 : b?.schema === LEGACY_BUNDLE_SCHEMA ? 1 : 0);
const sealOf = ({ manifest, policy, checks, facts, events, segments }, version) => sha256(version >= 2 ? canon({ manifest, policy, checks, facts, events, segments }) : JSON.stringify({ manifest, policy, checks, facts, events, segments }));
/** `segments` is { name: [raw journal lines] }; `events` the merged journal as the exporting side read it. */
export function exportProof(manifest, events, { policy = DEFAULT_POLICY, checks = [], segments = {}, facts = {} } = {}) {
    const body = { schema: BUNDLE_SCHEMA, exportedAt: new Date().toISOString(), manifest, policy, checks, facts, events, segments };
    return { ...body, seal: sealOf(body, 2) };
}

/**
 * Verifies a bundle with nothing but the bundle: no project, no configuration, no trust in whoever made it.
 * With `root` the sources are compared too. Each step is reported; the status is the first that fails.
 */
export function verifyBundle(bundle, { root = null, ignore = [], trust = null } = {}) {
    const steps = [];
    const step = (name, ok, text) => steps.push({ name, ok, text });
    const version = bundleVersion(bundle);
    if (!version) return { status: 'MISMATCH', steps: [{ name: 'schema', ok: false, text: `not a ${BUNDLE_SCHEMA} file` }] };
    const { manifest, policy, checks, events, segments } = bundle;
    const facts = bundle.facts ?? {};
    step('seal', sealOf({ manifest, policy, checks, facts, events, segments }, version) === bundle.seal, version >= 2 ? 'the bundle is as it was exported' : 'the bundle is as it was exported (legacy bundle: sealed over JSON as written)');
    const knownPack = manifest?.schemaVersion === PROOF_SCHEMA || manifest?.schemaVersion === LEGACY_PROOF_SCHEMA;
    step('manifest', knownPack && proofDigest(manifest) === manifest.digest, knownPack ? 'the manifest matches its own digest' : `a pack of schema ${manifest?.schemaVersion}, this tool reads ${PROOF_SCHEMA} and ${LEGACY_PROOF_SCHEMA}`);
    if (trust) {
        const who = judgeSignatures(manifest.digest, manifest.signatures ?? [], trust);
        step('author', !who.bad && who.authentic, who.bad ? 'a signature does not match the manifest' : who.authentic ? `signed by ${who.by.join(', ')}` : 'not signed by a key you trust');
    }
    const names = Object.keys(segments ?? {});
    const broken = names.filter((n) => brokenLines(segments[n]) !== -1);
    step('journal', names.length > 0 && broken.length === 0, names.length ? (broken.length ? `the history was edited in ${broken.join(', ')}` : `${names.length} journal segment(s), every chain whole`) : 'the bundle carries no journal');
    // an event is the line it was written as; compared canonically, so a bundle re-serialised by another tool still matches
    const asText = (e) => (version >= 2 ? canon(e) : JSON.stringify(e));
    const carried = new Set(names.flatMap((n) => segments[n]).map((line) => {
        try {
            return asText(JSON.parse(line));
        } catch {
            return null;
        }
    }));
    const strangers = events.filter((e) => !carried.has(asText(e))).length;
    step('events', strangers === 0, strangers ? `${strangers} event(s) are not in the journal the bundle carries` : 'every event comes from the carried journal');
    const journalIntact = steps.every((x) => x.ok);
    // the journal's integrity is never taken from the exporter: it is what the steps above found
    const a = attest(events, manifest.item, { policy, checks, project: { ...facts, journalIntact }, source: manifest.source.state, scopes: manifest.scopes ?? null });
    const agrees = basisOf(a, manifest.schemaVersion) === manifest.basis && a.level === manifest.level && textOf(a.rules, manifest.schemaVersion) === textOf(manifest.rules, manifest.schemaVersion);
    step('verdict', agrees, agrees ? `recomputed from the journal: ${a.level}, as claimed` : `the journal gives ${a.level}, the manifest claims ${manifest.level}`);
    // witness records stand outside the digest: only a record signed by a key trusted in the witness role counts, for or against
    if (trust) {
        const w = witnessed(manifest, trust);
        step('witnesses', !w.against.length, w.against.length ? `a trusted witness did not reproduce: ${w.against.join(', ')}` : w.level ? `reproduced by a trusted witness (${w.level})` : `no trusted witness reproduced it${w.rejected.length ? ` (${w.rejected.length} record(s) do not count)` : ''}`);
    }
    let stale = false;
    if (root) {
        const now = sourceState(root, { ignore, only: manifest.source.declared ?? null });
        stale = now.state !== manifest.source.state;
        step('sources', !stale, stale ? `these sources (${now.state}) are not the ones that were proven (${manifest.source.state})` : 'the sources here are the ones that were proven');
    }
    const failed = steps.find((x) => !x.ok);
    const status = !failed ? 'VALID' : failed.name === 'sources' ? 'STALE' : failed.name === 'author' ? 'UNSIGNED' : ['seal', 'manifest', 'journal', 'events'].includes(failed.name) ? 'TAMPERED' : 'MISMATCH';
    return { status, level: a.level, item: manifest.item, steps, sourcesChecked: !!root };
}
export const renderBundle = (v) => [`proof bundle of ${v.item ?? '?'}: ${v.status}${v.status === 'VALID' ? ` — ${v.level}` : ''}${v.sourcesChecked ? '' : '  (sources not compared: pass --root to compare them)'}`, ...v.steps.map((x) => `  ${x.ok ? '✓' : '✗'} ${x.name.padEnd(9)} ${x.text}`)].join('\n');

// ---- an independent second measurement ------------------------------------------------------
/**
 * A witness does not read what the journal says a check answered: it runs the check again, itself,
 * on these sources, and compares. `runCheck(name)` returns { ok } or null when the check cannot be
 * run here. The record it returns is added to the pack; a witness that found a difference makes
 * the pack a MISMATCH however intact the journal is.
 */
export async function witness(manifest, names, runCheck, { by = null, source = null, environment = null, now = new Date().toISOString() } = {}) {
    const rows = [];
    for (const name of names) {
        const recorded = [...manifest.evidence].reverse().find((e) => e.name === name);
        const got = await runCheck(name);
        rows.push({ name, recorded: recorded ? recorded.ok : null, measured: got ? !!got.ok : null, same: !!recorded && !!got && recorded.ok === !!got.ok });
    }
    const ran = rows.filter((r) => r.measured !== null);
    return { by, at: now, digest: manifest.digest, src: source, sameSources: source === manifest.source.state, env: environment?.digest ?? null, host: environment?.host ?? null, total: ran.length, reproduced: ran.filter((r) => r.same).length, differs: ran.filter((r) => !r.same).map((r) => r.name), notRun: rows.filter((r) => r.measured === null).map((r) => r.name) };
}
/** What a witness signs: its record without the signature, as canonical JSON. */
export const witnessDigest = ({ signature: _signature, ...record }) => sha256(canon(record));

/**
 * Why a witness record cannot vouch for a pack, or null when it can. It must be signed, over this
 * record, by a key the project trusts in the `witness` role — and not by a key that signed the pack:
 * the author re-running its own checks shows repeatability, not a second opinion. The witnesses list
 * lies outside the pack's digest, so an unsigned record is anybody's claim.
 */
export function witnessProblem(w, manifest, trust = null) {
    if (!w.signature) return 'not signed';
    if ((manifest.signatures ?? []).some((s) => s.key === w.signature.key)) return 'signed by a key that also signed the pack';
    const j = judgeSignatures(witnessDigest(w), [w.signature], trust ?? { keys: [] }, { roles: ['witness'] });
    const state = j.rows[0]?.state;
    if (state === 'trusted') return null;
    return state === 'bad' ? 'its signature does not match the record (changed after signing)' : state === 'wrong-role' ? 'signed by a trusted key without the witness role' : 'signed by a key this project does not trust';
}

/**
 * How far a vouching record is from the pack: `independent` when it ran on another machine, in another
 * environment, than the pack was made in; otherwise `rerun` — the same checks again on the same
 * machine, which shows repeatability and nothing about the machine. A record or pack that does not say
 * where it ran is a rerun: independence is shown, not assumed.
 */
export const witnessLevelOf = (w, manifest) => {
    const at = manifest.environment ?? {};
    return w.host && at.host && w.host !== at.host && w.env && at.digest && w.env !== at.digest ? 'independent' : 'rerun';
};

/**
 * What witnesses add to a verdict. Only a record that can vouch (witnessProblem: signed by a trusted
 * witness that did not sign the pack) counts, whether it agrees or disagrees; every other record is
 * listed in `rejected` with its reason and changes nothing. `level` is the best of the agreeing ones —
 * `independent` or `rerun` (witnessLevelOf) — and null when none vouches or any disagrees.
 */
export function witnessed(manifest, trust = null) {
    const all = (manifest.witnesses ?? []).filter((w) => w.digest === manifest.digest);
    const against = all.filter((w) => w.sameSources && w.differs.length && !witnessProblem(w, manifest, trust));
    const rejected = all.map((w) => ({ by: w.by ?? null, at: w.at ?? null, why: witnessProblem(w, manifest, trust) })).filter((r) => r.why);
    const forIt = all.filter((w) => w.sameSources && !w.differs.length && w.total > 0 && !w.notRun.length && !witnessProblem(w, manifest, trust));
    const levels = forIt.map((w) => witnessLevelOf(w, manifest));
    const level = against.length || !levels.length ? null : levels.includes('independent') ? 'independent' : 'rerun';
    return { count: all.length, level, independent: level === 'independent', against: against.flatMap((w) => w.differs), rejected };
}

/** The level a verified pack stands at: L4 needs a reproduction by an independent witness; without one it stands at L3. */
// L4 needs an independent reproduction, and trust that can be checked against history: read from a commit,
// not from a file anybody with the folder could have edited (outside git, loadTrust marks it uncommitted)
export const provenLevel = (level, witnessLevel, trustSource = 'commit') => (level === LEVELS[4] && (witnessLevel !== 'independent' || trustSource === 'uncommitted') ? LEVELS[3] : level);
