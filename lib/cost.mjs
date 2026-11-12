// cost: where the tokens went. Usage is read from session transcripts (JSON lines with a
// `message.usage` object, as Claude Code writes them), attributed to steps by time, and turned
// into the figures that change decisions: the share spent on rework, on orchestration, on steps
// that ended blocked, and the price of one passed item per agent and model.
// Money appears only when a price table is configured; without one everything is in tokens.
import fs from 'node:fs';
import { itemState } from './flow.mjs';
import { closedItems } from './journal.mjs';

/** Usage records of a transcript, one per model response (streamed duplicates removed). */
export function parseTranscript(file) {
    const seen = new Set();
    const out = [];
    for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
        if (!line.includes('"usage"')) continue;
        let o;
        try {
            o = JSON.parse(line);
        } catch {
            continue;
        }
        const u = o.message?.usage;
        if (!u || !o.timestamp) continue;
        const key = o.message.id ?? o.requestId ?? o.uuid;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ at: o.timestamp, model: o.message.model ?? 'unknown', side: !!o.isSidechain, input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 });
    }
    return out;
}

export const totalTokens = (u) => (u.input ?? 0) + (u.output ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0);
const add = (a, u) => {
    for (const k of ['input', 'output', 'cacheRead', 'cacheWrite']) a[k] = (a[k] ?? 0) + (u[k] ?? 0);
    a.calls = (a.calls ?? 0) + (u.calls ?? 1);
    return a;
};

/** Money for a usage record, or null when the model has no configured price (per million tokens). */
export function price(u, prices = {}) {
    const key = Object.keys(prices).find((k) => (u.model ?? '').includes(k));
    if (!key) return null;
    const p = prices[key];
    return ((u.input ?? 0) * (p.input ?? 0) + (u.output ?? 0) * (p.output ?? 0) + (u.cacheRead ?? 0) * (p.cacheRead ?? 0) + (u.cacheWrite ?? 0) * (p.cacheWrite ?? p.input ?? 0)) / 1e6;
}

/** Windows of the journal: every started step with its end (or open end). */
export function stepWindows(events) {
    const windows = [];
    const open = new Map();
    for (const e of events) {
        const key = `${e.item}/${e.step}`;
        if (e.kind === 'step.start' && !open.has(key)) open.set(key, { item: e.item, step: e.step, agent: e.agent ?? null, model: e.model ?? null, from: e.at, to: null, rework: !!e.rework, status: null });
        if (e.kind === 'step.end' && open.has(key)) {
            windows.push({ ...open.get(key), to: e.at, status: e.status, reported: e.tokens ?? 0 });
            open.delete(key);
        }
    }
    return [...windows, ...open.values()];
}

/** Gives every usage record the step during which it happened; the rest is orchestration. */
export function attribute(usage, events) {
    const windows = stepWindows(events);
    return usage.map((u) => {
        const w = windows.find((x) => u.at >= x.from && (!x.to || u.at <= x.to));
        return { ...u, item: w?.item ?? null, step: w && u.side ? w.step : w ? 'orchestrator' : 'outside', agent: w && u.side ? (w.agent ?? 'gates') : 'orchestrator', rework: !!w?.rework, status: w?.status ?? null };
    });
}

/** Attributed records folded into one row per item, step and model — small enough to keep for good. */
export function fold(attributed, source) {
    const rows = new Map();
    for (const u of attributed) {
        const key = [u.item, u.step, u.agent, u.model, u.rework, u.status].join('|');
        const r = rows.get(key) ?? { source, item: u.item, step: u.step, agent: u.agent, model: u.model, rework: u.rework, status: u.status, from: u.at, to: u.at, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };
        for (const k of ['input', 'output', 'cacheRead', 'cacheWrite']) r[k] += u[k];
        r.calls++;
        r.to = u.at;
        rows.set(key, r);
    }
    return [...rows.values()];
}

/**
 * The cost picture. `usage` are attributed records; when a step has no transcript usage, the
 * token count the orchestrator reported at the end of the step is used instead.
 */
