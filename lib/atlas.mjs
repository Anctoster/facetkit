// atlas: what an agent needs to know about code before reading it — built without a model.
// A syntax graph says what calls what. The atlas adds the facts that only history and the team's
// own records hold: which files change together although nothing links them (hidden coupling),
// which code is edited most and depended on most (hot spots), which tests stand behind a file,
// and it answers with a card of a fixed word budget instead of a graph to explore.
// Parsing is by pattern (JS/TS, Python, Go, Java — see lang.mjs); it trades depth for zero cost and zero setup.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { langOf } from './lang.mjs';
import { buildGraph, isTest, linksOf } from './seams.mjs';
import { wordCount } from './text.mjs';

/** Exported names of a JS/TS module with their kind and line (other languages: see lang.mjs). */
export const exportsOf = (source, file = 'x.ts') => langOf(file)?.exports(source) ?? [];
/** Which names a JS/TS module takes from which specifier. */
export const namedImports = (source, file = 'x.ts') => (langOf(file)?.imports(source) ?? []).filter((i) => i.names.length);

/** Commits per file and pairs of files that change together, from the last `commits` commits. */
export function history(root, known, { commits = 400, maxFiles = 25 } = {}) {
    const log = spawnSync('git', ['log', `-n${commits}`, '--name-only', '--format=%x00%h'], { cwd: root, encoding: 'utf-8' }).stdout ?? '';
    const churn = new Map();
    const pairs = new Map();
    for (const block of log.split('\u0000').slice(1)) {
        const files = block.split('\n').slice(1).filter((f) => known.has(f));
        for (const f of files) churn.set(f, (churn.get(f) ?? 0) + 1);
        if (files.length < 2 || files.length > maxFiles) continue;
        for (let i = 0; i < files.length; i++) for (let j = i + 1; j < files.length; j++) {
            const key = [files[i], files[j]].sort().join('\u0001');
            pairs.set(key, (pairs.get(key) ?? 0) + 1);
        }
    }
    return { churn, pairs };
}

export function buildAtlas(root, dirs, { withHistory = true } = {}) {
    const graph = buildGraph(root, dirs);
    const known = new Set(graph.files);
    const files = {};
    for (const file of graph.files) {
        const source = fs.readFileSync(path.join(root, file), 'utf-8');
        const uses = {};
        for (const link of linksOf(known, file, source, graph.ctx)) uses[link.target] = [...new Set([...(uses[link.target] ?? []), ...link.names])];
        files[file] = { lines: source.split('\n').length, exports: exportsOf(source, file), uses, test: isTest(file) };
    }
    const h = withHistory ? history(root, known) : { churn: new Map(), pairs: new Map() };
    const coupling = [];
    for (const [key, n] of h.pairs) {
        const [a, b] = key.split('\u0001');
        if (n < 3) continue;
        const linked = (graph.imports.get(a) ?? []).includes(b) || (graph.imports.get(b) ?? []).includes(a);
        coupling.push({ a, b, together: n, strength: +(n / Math.min(h.churn.get(a), h.churn.get(b))).toFixed(2), linked });
    }
    return { files, importers: Object.fromEntries(graph.importers), imports: Object.fromEntries(graph.imports), churn: Object.fromEntries(h.churn), coupling };
}

const testsBehind = (atlas, file) => {
    const direct = (atlas.importers[file] ?? []).filter((f) => atlas.files[f]?.test);
    const viaConsumers = (atlas.importers[file] ?? []).filter((f) => !atlas.files[f]?.test).flatMap((c) => (atlas.importers[c] ?? []).filter((f) => atlas.files[f]?.test));
    return { direct, indirect: [...new Set(viaConsumers)].filter((t) => !direct.includes(t)) };
};

/** Where a name is defined and who takes it. */
export function findSymbol(atlas, name) {
    return Object.entries(atlas.files).flatMap(([file, f]) => f.exports.filter((e) => e.name === name).map((e) => ({ file, line: e.line, kind: e.kind, users: Object.entries(atlas.files).filter(([, u]) => (u.uses[file] ?? []).some((n) => n === name || n === '*')).map(([u]) => u) })));
}

