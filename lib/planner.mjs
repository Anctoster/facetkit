// planner: responsibility is settled before the work starts, and the route is as long as the task
// is risky — not longer, and never shorter than safety allows.
//
// From the files a task will touch the planner derives, without a model:
//   who      the owner of every file; files nobody owns and files two agents claim stop the plan;
//   what     a class per file (security, api, code, test, style, docs, config, ops);
//   how far  the files that depend on the touched ones, and the tests among them;
//   risk     a score from class, reach and size, with the reasons spelled out;
//   route    which optional agents the flow needs, which steps it can skip, which gates are locked.
//
// Two rules keep the saving honest. A locked gate (security) cannot be removed by any option, and
// the judging step is never skipped. And the planner only shortens a route when it can say why:
// every agent it leaves out is listed with the reason, so a wrong saving is visible in the record.
import { isTestFile } from './lang.mjs';
import { checkOwners } from './ownership.mjs';
import { neighbours } from './seams.mjs';

const glob = (pattern) => new RegExp(`^${pattern.replace(/[.+^$()|[\]\\{}]/g, '\\$&').replace(/\*\*\//g, '§/').replace(/\*\*/g, '§§').replace(/\*/g, '[^/]*').replaceAll('§/', '(?:.*/)?').replaceAll('§§', '.*')}$`, 'i');

export const DEFAULT_PLANNING = {
    // first matching class wins; "security" is tried first on purpose
    classes: [
        { tag: 'security', patterns: ['**/auth/**', '**/*auth*', '**/*login*', '**/*session*', '**/*secret*', '**/*crypt*', '**/*token*', '**/*password*', '**/*permission*', '**/*acl*', '**/security/**', '**/*.pem', '**/.env*'] },
        { tag: 'ops', patterns: ['.github/**', '**/Dockerfile*', '**/*.tf', 'deploy/**', '**/migrations/**', '**/*.sql'] },
        { tag: 'style', patterns: ['**/*.css', '**/*.scss', '**/*.less', '**/*.svg'] },
        { tag: 'docs', patterns: ['**/*.md', '**/*.mdx', '**/*.txt', 'docs/**', 'LICENSE*'] },
        { tag: 'config', patterns: ['**/*.json', '**/*.yml', '**/*.yaml', '**/*.toml', '**/*.ini'] },
    ],
    gates: { security: 'security-auditor' },   // the agent that must review anything classed "security"
    weights: { security: 6, ops: 3, api: 3, code: 1, config: 1, test: 0.5, style: 0.25, docs: 0 },
    thresholds: { high: 8, normal: 2, architectDependents: 5, architectFiles: 8 },
    skippable: { docs: ['map', 'red', 'green'], style: ['red', 'green'] }, // steps a pure docs / pure style change does not need
};

export function classify(file, { planning = DEFAULT_PLANNING, graph = null } = {}) {
    const f = file.split('\\').join('/');
    for (const c of planning.classes) if (c.patterns.some((p) => glob(p).test(f))) return c.tag;
    if (isTestFile(f)) return 'test';
    // a source file that other files import is somebody's interface
    return (graph?.importers.get(f) ?? []).some((x) => !isTestFile(x)) ? 'api' : 'code';
}

