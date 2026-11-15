// economy: every capability — a facet, an agent on a model, a check — costs something each time it is
// used and is worth what it demonstrably prevents. Attention and tokens go where the measured return is.
//
//  cost     facets: their words, paid on every delivery. Agents: tokens per item on a given model.
//           Checks: seconds per run.
//  value    facets: the measured change of the clean-close rate (a judged hypothesis) times what one
//           rework cycle costs here. No judged hypothesis → value unknown, which is not zero.
//  market   three kinds of holdings share a role's word budget:
//             core     rules that guard safety (never priced, always in);
//             proven   positive measured return, best return first;
//             explore  unknown value — they get a fixed share, least-observed first, because the
//                      only way to price them is to deliver them inside an experiment.
//           Facets with a measured negative or null return are priced out, and say so.
//  labour   the cheapest model whose trust (lower bound) meets what the task's risk demands; when no
//           model has earned it yet, the largest one — and the cheaper ones are tried at low risk.
import { closedItems } from './journal.mjs';
import { trustOf } from './trustgraph.mjs';

const wordsOf = (f) => String(f.body ?? '').trim().split(/\s+/).filter(Boolean).length;
export const ECONOMY = { explore: 0.2, tokensPerWord: 1.4, need: { low: 0.5, normal: 0.65, high: 0.8 } };

/** What one rework cycle costs here, in tokens: the steps that ran after a REWORK verdict, on average. */
export function reworkCost(events) {
    let cycles = 0;
    let tokens = 0;
    const open = new Set();
    for (const e of events) {
        if (e.kind === 'verdict' && e.verdict === 'REWORK') {
            cycles++;
            open.add(e.item);
        } else if (e.kind === 'verdict') open.delete(e.item);
        else if (e.kind === 'step.end' && open.has(e.item)) tokens += e.tokens ?? 0;
    }
    return cycles ? Math.round(tokens / cycles) : null;
}

/** One row per facet: what it costs per delivery, what it returns per delivery (or null), and how often it was delivered. */
export function priceFacets(facets, events, { judged = [], perRework = reworkCost(events) } = {}) {
    const deliveries = new Map();
    for (const e of events) if (e.kind === 'step.start') for (const f of e.facets ?? []) deliveries.set(f, (deliveries.get(f) ?? 0) + 1);
    const verdictOf = new Map(judged.filter((j) => j.h.facet).map((j) => [j.h.facet, j]));
    return facets.map((f) => {
        const cost = Math.round(wordsOf(f) * ECONOMY.tokensPerWord);
        const j = verdictOf.get(f.ref);
        const settled = j && ['supported', 'refuted', 'no-effect'].includes(j.v.verdict);
        // the effect on the clean-close rate, as measured; a refuted or null hypothesis is worth nothing or less
        const effect = settled ? (j.v.verdict === 'supported' ? Math.abs(j.effect ?? 0) : j.v.verdict === 'refuted' ? -Math.abs(j.effect ?? 0) : 0) : null;
        const value = effect === null || perRework === null ? null : Math.round(effect * perRework);
        return { ref: f.ref, core: !f.ablatable, words: wordsOf(f), cost, delivered: deliveries.get(f.ref) ?? 0, effect, value, net: value === null ? null : value - cost, verdict: j?.v.verdict ?? 'untested' };
    });
}

/** Which facets a role's word budget buys. */
export function allocate(prices, { budgetWords, explore = ECONOMY.explore } = {}) {
    const core = prices.filter((p) => p.core);
    let left = budgetWords - core.reduce((s, p) => s + p.words, 0);
    const out = { core: core.map((p) => p.ref), proven: [], explore: [], out: [], overBudget: left < 0 };
    const pricedOut = prices.filter((p) => !p.core && p.net !== null && p.net <= 0);
    for (const p of pricedOut) out.out.push({ ref: p.ref, why: p.value <= 0 ? `measured: no gain (${p.verdict})` : `returns ${p.value} tokens per delivery, costs ${p.cost}` });
    const proven = prices.filter((p) => !p.core && p.net !== null && p.net > 0).sort((a, b) => b.net / b.cost - a.net / a.cost);
    const unknown = prices.filter((p) => !p.core && p.net === null).sort((a, b) => a.delivered - b.delivered || a.words - b.words);
    const reserve = unknown.length ? Math.max(0, Math.floor(left * explore)) : 0;
    let forProven = left - reserve;
    for (const p of proven) {
        if (p.words <= forProven) {
            out.proven.push(p.ref);
            forProven -= p.words;
        } else out.out.push({ ref: p.ref, why: 'proven, but the budget is spent on better returns' });
    }
    let forExplore = reserve + forProven; // what proven rules leave unused goes to exploration
    for (const p of unknown) {
        if (p.words <= forExplore) {
            out.explore.push(p.ref);
            forExplore -= p.words;
        } else out.out.push({ ref: p.ref, why: 'unpriced, and the exploration share is spent: it waits its turn' });
    }
    out.wordsLeft = forExplore;
    return out;
}

/** The model to run an agent on, given what the task's risk demands. */
export function hire(graph, agent, { ladder = ['haiku', 'sonnet', 'opus'], risk = 'normal', kind = 'agent' } = {}) {
    const need = ECONOMY.need[risk] ?? ECONOMY.need.normal;
    const rows = ladder.map((model) => ({ model, trust: trustOf(graph, `${kind}:${agent}@${model}`), n: graph.nodes.get(`${kind}:${agent}@${model}`)?.n ?? 0 }));
    const earned = rows.find((r) => r.trust >= need);
    if (earned) return { model: earned.model, why: `${earned.model} has earned trust ${earned.trust} ≥ ${need} (${earned.n} items)`, rows };
    // nobody has earned it: at low risk the cheapest untried model gets its chance, otherwise the largest works
    const untried = rows.find((r) => r.n < 5);
    if (risk === 'low' && untried) return { model: untried.model, trial: true, why: `no model has earned ${need} yet; ${untried.model} is tried where a mistake is cheap`, rows };
    return { model: ladder.at(-1), why: `no model has earned ${need} for risk "${risk}": the largest one works, and cheaper ones are tried on low-risk items`, rows };
}

export function renderEconomy(prices, allocation, { perRework, items }) {
    const spent = prices.reduce((s, p) => s + p.cost * p.delivered, 0);
    const returned = prices.reduce((s, p) => s + (p.value ?? 0) * p.delivered, 0);
    const line = (p) => `  ${p.ref.padEnd(38)} costs ${String(p.cost).padStart(4)} · ${p.value === null ? 'value unknown' : `returns ${p.value}`.padEnd(13)} · delivered ${String(p.delivered).padStart(3)}× · ${p.core ? 'core' : p.verdict}`;
    return [
        `one rework cycle costs ${perRework ?? 'unknown (none recorded)'} tokens here · ${items} closed items · rules cost ${spent} tokens so far, measured return ${returned}`,
        ...[...prices].sort((a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity) || b.delivered - a.delivered).slice(0, 14).map(line),
        allocation ? `budget: ${allocation.core.length} core · ${allocation.proven.length} proven · ${allocation.explore.length} being explored · ${allocation.out.length} left out${allocation.overBudget ? ' · CORE RULES ALONE EXCEED THE BUDGET' : ''}` : null,
        ...(allocation?.out ?? []).slice(0, 6).map((o) => `  out: ${o.ref} — ${o.why}`),
        `${prices.filter((p) => p.value === null && !p.core).length} of ${prices.filter((p) => !p.core).length} rules have never been priced: only an experiment prices them`,
    ].filter(Boolean).join('\n');
}
export const itemsClosed = (events) => closedItems(events).length;
