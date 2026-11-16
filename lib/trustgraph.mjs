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
import { closedItems } from './journal.mjs';

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
    const mark = (id, kind, ok, note) => {
        const n = node(id, kind);
        if (ok) n.good++;
        else {
            n.bad++;
            if (note && n.notes.length < 5) n.notes.push(note);
        }
    };
    const by = new Map();
    for (const e of events) if (e.item) (by.get(e.item) ?? by.set(e.item, []).get(e.item)).push(e);
    for (const item of closedItems(events)) {
        const ev = by.get(item) ?? [];
        const escapes = ev.filter((e) => e.kind === 'escape');
        const blamed = new Set(ev.filter((e) => e.kind === 'verdict').flatMap((v) => (v.fixes ?? []).map((f) => f.agent)));
        const verdictSteps = new Set((ev.find((e) => e.kind === 'item.open')?.steps ?? []).filter((s) => s.verdict).map((s) => s.id));
        const seen = new Set();
        for (const e of ev.filter((x) => x.kind === 'step.start' && x.agent)) {
            const judge = verdictSteps.has(e.step);
            const id = `${judge ? 'judge' : 'agent'}:${e.agent}@${e.model ?? '?'}`;
            if (seen.has(id)) continue; // one observation per item, however many attempts
            seen.add(id);
            if (judge) mark(id, 'judge', escapes.length === 0, `${item}: passed, then a defect was found`);
            else mark(id, 'agent', !blamed.has(e.agent) && !escapes.some((x) => x.agent === e.agent), `${item}: work sent back`);
            edges.push({ from: id, to: `result:${item}`, kind: judge ? 'judged' : 'produced' });
        }
        const last = new Map();
        const answers = new Map();
        for (const e of ev.filter((x) => x.kind === 'evidence')) {
            last.set(e.name, e);
            if (e.src) {
                const k = `${e.name}|${e.src}`;
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
