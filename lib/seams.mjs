// seams: where a vertical slice touches the rest of the system. Tests written for one slice
// pass in isolation; defects live on the seams. This module builds the import graph and answers:
// who consumes the files I changed, and which tests outside my slice cover those consumers.
import fs from 'node:fs';
import path from 'node:path';

import { ALL_EXT, isTestFile, langOf } from './lang.mjs';

const SKIP = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '.git', 'vendor', 'target', '__pycache__', '.venv', 'venv']);
export const isTest = isTestFile;

export function listSources(root, dirs) {
    const out = [];
    const visit = (abs) => {
        for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (!SKIP.has(entry.name) && !entry.name.startsWith('.')) visit(path.join(abs, entry.name));
            } else if (ALL_EXT.includes(path.extname(entry.name))) out.push(path.relative(root, path.join(abs, entry.name)).split(path.sep).join('/'));
        }
    };
    for (const dir of dirs) if (fs.existsSync(path.join(root, dir))) visit(path.join(root, dir));
    return [...new Set(out)].sort();
}

/** Import specifiers of a JS/TS source (kept for callers that need only the strings). */
export const importsOf = (source) => langOf('x.js').imports(source).map((i) => i.spec);
/** The file a JS/TS import resolves to, or null. */
export const resolve = (known, from, spec) => langOf(from)?.resolve(known, from, spec)[0] ?? null;

/** What the resolvers need to know about the project: the Go module and where it lives, Python source roots. */
export function projectContext(root, dirs = []) {
    const ctx = { roots: [...new Set(['src', ...dirs])] };
    for (const base of ['', ...dirs]) {
        const mod = path.join(root, base, 'go.mod');
        if (!fs.existsSync(mod)) continue;
        ctx.goModule = /^module\s+(\S+)/m.exec(fs.readFileSync(mod, 'utf-8'))?.[1];
        ctx.goRoot = base;
        break;
    }
    return ctx;
}

/** Every import of a file resolved to project files, with the names taken: [{ target, names }]. */
export function linksOf(known, file, source, ctx) {
    const lang = langOf(file);
    if (!lang) return [];
    const out = [];
    for (const imp of lang.imports(source)) for (const target of lang.resolve(known, file, imp.spec, ctx, imp.names)) if (target !== file) out.push({ target, names: imp.names });
    for (const target of lang.implicit?.(known, file) ?? []) if (target !== file) out.push({ target, names: ['*'] });
    return out;
}

/** { imports: file → [files], importers: file → [files] } for all sources under `dirs`. */
export function buildGraph(root, dirs) {
    const files = listSources(root, dirs);
    const known = new Set(files);
    const ctx = projectContext(root, dirs);
    const imports = new Map();
    const importers = new Map(files.map((f) => [f, []]));
    for (const file of files) {
        const targets = [...new Set(linksOf(known, file, fs.readFileSync(path.join(root, file), 'utf-8'), ctx).map((l) => l.target))];
        imports.set(file, targets);
        for (const t of targets) importers.get(t).push(file);
    }
    return { files, imports, importers, ctx };
}

/**
 * For changed files: the seams (consumers and providers one step away), every file that depends
 * on them within `depth` steps, and the tests among those that are not the slice's own tests.
 */
export function neighbours(graph, changed, { depth = 2, own = [] } = {}) {
    const inGraph = changed.filter((f) => graph.importers.has(f));
    const seen = new Map(inGraph.map((f) => [f, 0]));
    let frontier = inGraph;
    for (let d = 1; d <= depth; d++) {
        const next = [];
        for (const file of frontier) for (const up of graph.importers.get(file) ?? []) if (!seen.has(up)) {
            seen.set(up, d);
            next.push(up);
        }
        frontier = next;
    }
    const dependents = [...seen.keys()].filter((f) => !inGraph.includes(f));
    const consumers = [...new Set(inGraph.flatMap((f) => graph.importers.get(f)))].filter((f) => !inGraph.includes(f) && !isTest(f));
    const providers = [...new Set(inGraph.flatMap((f) => graph.imports.get(f)))].filter((f) => !inGraph.includes(f));
    const ownSet = new Set(own);
    const tests = dependents.filter((f) => isTest(f) && !ownSet.has(f)).sort();
    const untested = consumers.filter((c) => ![...(graph.importers.get(c) ?? [])].some(isTest) && !tests.some((t) => (graph.imports.get(t) ?? []).includes(c)));
    return { changed: inGraph, unknown: changed.filter((f) => !graph.importers.has(f)), consumers: consumers.sort(), providers: providers.sort(), neighbourTests: tests, untestedConsumers: untested.sort() };
}
