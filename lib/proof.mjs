// proof: a result is trusted for the exact state of the sources it was checked on, and for no other.
//
//  source state  one hash over the content of every file of the working tree that git would track
//                (tracked and untracked, minus ignored paths and the team's own records). It does
//                not change when the same content is committed, and it changes with any edit —
//                a commit hash alone would miss an edit made after the commit.
//  evidence      carries the source state it was measured on (`src`). When the tree moves on, that
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
import { attest, DEFAULT_POLICY } from './govern.mjs';
import { brokenLines } from './journal.mjs';
import { sha } from './text.mjs';

export const PROOF_SCHEMA = 1;
/** Paths that are records about the work, not the work: they change with every event and prove nothing about the product. */
export const RECORDS = ['.work/**', '.facet/**', 'facet-board.html', 'node_modules/**', '.git/**'];
const glob = (pattern) => new RegExp(`^${pattern.replace(/[.+^$()|[\]\\{}]/g, '\\$&').replace(/\*\*/g, '§§').replace(/\*/g, '[^/]*').replaceAll('§§', '.*')}$`);
const git = (root, ...args) => spawnSync('git', args, { cwd: root, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
const hashFile = (abs) => crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex').slice(0, 16);

function walk(root, dir = '') {
    const out = [];
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            if (entry.name !== '.git' && entry.name !== 'node_modules') out.push(...walk(root, rel));
        } else if (entry.isFile()) out.push(rel);
    }
    return out;
}

/**
 * Content hash of every source file: Map path → hash. With `cache` (a file path) a file whose size
 * and modification time are unchanged is not read again — on a large tree this is the whole cost.
 */
export function fileHashes(root, { ignore = [], cache = null } = {}) {
    const skip = [...RECORDS, ...ignore].map(glob);
    const listed = git(root, 'ls-files', '-co', '--exclude-standard', '-z');
    const inGit = listed.status === 0;
    const files = (inGit ? listed.stdout.split('\0').filter(Boolean) : walk(root)).map((f) => f.split(path.sep).join('/')).filter((f) => !skip.some((re) => re.test(f))).sort();
    let known = {};
    if (cache && fs.existsSync(cache)) {
        try {
            known = JSON.parse(fs.readFileSync(cache, 'utf-8'));
        } catch {
            known = {}; // a damaged cache costs time, never correctness
        }
    }
    const fresh = {};
    const out = new Map();
    for (const f of files) {
        const abs = path.join(root, f);
        const st = fs.existsSync(abs) ? fs.statSync(abs) : null;
        if (!st?.isFile()) {
            out.set(f, 'absent');
            continue;
        }
        const k = known[f];
        const h = k && k.size === st.size && k.mtimeMs === st.mtimeMs ? k.sha : hashFile(abs);
        fresh[f] = { size: st.size, mtimeMs: st.mtimeMs, sha: h };
        out.set(f, h);
    }
    if (cache) {
        fs.mkdirSync(path.dirname(cache), { recursive: true });
        fs.writeFileSync(cache, JSON.stringify(fresh));
    }
    return Object.assign(out, { inGit });
}
const digestOfHashes = (pairs) => sha(pairs.map(([f, h]) => `${f}:${h}`).join('\n'), 16);

