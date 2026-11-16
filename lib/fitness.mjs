// fitness: architecture rules that a tool checks on every change — the shape the code is meant to
// keep, written down once and measured by the same import graph the atlas and the seams use.
//
//   { "id": "ui-not-server", "kind": "no-import", "from": "src/**", "to": "server/**" }
//   { "id": "layers", "kind": "layers", "order": ["src/pages/**", "src/components/**", "src/lib/**"] }
//   { "id": "no-cycles", "kind": "no-cycle", "within": "src/**" }
//   { "id": "small-modules", "kind": "max-lines", "files": "src/**", "max": 400 }
//   { "id": "narrow-api", "kind": "max-fan-in", "files": "src/lib/**", "max": 30 }
//   { "id": "server-tested", "kind": "tested", "files": "server/**" }
//
// A rule that is already broken on the day it is written would be ignored if it simply failed. So
// the check is a ratchet: today's violations are recorded as the baseline, a NEW violation fails,
// a violation that disappears is reported as fixed and leaves the baseline at the next `--accept`.
// The code may get better at any pace; it may not get worse.
import fs from 'node:fs';
import path from 'node:path';

const glob = (pattern) => new RegExp(`^${pattern.replace(/[.+^$()|[\]\\{}]/g, '\\$&').replace(/\*\*\//g, '§§/').replace(/\*\*/g, '§§').replace(/\*/g, '[^/]*').replaceAll('§§/', '(?:.*/)?').replaceAll('§§', '.*')}$`);
const matches = (pattern) => {
    const res = [].concat(pattern).map(glob);
    return (f) => res.some((re) => re.test(f));
};
export const KINDS = ['no-import', 'layers', 'no-cycle', 'max-lines', 'max-fan-in', 'tested'];

/** Cycles among `files` in the import graph (each reported once, by its smallest member). */
function cycles(graph, files) {
    const inside = new Set(files);
    const out = [];
    const index = new Map();
    const low = new Map();
    const stack = [];
    const on = new Set();
    let i = 0;
    const visit = (v) => { // Tarjan: strongly connected components
        index.set(v, i);
        low.set(v, i++);
        stack.push(v);
        on.add(v);
        for (const w of (graph.imports.get(v) ?? []).filter((x) => inside.has(x))) {
            if (!index.has(w)) {
                visit(w);
                low.set(v, Math.min(low.get(v), low.get(w)));
            } else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
        }
        if (low.get(v) === index.get(v)) {
            const comp = [];
            let w;
            do {
                w = stack.pop();
                on.delete(w);
                comp.push(w);
            } while (w !== v);
            if (comp.length > 1) out.push(comp.sort());
        }
    };
    for (const f of [...inside].sort()) if (!index.has(f)) visit(f);
    return out;
}

/** Violations of one rule: [{ rule, key, what }]. `key` is stable, so a baseline can name it. */
export function checkRule(rule, { graph, root, isTest = () => false }) {
    const files = graph.files;
    const out = [];
    const add = (key, what) => out.push({ rule: rule.id, key: `${rule.id}|${key}`, what });
    if (rule.kind === 'no-import') {
        const from = matches(rule.from);
        const to = matches(rule.to);
        for (const f of files.filter(from)) for (const d of (graph.imports.get(f) ?? []).filter(to)) add(`${f}>${d}`, `${f} imports ${d}`);
    } else if (rule.kind === 'layers') {
        const layer = (f) => rule.order.findIndex((p) => matches(p)(f));
        for (const f of files) {
            const lf = layer(f);
            if (lf < 0 || isTest(f)) continue;
            for (const d of graph.imports.get(f) ?? []) {
                const ld = layer(d);
                if (ld >= 0 && ld < lf) add(`${f}>${d}`, `${f} (layer ${lf + 1}) reaches up into ${d} (layer ${ld + 1})`);
            }
        }
    } else if (rule.kind === 'no-cycle') {
        for (const c of cycles(graph, files.filter(matches(rule.within ?? '**')))) add(c.join('+'), `import cycle: ${c.join(' → ')}`);
    } else if (rule.kind === 'max-lines') {
        for (const f of files.filter(matches(rule.files))) {
            const n = fs.readFileSync(path.join(root, f), 'utf-8').split('\n').length;
            if (n > rule.max) add(f, `${f} has ${n} lines (max ${rule.max})`);
        }
    } else if (rule.kind === 'max-fan-in') {
        for (const f of files.filter(matches(rule.files))) {
            const n = (graph.importers.get(f) ?? []).filter((x) => !isTest(x)).length;
            if (n > rule.max) add(f, `${f} is imported by ${n} modules (max ${rule.max})`);
        }
    } else if (rule.kind === 'tested') {
        for (const f of files.filter(matches(rule.files)).filter((x) => !isTest(x))) {
            const users = graph.importers.get(f) ?? [];
            const reached = users.some(isTest) || users.some((u) => (graph.importers.get(u) ?? []).some(isTest));
            if (!reached) add(f, `${f}: no test reaches it`);
        }
    } else throw new Error(`fitness rule ${rule.id}: unknown kind "${rule.kind}" (one of: ${KINDS.join(', ')})`);
    return out;
}

/** All rules against the baseline: { rows: per rule, fresh: new violations, fixed: baseline keys gone, held: still there }. */
export function checkFitness(rules, { graph, root, isTest, baseline = [] }) {
    const all = rules.flatMap((r) => checkRule(r, { graph, root, isTest }));
    const known = new Set(baseline);
    const now = new Set(all.map((v) => v.key));
    const ruleIds = new Set(rules.map((r) => r.id));
    return {
        rows: rules.map((r) => ({ id: r.id, kind: r.kind, violations: all.filter((v) => v.rule === r.id).length, fresh: all.filter((v) => v.rule === r.id && !known.has(v.key)).length })),
        fresh: all.filter((v) => !known.has(v.key)),
        held: all.filter((v) => known.has(v.key)),
        fixed: baseline.filter((k) => !now.has(k) && ruleIds.has(k.split('|')[0])),
        keys: [...now].sort(),
    };
}
export function renderFitness(r) {
    return [
        ...r.rows.map((x) => `  ${x.fresh ? '✗' : '✓'} ${x.id.padEnd(22)} ${x.kind.padEnd(11)} ${x.violations} violation(s)${x.fresh ? `, ${x.fresh} NEW` : x.violations ? ' (all in the baseline)' : ''}`),
        ...r.fresh.slice(0, 12).map((v) => `    new: ${v.what}`),
        ...(r.fixed.length ? [`  fixed since the baseline: ${r.fixed.length} — facet fitness --accept records the better state`] : []),
        r.fresh.length ? `fitness: ${r.fresh.length} new violation(s) — the code may get better at any pace; it may not get worse` : `fitness: no new violations${r.held.length ? ` (${r.held.length} known ones remain)` : ''}`,
    ].join('\n');
}