export function costReport(usage, events, { prices = {} } = {}) {
    const byAgent = {};
    const byModel = {};
    const byItem = {};
    const total = {};
    let money = 0;
    let priced = true;
    const covered = new Set();
    for (const u of usage) {
        add(total, u);
        add((byAgent[u.agent ?? 'orchestrator'] ??= {}), u);
        add((byModel[u.model] ??= {}), u);
        if (u.item) add((byItem[u.item] ??= {}), u);
        if (u.item && u.step) covered.add(`${u.item}/${u.step}`);
        const m = price(u, prices);
        if (m === null) priced = false;
        else money += m;
    }
    let reportedOnly = 0;
    for (const w of stepWindows(events)) {
        if (covered.has(`${w.item}/${w.step}`) || !w.reported) continue;
        reportedOnly += w.reported;
        const u = { input: w.reported };
        add(total, u);
        add((byAgent[w.agent ?? 'gates'] ??= {}), u);
        add((byItem[w.item] ??= {}), u);
    }
    const sum = (filter) => usage.filter(filter).reduce((s, u) => s + totalTokens(u), 0);
    const all = totalTokens(total) || 1;
    const closed = closedItems(events);
    const passedFirst = closed.filter((id) => itemState(events, id)?.cycles === 0).length;
    return {
        total: { ...total, tokens: totalTokens(total) },
        money: priced && usage.length ? +money.toFixed(2) : null,
        byAgent: Object.fromEntries(Object.entries(byAgent).map(([k, v]) => [k, { ...v, tokens: totalTokens(v) }])),
        byModel: Object.fromEntries(Object.entries(byModel).map(([k, v]) => [k, { ...v, tokens: totalTokens(v) }])),
        byItem: Object.fromEntries(Object.entries(byItem).map(([k, v]) => [k, { ...v, tokens: totalTokens(v) }])),
        shares: {
            orchestration: +(sum((u) => u.agent === 'orchestrator' && u.step !== 'outside') / all).toFixed(3),
            rework: +(sum((u) => u.rework) / all).toFixed(3),
            wasted: +(sum((u) => u.status === 'BLOCKED' || u.status === 'INTERRUPTED') / all).toFixed(3),
            outside: +(sum((u) => u.step === 'outside') / all).toFixed(3),
            cacheRead: +((total.cacheRead ?? 0) / all).toFixed(3),
        },
        items: { closed: closed.length, passedFirst, tokensPerClosed: closed.length ? Math.round(totalTokens(total) / closed.length) : null },
        reportedOnly,
    };
}

export function renderCost(r) {
    const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
    const pct = (x) => `${(x * 100).toFixed(0)}%`;
    const table = (title, rows) => [`${title}:`, ...Object.entries(rows).sort((a, b) => b[1].tokens - a[1].tokens).map(([name, v]) => `  ${name.padEnd(24)} ${k(v.tokens).padStart(7)}  out ${k(v.output ?? 0).padStart(6)}  calls ${v.calls}`)];
    return [
        `tokens ${k(r.total.tokens)} (input ${k(r.total.input ?? 0)} · output ${k(r.total.output ?? 0)} · cache read ${k(r.total.cacheRead ?? 0)} · cache write ${k(r.total.cacheWrite ?? 0)})${r.money !== null ? ` · ${r.money} in the configured currency` : ' · no price table: tokens only'}`,
        `shares: orchestration ${pct(r.shares.orchestration)} · rework ${pct(r.shares.rework)} · blocked or interrupted steps ${pct(r.shares.wasted)} · outside any item ${pct(r.shares.outside)} · served from cache ${pct(r.shares.cacheRead)}`,
        `items closed ${r.items.closed} (first pass ${r.items.passedFirst})${r.items.tokensPerClosed ? ` · ${k(r.items.tokensPerClosed)} tokens per closed item` : ''}${r.reportedOnly ? ` · ${k(r.reportedOnly)} tokens known only from step reports` : ''}`,
        ...table('by agent', r.byAgent),
        ...table('by model', r.byModel),
        ...table('by item', r.byItem),
    ].join('\n');
}