/** The state of the working tree: { state, files, commit, tree, dirty: [{ path, sha }], git }. */
export function sourceState(root, { ignore = [], cache = null, hashes = null } = {}) {
    const skip = [...RECORDS, ...ignore].map(glob);
    const map = hashes ?? fileHashes(root, { ignore, cache });
    const state = digestOfHashes([...map]);
    if (!map.inGit) return { state, files: map.size, commit: null, tree: null, dirty: [], git: false };
    const dirty = git(root, 'status', '--porcelain', '-z').stdout.split('\0').filter(Boolean).map((l) => l.slice(3)).filter((f) => !skip.some((re) => re.test(f))).sort().map((f) => ({ path: f, sha: map.get(f) ?? 'absent' }));
    return { state, files: map.size, commit: git(root, 'rev-parse', 'HEAD').stdout.trim() || null, tree: git(root, 'rev-parse', 'HEAD^{tree}').stdout.trim() || null, dirty, git: true };
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
        const then = e.src ? snapshotOf(e.src) : null;
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
const basisOf = (a) => sha(JSON.stringify({ item: a.item, level: a.level, rules: a.rules, evidence: a.evidence, waivers: a.waivers, approvals: a.approvals, policy: a.policy }), 16);
export const proofDigest = ({ digest: _ignored, ...body }) => sha(JSON.stringify(body), 16);

/** Builds the manifest of an item on the sources as they are now. */
export function createProof(root, events, item, { policy = DEFAULT_POLICY, checks = [], project = {}, ignore = [], scopes = null, now = new Date().toISOString() } = {}) {
    const source = sourceState(root, { ignore });
    const digests = scopes ? Object.fromEntries(Object.entries(scopes).map(([k, v]) => [k, v.digest])) : null;
    const a = attest(events, item, { policy, checks, project, source: source.state, scopes: digests });
    const evidence = events.filter((e) => e.kind === 'evidence' && e.item === item).map((e) => ({ name: e.name, ok: e.ok, value: e.value ?? null, by: e.by ?? e.w ?? null, at: e.at, src: e.src ?? null, current: !!e.src && e.src === source.state }));
    const body = { schemaVersion: PROOF_SCHEMA, item, createdAt: now, source, scopes: digests, policy: { hash: a.policy }, level: a.level, rules: a.rules, waivers: a.waivers, approvals: a.approvals, evidence, basis: basisOf(a), journalIntact: project.journalIntact ?? null };
    return { ...body, digest: proofDigest(body) };
}

/**
 * VALID      the manifest is unedited, the sources are the ones it describes, the journal still says the same;
 * TAMPERED   the manifest was changed after it was written;
 * STALE      the sources moved on: the proof belongs to another state and must be made again;
 * DECAYED    the sources moved on, and only some checks are touched by it: `rerun` names them;
 * MISMATCH   the journal no longer supports what the manifest claims;
 * UNKNOWN    the journal could not be verified, so nothing can be confirmed.
 */
export function verifyProof(root, events, manifest, { policy = DEFAULT_POLICY, checks = [], project = {}, ignore = [], scopes = null } = {}) {
    const reasons = [];
    if (manifest.schemaVersion !== PROOF_SCHEMA) return { status: 'MISMATCH', reasons: [`schema version ${manifest.schemaVersion}, this tool reads ${PROOF_SCHEMA}`] };
    if (proofDigest(manifest) !== manifest.digest) return { status: 'TAMPERED', reasons: ['the manifest does not match its own digest'] };
    if (project.journalIntact !== true) return { status: 'UNKNOWN', reasons: [project.journalIntact === false ? 'the journal is damaged' : 'the journal was not verified'] };
    const source = sourceState(root, { ignore });
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
    if (a.policy !== manifest.policy.hash) reasons.push('the policy is not the one the proof was made under');
    // the manifest's own statements are compared too: re-signing an edited manifest must not make it true
    if (basisOf(a) !== manifest.basis || a.level !== manifest.level || JSON.stringify(a.rules) !== JSON.stringify(manifest.rules) || JSON.stringify(a.waivers) !== JSON.stringify(manifest.waivers)) reasons.push(`the journal now gives ${a.level}, the manifest says ${manifest.level}`);
    const real = reasons.filter((r) => !r.startsWith('sources changed') && !r.startsWith('no check covers'));
    return { status: real.length ? 'MISMATCH' : 'VALID', reasons, level: a.level, source };
}

export const proofPath = (work, item) => path.join(work, item, 'proof', 'manifest.json');
export function renderProof(manifest, verdict) {
    return [
        `${manifest.item}: ${manifest.level} · proof ${verdict ? verdict.status : 'created'} · sources ${manifest.source.state} (${manifest.source.files} files${manifest.source.commit ? `, commit ${manifest.source.commit.slice(0, 8)}` : ', no git'}${manifest.source.dirty.length ? `, ${manifest.source.dirty.length} uncommitted` : ''})`,
        ...manifest.rules.map((r) => `  ${r.pass ? '✓' : r.waived ? '~' : '✗'} L${r.level} ${r.id.padEnd(16)} ${r.got}`),
        ...manifest.evidence.filter((e) => !e.current).map((e) => `  ! evidence ${e.name} was measured on ${e.src ?? 'an unrecorded state'}, not on these sources`),
        ...(verdict?.reasons ?? []).map((r) => `  → ${r}`),
    ].join('\n');
}

// ---- a proof that travels: the pack, the journal it rests on and the policy it was judged by, in one file ----
export const BUNDLE_SCHEMA = 'facetkit-proof-bundle/1';
/** `segments` is { name: [raw journal lines] }; `events` the merged journal as the exporting side read it. */
export function exportProof(manifest, events, { policy = DEFAULT_POLICY, checks = [], segments = {}, facts = {} } = {}) {
    const body = { schema: BUNDLE_SCHEMA, exportedAt: new Date().toISOString(), manifest, policy, checks, facts, events, segments };
    return { ...body, seal: sha(JSON.stringify({ manifest, policy, checks, facts, events, segments }), 16) };
}

/**
 * Verifies a bundle with nothing but the bundle: no project, no configuration, no trust in whoever made it.
 * With `root` the sources are compared too. Each step is reported; the status is the first that fails.
 */
export function verifyBundle(bundle, { root = null, ignore = [] } = {}) {
    const steps = [];
    const step = (name, ok, text) => steps.push({ name, ok, text });
    if (bundle?.schema !== BUNDLE_SCHEMA) return { status: 'MISMATCH', steps: [{ name: 'schema', ok: false, text: `not a ${BUNDLE_SCHEMA} file` }] };
    const { manifest, policy, checks, events, segments } = bundle;
    const facts = bundle.facts ?? {};
    step('seal', sha(JSON.stringify({ manifest, policy, checks, facts, events, segments }), 16) === bundle.seal, 'the bundle is as it was exported');
    step('manifest', proofDigest(manifest) === manifest.digest, 'the manifest matches its own digest');
    const names = Object.keys(segments ?? {});
    const broken = names.filter((n) => brokenLines(segments[n]) !== -1);
    step('journal', names.length > 0 && broken.length === 0, names.length ? (broken.length ? `the history was edited in ${broken.join(', ')}` : `${names.length} journal segment(s), every chain whole`) : 'the bundle carries no journal');
    const carried = new Set(names.flatMap((n) => segments[n]));
    const strangers = events.filter((e) => !carried.has(JSON.stringify(e))).length;
    step('events', strangers === 0, strangers ? `${strangers} event(s) are not in the journal the bundle carries` : 'every event comes from the carried journal');
    const journalIntact = steps.every((x) => x.ok);
    // the journal's integrity is never taken from the exporter: it is what the steps above found
    const a = attest(events, manifest.item, { policy, checks, project: { ...facts, journalIntact }, source: manifest.source.state, scopes: manifest.scopes ?? null });
    const agrees = basisOf(a) === manifest.basis && a.level === manifest.level && JSON.stringify(a.rules) === JSON.stringify(manifest.rules);
    step('verdict', agrees, agrees ? `recomputed from the journal: ${a.level}, as claimed` : `the journal gives ${a.level}, the manifest claims ${manifest.level}`);
    let stale = false;
    if (root) {
        const now = sourceState(root, { ignore });
        stale = now.state !== manifest.source.state;
        step('sources', !stale, stale ? `these sources (${now.state}) are not the ones that were proven (${manifest.source.state})` : 'the sources here are the ones that were proven');
    }
    const failed = steps.find((x) => !x.ok);
    const status = !failed ? 'VALID' : failed.name === 'sources' ? 'STALE' : ['seal', 'manifest', 'journal', 'events'].includes(failed.name) ? 'TAMPERED' : 'MISMATCH';
    return { status, level: a.level, item: manifest.item, steps, sourcesChecked: !!root };
}
export const renderBundle = (v) => [`proof bundle of ${v.item ?? '?'}: ${v.status}${v.status === 'VALID' ? ` — ${v.level}` : ''}${v.sourcesChecked ? '' : '  (sources not compared: pass --root to compare them)'}`, ...v.steps.map((x) => `  ${x.ok ? '✓' : '✗'} ${x.name.padEnd(9)} ${x.text}`)].join('\n');