/** Files a task names or plausibly means: explicit paths first, then paths and symbols sharing its words. */
export function discover(task, files, { symbols = new Map(), limit = 12 } = {}) {
    const text = String(task);
    const full = files.filter((f) => text.includes(f));
    // a bare file name counts only when it can mean one file
    const base = files.filter((f) => !full.includes(f) && new RegExp(`(^|[\\s"'(/])${f.split('/').pop().replace(/[.+^$()|[\]\\{}*?]/g, '\\$&')}($|[\\s"'),.:;])`).test(text));
    const named = [...full, ...(full.length ? [] : base.filter((f) => base.filter((g) => g.split('/').pop() === f.split('/').pop()).length === 1))];
    const words = [...new Set(text.toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter((w) => w.length > 3))];
    const scored = files.filter((f) => !named.includes(f)).map((f) => {
        const parts = f.toLowerCase().split(/[/._-]+/);
        const syms = (symbols.get(f) ?? []).map((x) => x.toLowerCase());
        const score = words.reduce((n, w) => n + (parts.includes(w) ? 2 : parts.some((p) => p.length > 3 && (p.includes(w) || w.includes(p))) ? 1 : 0) + (syms.some((x) => x === w) ? 2 : syms.some((x) => x.includes(w)) ? 1 : 0), 0);
        return { file: f, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
    return { named, candidates: scored.slice(0, limit), certain: named.length > 0 };
}

/**
 * The plan for a set of files. `flow` is the team's flow, `owners` the ownership manifest (or null).
 * strategy: "adaptive" (default) | "by-class" (ignores the graph) | "fixed" (every optional agent, always) —
 * the other two exist so that the adaptive one can be compared with them, not to be used.
 */
export function planRoute(files, { graph = null, owners = null, flow, planning = DEFAULT_PLANNING, strategy = 'adaptive' } = {}) {
    const list = [...new Set(files.map((f) => f.split('\\').join('/')))].sort();
    const useGraph = strategy === 'adaptive' ? graph : null;
    const rows = list.map((file) => ({ file, tag: classify(file, { planning, graph: useGraph }) }));
    const tags = new Set(rows.map((r) => r.tag));
    const n = useGraph ? neighbours(useGraph, list, { depth: 3 }) : { consumers: [], neighbourTests: [], untestedConsumers: [], providers: [] };
    const dependents = n.consumers.length;
    const own = owners ? checkOwners(list, owners) : null;
    const ownerCount = own ? Object.keys(own.byOwner).length : 0;
    const w = planning.weights;
    const score = +(rows.reduce((s, r) => s + (w[r.tag] ?? 1), 0) + Math.log2(dependents + 1) * (tags.has('api') || tags.has('security') ? 1.5 : 0.5) + Math.max(0, ownerCount - 1) * 2).toFixed(1);
    const t = planning.thresholds;
    const level = tags.has('security') || score >= t.high ? 'high' : score >= t.normal ? 'normal' : 'low';
    const reasons = [];
    const optional = [...new Set(flow.steps.filter((s) => s.optional).map((s) => s.agent))];
    const want = new Map(); // agent → why it is on the route
    const pure = (tag) => rows.every((r) => r.tag === tag);
    const only = (...allowed) => rows.every((r) => allowed.includes(r.tag));
    if (strategy === 'fixed') for (const a of optional) want.set(a, 'fixed route: every agent, every time');
    else {
        if (tags.has('security')) {
            want.set('spec-falsifier', 'security-relevant files: the specification and the tests are attacked before and after the build');
            want.set('blueprint-architect', 'security-relevant files: the change is designed before it is built');
        }
        if (tags.has('api') && dependents > 0) want.set('spec-falsifier', `${dependents} module(s) depend on what changes: their behaviour is probed`);
        if (dependents >= t.architectDependents) want.set('blueprint-architect', `${dependents} dependent modules: the change needs a design first`);
        if (list.length >= t.architectFiles) want.set('blueprint-architect', `${list.length} files: the change needs a design first`);
        if (ownerCount > 1) want.set('blueprint-architect', `${ownerCount} owners are involved: the order of their work is designed first`);
        if (tags.has('ops')) want.set('release-pilot', 'deployment, pipeline or data-migration files change');
        if (tags.has('code') && level !== 'low' && !want.has('spec-falsifier')) want.set('spec-falsifier', 'new behaviour: the tests are probed once it is built');
    }
    const route = optional.filter((a) => want.has(a));
    const skipped = optional.filter((a) => !want.has(a)).map((a) => ({ agent: a, why: only('docs') ? 'documentation only' : only('style', 'docs') ? 'style only' : only('test', 'docs') ? 'tests only' : `risk ${level}, ${dependents} dependent module(s), ${list.length} file(s)` }));
    const locked = [];
    if (tags.has('security')) locked.push({ agent: planning.gates.security, why: `security-relevant: ${rows.filter((r) => r.tag === 'security').map((r) => r.file).slice(0, 3).join(', ')}` });
    const skip = strategy === 'fixed' ? [] : pure('docs') ? planning.skippable.docs : only('style', 'docs') ? planning.skippable.style : [];
    const blockers = own ? [...own.unassigned.map((f) => `no owner: ${f}`), ...own.conflicts.map((r) => `claimed by ${r.conflict.join(' and ')}: ${r.file}`)] : [];
    if (tags.has('security')) reasons.push('touches security-relevant files');
    if (dependents) reasons.push(`${dependents} dependent module(s)`);
    if (n.untestedConsumers.length) reasons.push(`${n.untestedConsumers.length} dependent module(s) have no test: ${n.untestedConsumers.slice(0, 3).join(', ')}`);
    if (ownerCount > 1) reasons.push(`${ownerCount} owners`);
    // who works first: an owner whose files are imported by another owner's files goes before that owner
    const order = [];
    if (own && useGraph && ownerCount > 1) {
        const ownerOf = new Map(own.rows.filter((r) => r.owner).map((r) => [r.file, r.owner]));
        const before = new Map(Object.keys(own.byOwner).map((o) => [o, new Set()]));
        for (const [file, owner] of ownerOf) for (const dep of useGraph.imports.get(file) ?? []) if (ownerOf.has(dep) && ownerOf.get(dep) !== owner) before.get(owner).add(ownerOf.get(dep));
        const left = new Set(before.keys());
        while (left.size) {
            const ready = [...left].filter((o) => [...before.get(o)].every((b) => !left.has(b))).sort();
            const take = ready.length ? ready : [[...left].sort()[0]]; // a cycle between owners: break it by name and say so
            if (!ready.length) reasons.push(`owners depend on each other in a cycle (${[...left].join(', ')}): the order is by name`);
            for (const o of take) {
                order.push(o);
                left.delete(o);
            }
        }
    }
    return {
        ok: blockers.length === 0, strategy, files: rows, classes: [...tags].sort(), dependents: n.consumers, neighbourTests: n.neighbourTests, untested: n.untestedConsumers,
        owners: own ? { byOwner: own.byOwner, shared: own.shared, order } : null, blockers,
        risk: { score, level, reasons }, tier: level === 'high' ? 'hard' : 'normal', difficulty: level,
        route, gates: locked.map((g) => g.agent), locked, skip, skipped,
    };
}

/** The route as the flow will run it: optional agents from the plan, skippable steps left out, locked gates always in. */
export function stepsOf(flow, plan, { route = plan.route, gates = plan.gates, skip = plan.skip } = {}) {
    const mustGates = [...new Set([...gates, ...plan.locked.map((g) => g.agent)])]; // nothing passed in can remove a locked gate
    const never = new Set(flow.steps.filter((s) => s.verdict || s.manual || s.id === 'open' || s.id === 'close' || s.id === 'build' || (s.gates && mustGates.length)).map((s) => s.id));
    return flow.steps
        .filter((s) => !s.optional || route.includes(s.agent))
        .filter((s) => !s.gates || mustGates.length)
        .filter((s) => !skip.includes(s.id) || never.has(s.id))
        .map((s) => (s.gates ? { ...s, agents: mustGates } : { ...s }));
}

export function renderPlan(plan, flow) {
    const steps = stepsOf(flow, plan);
    const agents = steps.filter((s) => s.agent || s.gates).length;
    const full = flow.steps.filter((s) => s.agent || s.gates).length;
    return [
        `risk ${plan.risk.level} (${plan.risk.score})${plan.risk.reasons.length ? ` — ${plan.risk.reasons.join('; ')}` : ''}`,
        `files ${plan.files.length}: ${Object.entries(plan.files.reduce((m, r) => ({ ...m, [r.tag]: (m[r.tag] ?? 0) + 1 }), {})).map(([k, v]) => `${v} ${k}`).join(', ')}${plan.dependents.length ? ` · reaches ${plan.dependents.slice(0, 4).join(', ')}${plan.dependents.length > 4 ? `, +${plan.dependents.length - 4}` : ''}` : ''}`,
        ...(plan.owners ? Object.entries(plan.owners.byOwner).map(([o, l]) => `  owner ${o.padEnd(20)} ${l.slice(0, 4).join(', ')}${l.length > 4 ? ', …' : ''}`) : ['  owners: no manifest — responsibility is not assigned (add owners.json)']),
        plan.owners?.order.length > 1 ? `  order of work: ${plan.owners.order.join(' → ')}` : null,
        ...plan.blockers.map((b) => `  ✗ ${b}`),
        `route (${agents} of ${full} agent steps): ${steps.map((s) => s.id).join(' → ')}`,
        ...plan.locked.map((g) => `  locked gate ${g.agent} — ${g.why}; no option removes it`),
        ...plan.skipped.map((s) => `  without ${s.agent} — ${s.why}`),
        plan.skip.length ? `  without steps ${plan.skip.join(', ')} — ${plan.classes.join(' and ')} only` : null,
        plan.neighbourTests.length ? `  tests of dependents to run: ${plan.neighbourTests.slice(0, 5).join(', ')}` : null,
        plan.ok ? null : 'NOT READY: settle the ownership above first (add a pattern to owners.json, or declare the file shared)',
    ].filter(Boolean).join('\n');
}
