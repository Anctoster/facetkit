// lang: what facetkit needs to know about a programming language, and nothing more.
// Per language: which files are sources and which are tests, what a file imports (with the names
// it takes), how an import is resolved to files of the project, what a file offers to others, and
// which single-line edits make a plausible bug. Parsing is by pattern on purpose: no dependency,
// no build step, and the same four questions answered for every language.
// Supported: JavaScript/TypeScript, Python, Go, Java.
import path from 'node:path';

const dirOf = (f) => path.posix.dirname(f);
const uniq = (xs) => [...new Set(xs)];

// ---- JavaScript / TypeScript ---------------------------------------------------------------
const JS_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const js = {
    id: 'js',
    ext: JS_EXT,
    isTest: (f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f) || /(^|\/)(__tests__|e2e)\//.test(f),
    imports(source) {
        const out = [];
        const flat = source.replace(/\n/g, ' ');
        for (const m of flat.matchAll(/import\s+(?:type\s+)?([^'"]+?)\s+from\s*['"]([^'"]+)['"]/g)) {
            const names = [];
            const braces = /\{([^}]*)\}/.exec(m[1]);
            if (braces) for (const part of braces[1].split(',')) if (part.trim()) names.push(part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim());
            for (const r of m[1].replace(/\{[^}]*\}/, '').split(',').map((s) => s.trim()).filter(Boolean)) names.push(r.startsWith('*') ? '*' : 'default');
            out.push({ spec: m[2], names });
        }
        for (const re of [/export\s[^'"]*?from\s*['"]([^'"]+)['"]/g, /import\s*['"]([^'"]+)['"]/g, /import\(\s*['"]([^'"]+)['"]\s*\)/g, /require\(\s*['"]([^'"]+)['"]\s*\)/g]) for (const m of source.matchAll(re)) if (!out.some((o) => o.spec === m[1])) out.push({ spec: m[1], names: [] });
        return out;
    },
    resolve(known, from, spec) {
        if (!spec.startsWith('.')) return [];
        const base = path.posix.normalize(path.posix.join(dirOf(from), spec));
        const stem = base.replace(/\.(js|mjs|cjs|jsx)$/, '');
        for (const c of [base, ...JS_EXT.map((e) => base + e), ...JS_EXT.map((e) => stem + e), ...JS_EXT.map((e) => `${base}/index${e}`)]) if (known.has(c)) return [c];
        return [];
    },
    exports(source) {
        const out = [];
        source.split('\n').forEach((line, i) => {
            const m = /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/.exec(line);
            if (m) out.push({ name: m[2], kind: m[1].replace('*', ''), line: i + 1 });
            else if (/^\s*export\s+default\b/.test(line)) out.push({ name: 'default', kind: 'default', line: i + 1 });
            const l = /^\s*export\s*(?:type\s*)?\{([^}]+)\}/.exec(line);
            if (l) for (const part of l[1].split(',')) {
                const name = part.trim().split(/\s+as\s+/).at(-1)?.trim();
                if (name) out.push({ name, kind: 'export', line: i + 1 });
            }
        });
        return out;
    },
    comment: '//',
    quotes: ['"', "'", '`'],
    skipLine: /^\s*(\/\/|\/\*|\*|import\b|export\s+(type|interface)\b|type\b|interface\b|}\s*$|$)/,
    operators: ['compare', 'logic', 'boolean', 'arith', 'number', 'negate', 'return', 'statement'],
};