/** Shortest chain of imports between two files, in either direction. */
export function pathBetween(atlas, from, to) {
    const next = (f) => [...(atlas.imports[f] ?? []), ...(atlas.importers[f] ?? [])];
    const prev = new Map([[from, null]]);
    const queue = [from];
    while (queue.length) {
        const f = queue.shift();
        if (f === to) {
            const out = [];
            for (let x = to; x; x = prev.get(x)) out.unshift(x);
            return out;
        }
        for (const n of next(f)) if (!prev.has(n)) {
            prev.set(n, f);
            queue.push(n);
        }
    }
    return null;
}

/** Files that are edited often and depended on by many: where a mistake costs most. */
export function hotspots(atlas, n = 10) {
    return Object.keys(atlas.files).filter((f) => !atlas.files[f].test).map((file) => {
        const fanIn = (atlas.importers[file] ?? []).filter((f) => !atlas.files[f]?.test).length;
        const t = testsBehind(atlas, file);
        return { file, churn: atlas.churn[file] ?? 0, fanIn, tests: t.direct.length + t.indirect.length, score: (atlas.churn[file] ?? 0) * (1 + fanIn) };
    }).filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, n);
}

/** Pairs that change together with no import between them. */
export const hiddenCoupling = (atlas, min = 0.5) => atlas.coupling.filter((c) => !c.linked && c.strength >= min).sort((a, b) => b.strength - a.strength || b.together - a.together);

/**
 * The card for a set of files: what they offer, who uses what, which tests stand behind them,
 * what tends to change with them. Lines are dropped from the end of each file's block until the
 * whole card fits `budgetWords`.
 */
export function card(atlas, files, { budgetWords = 220, extra = {} } = {}) {
    const blocks = [];
    for (const file of files) {
        const f = atlas.files[file];
        if (!f) {
            blocks.push([`${file}: not in the atlas (outside the indexed directories, or not a JS/TS module)`]);
            continue;
        }
        const t = testsBehind(atlas, file);
        const users = (atlas.importers[file] ?? []).filter((u) => !atlas.files[u]?.test);
        const partners = hiddenCoupling(atlas, 0.4).filter((c) => c.a === file || c.b === file).map((c) => `${c.a === file ? c.b : c.a} (${c.together}×)`);
        const lines = [`${file} — ${f.lines} lines, changed in ${atlas.churn[file] ?? 0} commits, used by ${users.length} file(s)`];
        if (f.exports.length) lines.push(`  offers: ${f.exports.slice(0, 12).map((e) => `${e.name}:${e.line}`).join(', ')}${f.exports.length > 12 ? `, … (${f.exports.length})` : ''}`);
        for (const u of users.slice(0, 5)) lines.push(`  used by ${u}: ${(atlas.files[u].uses[file] ?? []).join(', ') || 'side effects only'}`);
        if (users.length > 5) lines.push(`  … and ${users.length - 5} more users`);
        lines.push(t.direct.length || t.indirect.length ? `  tests: ${[...t.direct, ...t.indirect.map((x) => `${x} (indirect)`)].slice(0, 4).join(', ')}` : '  tests: none reach this file');
        if (partners.length) lines.push(`  changes together with (no import between them): ${partners.slice(0, 3).join(', ')}`);
        for (const note of extra[file] ?? []) lines.push(`  ${note}`);
        blocks.push(lines);
    }
    const total = () => blocks.reduce((s, b) => s + wordCount(b.join(' ')), 0);
    let dropped = 0;
    while (total() > budgetWords) {
        const longest = blocks.filter((b) => b.length > 1).sort((a, b) => b.length - a.length)[0];
        if (!longest) break;
        longest.pop();
        dropped++;
    }
    return { text: blocks.map((b) => b.join('\n')).join('\n') + (dropped ? `\n(${dropped} line(s) left out to stay within ${budgetWords} words)` : ''), words: total(), dropped };
}

export function stats(atlas) {
    const files = Object.values(atlas.files);
    return { files: files.length, tests: files.filter((f) => f.test).length, exports: files.reduce((s, f) => s + f.exports.length, 0), edges: Object.values(atlas.imports).reduce((s, x) => s + x.length, 0), hidden: hiddenCoupling(atlas).length };
}
