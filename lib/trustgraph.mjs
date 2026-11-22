// trust graph: how far a result can be believed is decided by what produced it, what checked it and
// what judged it — and each of those has a record.
//
//  nodes   agent:<name>@<model>   producer steps: good when the item closed without the agent being blamed
//          judge:<name>@<model>   verdict steps: good when a PASS was not contradicted by a later defect
//          tool:<check>           evidence: good when a pass held or a fail caught something; bad when a
//                                 pass was followed by a defect, or the same sources gave both answers
//          result:<item>          a closed item
//  edges   produced, checked, judged — from the journal, never declared; a witness (facet proof
//          witness) that re-ran a check on the same sources counts for or against that check
//  trust   the lower bound of what the record supports (Wilson, 90%): a node nobody has observed is
//          not trusted, it is unknown — and unknown is the lowest trust there is.
//  result  as trustworthy as the weakest thing it rests on. The weakest link is named.
//  charge  where an item has `origin` events (plan 2.8), they decide who is charged, not the agents a
//          verdict named: the source step's agent with weight 1, each judging step between the source
//          and where it was found ("missed") with 0.5, the judge that passed a defect found after
//          acceptance as a false green; a tool defect is charged to the tool, not to an agent; a
//          criterion that was never in the brief charges nobody who worked. A fractional charge is a
//          fractional observation: 0.5 bad and 0.5 good.
//  A2      asymmetry (plan 2.11): a criterion the step itself reported `blocked` or `partial` with a reason
//          charges nothing — saying what is not done is the behaviour wanted; one it reported `done` and a
//          check refuted is a false "done" and charges twice a plain return.
import { closedItems, stateOf } from './journal.mjs';

