// trace: the link between a written specification and the tests that verify it.
// A specification clause is a line that starts with an id (R1, AC-3, P07-R2) and may name how it
// will be verified: "(verify: test)". A test claims a clause by carrying its id as [R1] or @R1.
// The report answers three questions an agent cannot answer by reading: which clauses nothing
// verifies, which tests verify nothing that was asked for, and which clauses have no agreed method.
import fs from 'node:fs';
import { isTestFile } from './lang.mjs';
import path from 'node:path';

const ID = '(?:[A-Z][A-Z0-9]{0,5}-)?[A-Z]{1,4}-?\\d+(?:\\.\\d+)?';
const CLAUSE = new RegExp(`^\\s*(?:[-*+]\\s+|\\|\\s*|#{1,6}\\s+|\\d+[.)]\\s+)?(?:\\*\\*|\`|\\[)?(${ID})(?:\\*\\*|\`|\\])?\\s*(?::|—|–|\\||\\s-\\s)\\s*(.*)$`);
const REF = new RegExp(`(?:\\[(${ID})\\]|@(${ID})\\b)`, 'g');
export const METHODS = ['test', 'probe', 'measure', 'inspect', 'manual'];
const NEEDS_TEST = new Set(['test', 'probe', 'measure']);
const SKIP = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '.git']);
const TEST_FILE = { test: (f) => f.endsWith('.feature') || isTestFile(f) };

/** Clauses of a specification text: id, text, verification method (or null), line number. */
export function parseClauses(text) {
    const clauses = [];
    let fenced = false;
    text.split('\n').forEach((line, i) => {
        if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
        if (fenced) return;
        const m = CLAUSE.exec(line);
        if (!m || clauses.some((c) => c.id === m[1])) return;
        const method = /\(?\bverify:\s*([a-z]+)/i.exec(m[2])?.[1]?.toLowerCase() ?? null;
        clauses.push({ id: m[1], text: m[2].replace(/\s*\|?\s*\(?\bverify:.*$/i, '').replace(/\s*\|\s*$/, '').trim(), method, line: i + 1 });
    });
    return clauses;
}

/** Clause ids claimed by a test file, with the line of the first claim. */
export function parseRefs(text) {
    const refs = new Map();
    text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(REF)) if (!refs.has(m[1] ?? m[2])) refs.set(m[1] ?? m[2], i + 1);
    });
    return refs;
}

export function listTestFiles(root, dirs) {
    const out = [];
    const visit = (abs) => {
        for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
            const full = path.join(abs, entry.name);
            if (entry.isDirectory()) {
                if (!SKIP.has(entry.name) && !entry.name.startsWith('.')) visit(full);
            } else {
                const rel = path.relative(root, full).split(path.sep).join('/');
                if (TEST_FILE.test(rel)) out.push(rel);
            }
        }
    };
    for (const dir of dirs) {
        const abs = path.join(root, dir);
        if (!fs.existsSync(abs)) continue;
        if (fs.statSync(abs).isDirectory()) visit(abs);
        else out.push(dir.split(path.sep).join('/'));
    }
    return [...new Set(out)].sort();
}

/**
 * Compares clauses with the tests that claim them.
 *  uncovered — a clause to be verified by test, probe or measurement that no test claims;
 *  orphans   — an id claimed by a test that the specification does not contain;
 *  unplanned — a clause with no verification method (or an unknown one);
 *  unclaimed — test files that claim no clause at all (only among `scope`, if given).
 */
export function trace(root, { spec, tests, scope } = {}) {
    const clauses = spec.flatMap((file) => parseClauses(fs.readFileSync(path.join(root, file), 'utf-8')).map((c) => ({ ...c, file })));
    const ids = new Set(clauses.map((c) => c.id));
    const prefixes = new Set(clauses.map((c) => c.id.replace(/\d+(?:\.\d+)?$/, '')));
    const claims = new Map();
    const orphans = [];
    const unclaimed = [];
    const files = listTestFiles(root, tests);
    for (const file of files) {
        const refs = parseRefs(fs.readFileSync(path.join(root, file), 'utf-8'));
        let own = 0;
        for (const [id, line] of refs) {
            if (ids.has(id)) {
                claims.set(id, [...(claims.get(id) ?? []), `${file}:${line}`]);
                own++;
            } else if (prefixes.has(id.replace(/\d+(?:\.\d+)?$/, ''))) orphans.push({ id, at: `${file}:${line}` });
        }
        if (!own && (!scope || scope.includes(file))) unclaimed.push(file);
    }
    const unplanned = clauses.filter((c) => !METHODS.includes(c.method));
    const uncovered = clauses.filter((c) => (c.method === null || NEEDS_TEST.has(c.method)) && !claims.has(c.id));
    const byHand = clauses.filter((c) => c.method === 'inspect' || c.method === 'manual');
    return { clauses, claims: Object.fromEntries(claims), uncovered, orphans, unplanned, unclaimed, byHand, testFiles: files.length };
}

export function renderTrace(r, { plan = false } = {}) {
    const lines = [`clauses ${r.clauses.length} · claimed by a test ${Object.keys(r.claims).length} · uncovered ${r.uncovered.length} · orphan claims ${r.orphans.length} · without a method ${r.unplanned.length} · by hand ${r.byHand.length} · test files ${r.testFiles}`];
    for (const c of r.unplanned) lines.push(`  NO METHOD ${c.id} (${c.file}:${c.line}) — add "(verify: ${METHODS.join('|')})"`);
    if (!plan) for (const c of r.uncovered) lines.push(`  UNCOVERED ${c.id} (${c.file}:${c.line}) ${c.text.slice(0, 70)}`);
    if (!plan) for (const o of r.orphans) lines.push(`  ORPHAN    ${o.id} claimed at ${o.at} — not in the specification`);
    if (!plan && r.unclaimed.length) lines.push(`  NO CLAUSE ${r.unclaimed.slice(0, 6).join(', ')}${r.unclaimed.length > 6 ? `, … (${r.unclaimed.length})` : ''}`);
    for (const c of r.byHand) lines.push(`  BY HAND   ${c.id} (${c.method}) — needs an evidence line, not a test`);
    return lines.join('\n');
}