// ---- Python --------------------------------------------------------------------------------
const py = {
    id: 'py',
    ext: ['.py'],
    isTest: (f) => /(^|\/)(test_[^/]+|[^/]+_test)\.py$/.test(f) || /(^|\/)tests?\/(?!__init__\.py$|conftest\.py$)[^/]+\.py$/.test(f),
    imports(source) {
        const out = [];
        const flat = source.replace(/\\\n/g, ' ').replace(/\(([^)]*)\)/g, (m) => m.replace(/\n/g, ' '));
        for (const line of flat.split('\n')) {
            const from = /^\s*from\s+(\.*[\w.]*)\s+import\s+(.+)$/.exec(line);
            if (from) {
                const names = from[2].replace(/[()]/g, '').split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
                out.push({ spec: from[1], names });
                continue;
            }
            const plain = /^\s*import\s+(.+)$/.exec(line);
            if (plain) for (const part of plain[1].split(',')) out.push({ spec: part.trim().split(/\s+as\s+/)[0], names: ['*'] });
        }
        return out;
    },
    /** A dotted module is looked up next to the importing file (relative) or under the roots. */
    resolve(known, from, spec, ctx = {}, names = []) {
        const dots = /^\.*/.exec(spec)[0].length;
        const parts = spec.slice(dots).split('.').filter(Boolean);
        let bases;
        if (dots) {
            let dir = dirOf(from);
            for (let i = 1; i < dots; i++) dir = dirOf(dir);
            bases = [dir === '.' ? '' : dir];
        } else bases = uniq(['', ...(ctx.roots ?? []), dirOf(from) === '.' ? '' : dirOf(from)]);
        const hits = [];
        for (const base of bases) {
            const stem = [base, ...parts].filter(Boolean).join('/');
            // `from package import module`: the modules themselves, and the package file only when a name is not a module
            const modules = names.map((n) => `${[stem, n].filter(Boolean).join('/')}.py`).filter((f) => known.has(f));
            hits.push(...modules);
            if (stem && known.has(`${stem}.py`)) hits.push(`${stem}.py`);
            else if (stem && known.has(`${stem}/__init__.py`) && (!names.length || modules.length < names.length)) hits.push(`${stem}/__init__.py`);
            if (hits.length) break;
        }
        return uniq(hits);
    },
    exports(source) {
        const out = [];
        source.split('\n').forEach((line, i) => {
            const m = /^(?:async\s+)?(def|class)\s+([A-Za-z]\w*)/.exec(line) ?? /^()([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=/.exec(line);
            if (m && !m[2].startsWith('_')) out.push({ name: m[2], kind: m[1] || 'const', line: i + 1 });
        });
        return out;
    },
    comment: '#',
    quotes: ['"', "'"],
    skipLine: /^\s*(#|import\b|from\b|def\b|class\b|@|"""|'''|$)/,
    operators: ['compare', 'py-logic', 'py-boolean', 'arith', 'number', 'py-negate', 'py-return'],
};

// ---- Go ------------------------------------------------------------------------------------
const go = {
    id: 'go',
    ext: ['.go'],
    isTest: (f) => /_test\.go$/.test(f),
    imports(source) {
        const out = [];
        for (const m of source.matchAll(/^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/gm)) out.push({ spec: m[1], names: ['*'] });
        for (const block of source.matchAll(/^\s*import\s*\(([\s\S]*?)\)/gm)) for (const m of block[1].matchAll(/"([^"]+)"/g)) out.push({ spec: m[1], names: ['*'] });
        return out;
    },
    /** A package path under the module (go.mod) is a directory: every non-test file in it. */
    resolve(known, from, spec, ctx = {}) {
        const mod = ctx.goModule;
        if (!mod || (spec !== mod && !spec.startsWith(`${mod}/`))) return [];
        const dir = [ctx.goRoot, spec.slice(mod.length + 1)].filter(Boolean).join('/');
        return [...known].filter((f) => f.endsWith('.go') && dirOf(f) === (dir || '.') && !go.isTest(f));
    },
    /** Files of one directory are one package: a test file reaches its siblings without importing them. */
    implicit: (known, from) => (go.isTest(from) ? [...known].filter((f) => f.endsWith('.go') && dirOf(f) === dirOf(from) && !go.isTest(f)) : []),
    exports(source) {
        const out = [];
        source.split('\n').forEach((line, i) => {
            const m = /^func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)\s*[([]/.exec(line) ?? /^(?:type|var|const)\s+([A-Z]\w*)/.exec(line);
            if (m) out.push({ name: m[1], kind: line.startsWith('func') ? 'func' : line.split(/\s+/)[0], line: i + 1 });
        });
        return out;
    },
    comment: '//',
    quotes: ['"', '`'],
    skipLine: /^\s*(\/\/|\/\*|\*|import\b|package\b|}\s*$|\)\s*$|$)/,
    // operators that keep the types intact: a mutant that does not compile would be "noticed" by the compiler, not by a test
    operators: ['compare', 'logic', 'boolean', 'arith-safe', 'number', 'negate'],
};

// ---- Java ----------------------------------------------------------------------------------
const java = {
    id: 'java',
    ext: ['.java'],
    isTest: (f) => /(Test|Tests|IT|TestCase)\.java$/.test(f) || /(^|\/)src\/test\//.test(f),
    imports(source) {
        return [...source.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+?)(\.\*)?\s*;/gm)].map((m) => ({ spec: m[1] + (m[2] ?? ''), names: [m[2] ? '*' : m[1].split('.').at(-1)] }));
    },
    /** `a.b.C` is a file ending in a/b/C.java under any source root; `a.b.*` is every file of that directory. */
    resolve(known, _from, spec) {
        const all = [...known].filter((f) => f.endsWith('.java'));
        if (spec.endsWith('.*')) {
            const dir = spec.slice(0, -2).replace(/\./g, '/');
            return all.filter((f) => dirOf(f) === dir || dirOf(f).endsWith(`/${dir}`));
        }
        const parts = spec.split('.');
        // a static import names a member: try the class one level up as well
        for (const p of [parts, parts.slice(0, -1)]) {
            const tail = `${p.join('/')}.java`;
            const hit = all.filter((f) => f === tail || f.endsWith(`/${tail}`));
            if (hit.length) return hit;
        }
        return [];
    },
    /** A test class reaches the class it is named after, and classes of its own package, without an import. */
    implicit(known, from) {
        if (!java.isTest(from)) return [];
        const pkg = dirOf(from).replace(/(^|.*\/)src\/test\/java\/?/, '');
        const name = path.posix.basename(from).replace(/(Test|Tests|IT|TestCase)\.java$/, '.java');
        return [...known].filter((f) => f.endsWith('.java') && !java.isTest(f) && path.posix.basename(f) === name && (dirOf(f) === pkg || dirOf(f).endsWith(`/${pkg}`) || !pkg));
    },
    exports(source) {
        const out = [];
        source.split('\n').forEach((line, i) => {
            const m = /^\s*public\s+(?:(?:static|final|abstract|sealed)\s+)*(class|interface|enum|record)\s+([A-Z]\w*)/.exec(line);
            if (m) out.push({ name: m[2], kind: m[1], line: i + 1 });
        });
        return out;
    },
    comment: '//',
    quotes: ['"', "'"],
    skipLine: /^\s*(\/\/|\/\*|\*|import\b|package\b|@|}\s*$|$)/,
    operators: ['compare', 'logic', 'boolean', 'arith-safe', 'number', 'negate'],
};

export const LANGS = [js, py, go, java];
export const ALL_EXT = LANGS.flatMap((l) => l.ext);
export const langOf = (file) => LANGS.find((l) => l.ext.includes(path.posix.extname(file))) ?? null;
export const isTestFile = (file) => langOf(file)?.isTest(file) ?? false;