const Z = 1.645;
export function wilsonLow(good, n) {
    if (!n) return 0;
    const p = good / n;
    return +Math.max(0, (p + (Z * Z) / (2 * n) - Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / (1 + (Z * Z) / n)).toFixed(3);
}

export function buildTrustGraph(events) {
    const nodes = new Map();
    const edges = [];
    const node = (id, kind) => nodes.get(id) ?? nodes.set(id, { id, kind, good: 0, bad: 0, notes: [] }).get(id);
    const mark = (id, kind, ok, note, weight = 1) => {
        const n = node(id, kind);
        const w = ok ? 0 : weight;
        n.good += Math.max(0, 1 - w);
        n.bad += w;
        if (w > 0 && note && n.notes.length < 5) n.notes.push(note);
    };
    const by = new Map();
    for (const e of events) if (e.item) (by.get(e.item) ?? by.set(e.item, []).get(e.item)).push(e);
    for (const item of closedItems(events)) {
        const ev = by.get(item) ?? [];
        const escapes = ev.filter((e) => e.kind === 'escape');
        const origins = ev.filter((e) => e.kind === 'origin');
        const stepsOf = ev.find((e) => e.kind === 'item.open')?.steps ?? [];
        const verdictSteps = new Set(stepsOf.filter((s) => s.verdict).map((s) => s.id));
        // who is charged, and how much: from origin events when there are any, else from the verdicts' fixes
        const charge = new Map();
        const add = (agent, w, why) => agent && charge.set(agent, { w: Math.max(charge.get(agent)?.w ?? 0, w), why: w >= (charge.get(agent)?.w ?? 0) ? why : charge.get(agent).why });
        // what each step said of its criteria when it ended (step.end criteria: { A1: 'done' | 'blocked: why' | 'partial: what' })
        const claimOf = (step, criterion) => String(ev.filter((e) => e.kind === 'step.end' && e.step === step && e.criteria).at(-1)?.criteria?.[criterion] ?? '');
        if (origins.length) {
            const order = stepsOf.map((s) => s.id);
            for (const o of origins.filter((x) => x.charged !== false)) {
                const claim = claimOf(o.step, o.criterion);
                // A2: reported blocked or partial with a reason — nothing; reported done and refuted — twice
                if (/^(blocked|partial):\s*\S/.test(claim)) add(o.agent, 0, `${item}: ${o.criterion} reported ${claim.split(':')[0]} — not charged`);
                else add(o.agent, claim === 'done' ? 2 : 1, claim === 'done' ? `${item}: ${o.criterion} reported done, refuted (${o.method}) — false done` : `${item}: source of ${o.criterion} (${o.method})`);
                const from = order.indexOf(o.step);
                const to = o.foundAt ? order.indexOf(o.foundAt) : order.length;
                for (const s of stepsOf.slice(from + 1, Math.max(from + 1, to))) if (s.verdict && s.agent) add(s.agent, 0.5, `${item}: missed ${o.criterion}`);
            }
            for (const o of origins.filter((x) => x.tool)) mark(`tool:${o.tool}`, 'tool', false, `${item}: tool defect behind ${o.criterion}`);
        } else for (const v of ev.filter((e) => e.kind === 'verdict')) for (const f of v.fixes ?? []) add(f.agent, 1, `${item}: work sent back`);
        const seen = new Set();
        for (const e of ev.filter((x) => x.kind === 'step.start' && x.agent)) {
            const judge = verdictSteps.has(e.step);
            const id = `${judge ? 'judge' : 'agent'}:${e.agent}@${e.model ?? '?'}`;
            if (seen.has(id)) continue; // one observation per item, however many attempts
            seen.add(id);
            if (judge) {
                const c = charge.get(e.agent);
                if (escapes.length) mark(id, 'judge', false, `${item}: false green — passed, then a defect was found`);
                else mark(id, 'judge', !c, c?.why, c?.w ?? 1);
            } else {
                const c = charge.get(e.agent) ?? (escapes.some((x) => x.agent === e.agent) ? { w: 1, why: `${item}: a defect after acceptance` } : null);
                mark(id, 'agent', !c || c.w === 0, c?.why, c?.w ?? 1);
            }
            edges.push({ from: id, to: `result:${item}`, kind: judge ? 'judged' : 'produced' });
        }
        const last = new Map();
        const answers = new Map();
        for (const e of ev.filter((x) => x.kind === 'evidence')) {
            last.set(e.name, e);
            if (stateOf(e)) {
                const k = `${e.name}|${stateOf(e)}`;
                answers.set(k, (answers.get(k) ?? new Set()).add(!!e.ok));
            }
        }
        const flaky = new Set([...answers].filter(([, s]) => s.size > 1).map(([k]) => k.split('|')[0]));
        // a second, independent run of the checks on the same sources: agreement is the strongest support a check can get, disagreement the strongest doubt
        for (const w of ev.filter((x) => x.kind === 'proof.witness' && x.sameSources)) for (const name of w.checks ?? []) {
            mark(`tool:${name}`, 'tool', !(w.differs ?? []).includes(name), `${item}: a second run on the same sources gave another answer`);
            if (!last.has(name)) edges.push({ from: `tool:${name}`, to: `result:${item}`, kind: 'checked' });
        }
        for (const [name, e] of last) {
            const id = `tool:${name}`;
            if (flaky.has(name)) mark(id, 'tool', false, `${item}: the same sources gave both pass and fail`);
            else mark(id, 'tool', !(e.ok && escapes.length), `${item}: passed, then a defect was found`);
            edges.push({ from: id, to: `result:${item}`, kind: 'checked' });
        }
        node(`result:${item}`, 'result').escaped = escapes.length > 0;
    }
    for (const n of nodes.values()) if (n.kind !== 'result') {
        n.n = n.good + n.bad;
        n.trust = wilsonLow(n.good, n.n);
    }
    for (const n of nodes.values()) if (n.kind === 'result') {
        const support = edges.filter((e) => e.to === n.id).map((e) => ({ ...e, trust: nodes.get(e.from).trust }));
        const weakest = support.sort((a, b) => a.trust - b.trust)[0] ?? null;
        const missing = ['produced', 'checked', 'judged'].filter((k) => !support.some((s) => s.kind === k));
        // a result nobody checked or nobody judged rests on nothing for that part
        n.trust = n.escaped || missing.length || !weakest ? 0 : weakest.trust;
        n.weakest = n.escaped ? 'a defect was found after acceptance' : missing.length ? `nothing ${missing.join(' / ')} it` : weakest ? `${weakest.from} (${weakest.trust})` : null;
    }
    return { nodes, edges };
}

export const trustOf = (graph, id) => graph.nodes.get(id)?.trust ?? 0;
/** Nodes of one kind, least trusted first. */
export const ranked = (graph, kind) => [...graph.nodes.values()].filter((n) => n.kind === kind).sort((a, b) => a.trust - b.trust || b.n - a.n);

export function renderTrustGraph(graph, { item = null } = {}) {
    if (item) {
        const r = graph.nodes.get(`result:${item}`);
        if (!r) return `${item}: not a closed item`;
        return [`result ${item}: trust ${r.trust} — as strong as its weakest support: ${r.weakest}`, ...graph.edges.filter((e) => e.to === r.id).map((e) => `  ${e.kind.padEnd(9)} by ${e.from.padEnd(34)} trust ${graph.nodes.get(e.from).trust} (${graph.nodes.get(e.from).good}/${graph.nodes.get(e.from).n})`)].join('\n');
    }
    const row = (n) => `  ${n.id.padEnd(40)} trust ${String(n.trust).padEnd(6)} ${n.good} of ${n.n} held${n.n < 5 ? '  (few observations: mostly unknown)' : ''}${n.notes[0] ? `  · ${n.notes[0]}` : ''}`;
    const results = ranked(graph, 'result');
    return [
        'agents (least trusted first)', ...ranked(graph, 'agent').map(row),
        'judges', ...ranked(graph, 'judge').map(row),
        'tools', ...ranked(graph, 'tool').map(row),
        `results: ${results.length} closed · ${results.filter((r) => r.trust === 0).length} rest on nothing or were contradicted · median trust ${results.length ? results[Math.floor(results.length / 2)].trust : 0}`,
        'trust is the lower bound the record supports; it rises only with observations',
    ].join('\n');
}
