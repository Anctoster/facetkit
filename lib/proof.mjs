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
//  proof pack    one manifest per item: the source state, the policy, every rule with its outcome,
//                the evidence with its origin, and a digest over all of it. It can be verified on
//                another clone: same sources and same journal give the same answer.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { attest, DEFAULT_POLICY } from './govern.mjs';
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

/** The state of the working tree: { state, files, commit, tree, dirty: [{ path, sha }], git }. */
export function sourceState(root, { ignore = [] } = {}) {
    const skip = [...RECORDS, ...ignore].map(glob);
    const listed = git(root, 'ls-files', '-co', '--exclude-standard', '-z');
    const inGit = listed.status === 0;
    const files = (inGit ? listed.stdout.split('\0').filter(Boolean) : walk(root)).map((f) => f.split(path.sep).join('/')).filter((f) => !skip.some((re) => re.test(f))).sort();
    const hashes = files.map((f) => {
        const abs = path.join(root, f);
        return [f, fs.existsSync(abs) && fs.statSync(abs).isFile() ? hashFile(abs) : 'absent'];
    });
    const state = sha(hashes.map(([f, h]) => `${f}:${h}`).join('\n'), 16);
    if (!inGit) return { state, files: files.length, commit: null, tree: null, dirty: [], git: false };
    const byPath = new Map(hashes);
    const dirty = git(root, 'status', '--porcelain', '-z').stdout.split('\0').filter(Boolean).map((l) => l.slice(3)).filter((f) => !skip.some((re) => re.test(f))).sort().map((f) => ({ path: f, sha: byPath.get(f) ?? 'absent' }));
    return { state, files: files.length, commit: git(root, 'rev-parse', 'HEAD').stdout.trim() || null, tree: git(root, 'rev-parse', 'HEAD^{tree}').stdout.trim() || null, dirty, git: true };
}

/** What an attestation says, without what merely counts events: this is what must be reproducible. */
const basisOf = (a) => sha(JSON.stringify({ item: a.item, level: a.level, rules: a.rules, evidence: a.evidence, waivers: a.waivers, approvals: a.approvals, policy: a.policy }), 16);
export const proofDigest = ({ digest: _ignored, ...body }) => sha(JSON.stringify(body), 16);

/** Builds the manifest of an item on the sources as they are now. */
export function createProof(root, events, item, { policy = DEFAULT_POLICY, checks = [], project = {}, ignore = [], now = new Date().toISOString() } = {}) {
    const source = sourceState(root, { ignore });
    const a = attest(events, item, { policy, checks, project, source: source.state });
    const evidence = events.filter((e) => e.kind === 'evidence' && e.item === item).map((e) => ({ name: e.name, ok: e.ok, value: e.value ?? null, by: e.by ?? e.w ?? null, at: e.at, src: e.src ?? null, current: !!e.src && e.src === source.state }));
    const body = { schemaVersion: PROOF_SCHEMA, item, createdAt: now, source, policy: { hash: a.policy }, level: a.level, rules: a.rules, waivers: a.waivers, approvals: a.approvals, evidence, basis: basisOf(a), journalIntact: project.journalIntact ?? null };
    return { ...body, digest: proofDigest(body) };
}

/**
 * VALID      the manifest is unedited, the sources are the ones it describes, the journal still says the same;
 * TAMPERED   the manifest was changed after it was written;
 * STALE      the sources moved on: the proof belongs to another state and must be made again;
 * MISMATCH   the journal no longer supports what the manifest claims;
 * UNKNOWN    the journal could not be verified, so nothing can be confirmed.
 */
export function verifyProof(root, events, manifest, { policy = DEFAULT_POLICY, checks = [], project = {}, ignore = [] } = {}) {
    const reasons = [];
    if (manifest.schemaVersion !== PROOF_SCHEMA) return { status: 'MISMATCH', reasons: [`schema version ${manifest.schemaVersion}, this tool reads ${PROOF_SCHEMA}`] };
    if (proofDigest(manifest) !== manifest.digest) return { status: 'TAMPERED', reasons: ['the manifest does not match its own digest'] };
    if (project.journalIntact !== true) return { status: 'UNKNOWN', reasons: [project.journalIntact === false ? 'the journal is damaged' : 'the journal was not verified'] };
    const source = sourceState(root, { ignore });
    if (source.state !== manifest.source.state) {
        const was = new Map(manifest.source.dirty.map((d) => [d.path, d.sha]));
        const moved = source.dirty.filter((d) => was.get(d.path) !== d.sha).map((d) => d.path);
        reasons.push(`sources changed since the proof was made (${manifest.source.state} → ${source.state})${moved.length ? `: ${moved.slice(0, 5).join(', ')}` : ''}`);
        return { status: 'STALE', reasons, source };
    }
    const a = attest(events, manifest.item, { policy, checks, project, source: manifest.source.state });
    if (a.policy !== manifest.policy.hash) reasons.push('the policy is not the one the proof was made under');
    // the manifest's own statements are compared too: re-signing an edited manifest must not make it true
    if (basisOf(a) !== manifest.basis || a.level !== manifest.level || JSON.stringify(a.rules) !== JSON.stringify(manifest.rules) || JSON.stringify(a.waivers) !== JSON.stringify(manifest.waivers)) reasons.push(`the journal now gives ${a.level}, the manifest says ${manifest.level}`);
    return { status: reasons.length ? 'MISMATCH' : 'VALID', reasons, level: a.level, source };
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
