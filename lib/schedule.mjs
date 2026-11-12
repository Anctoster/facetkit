// schedule: a plan that spans dozens of sessions, recomputed from what actually happened.
// Effort per item starts from a prior per tier and is replaced by the team's own medians as items
// close. The forecast is a distribution (a seeded simulation with the observed spread and rework
// rate), so a milestone gets a "likely" and a "safe" date and a slack, not a single optimistic day.
import { observations } from './evalx.mjs';
import { itemState } from './flow.mjs';
import { closedItems, openItems } from './journal.mjs';

export const DEFAULT_PRIOR = { normal: { minutes: 40 }, hard: { minutes: 90 }, spread: 0.5, rework: 0.3, reworkCost: 0.4 };

const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Minutes per tier, spread and rework rate: from history when there are at least three items, else the prior. */
export function calibrate(events, prior = DEFAULT_PRIOR) {
    const perItem = new Map();
    for (const o of observations(events)) perItem.set(o.item, { tier: o.tier, minutes: (perItem.get(o.item)?.minutes ?? 0) + o.minutes });
    const done = [...perItem.values()].filter((x) => x.minutes > 0);
    const tiers = {};
    const source = {};
    for (const tier of new Set([...Object.keys(prior).filter((k) => prior[k]?.minutes), ...done.map((d) => d.tier)])) {
        const mine = done.filter((d) => d.tier === tier).map((d) => d.minutes);
        tiers[tier] = mine.length >= 3 ? median(mine) : (prior[tier]?.minutes ?? prior.normal.minutes);
        source[tier] = mine.length >= 3 ? `median of ${mine.length} items` : 'prior';
    }
    const logs = done.map((d) => Math.log(d.minutes / tiers[d.tier]));
    const spread = logs.length >= 5 ? Math.max(0.2, Math.sqrt(logs.reduce((s, x) => s + x * x, 0) / logs.length)) : prior.spread;
    const closed = closedItems(events);
    const reworked = closed.filter((id) => (itemState(events, id)?.cycles ?? 0) > 0).length;
    return { tiers, source, spread: +spread.toFixed(2), rework: closed.length >= 5 ? +(reworked / closed.length).toFixed(2) : prior.rework, reworkCost: prior.reworkCost, basedOn: done.length };
}

/** Items in an order that respects dependencies: version order first, then id. */
export function order(items, done = new Set()) {
    const versions = [...new Set(Object.values(items).map((i) => i.version))];
    const left = Object.keys(items).filter((id) => !done.has(id)).sort((a, b) => versions.indexOf(items[a].version) - versions.indexOf(items[b].version) || a.localeCompare(b));
    const out = [];
    const placed = new Set(done);
    while (left.length) {
        const i = left.findIndex((id) => (items[id].deps ?? []).every((d) => placed.has(d)));
        if (i < 0) return { order: out, stuck: left };
        placed.add(left[i]);
        out.push(left.splice(i, 1)[0]);
    }
    return { order: out, stuck: [] };
}

/** The longest chain of remaining work through dependencies. */
export function criticalPath(items, done, minutesOf) {
    const memo = new Map();
    const walk = (id) => {
        if (memo.has(id)) return memo.get(id);
        const deps = (items[id].deps ?? []).filter((d) => !done.has(d) && items[d]);
        const best = deps.map(walk).sort((a, b) => b.minutes - a.minutes)[0] ?? { minutes: 0, path: [] };
        const r = { minutes: best.minutes + minutesOf(id), path: [...best.path, id] };
        memo.set(id, r);
        return r;
    };
    return Object.keys(items).filter((id) => !done.has(id)).map(walk).sort((a, b) => b.minutes - a.minutes)[0] ?? { minutes: 0, path: [] };
}

const sessionDate = (start, k, perWeek) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + Math.floor((k - 1) / perWeek) * 7 + Math.round((((k - 1) % perWeek) * 7) / perWeek));
    return d.toISOString().slice(0, 10);
};

/**
 * The plan: sessions packed in dependency order, and for every version the session and date by
 * which it is likely (P50) and safely (P80) finished, with the slack to its milestone.
 */
export function plan(items, events, { capacity = 120, perWeek = 3, start = new Date().toISOString().slice(0, 10), milestones = {}, prior = DEFAULT_PRIOR, runs = 400, seed = 7 } = {}) {
    const done = new Set(closedItems(events));
    const cal = calibrate(events, prior);
    const minutesOf = (id) => cal.tiers[items[id].tier ?? 'normal'] ?? cal.tiers.normal;
    const { order: seq, stuck } = order(items, done);
    const sessions = [];
    let used = capacity;
    for (const id of seq) {
        let need = minutesOf(id);
        while (need > 0) {
            if (used >= capacity) {
                sessions.push({ n: sessions.length + 1, date: sessionDate(start, sessions.length + 1, perWeek), items: [], minutes: 0 });
                used = 0;
            }
            const take = Math.min(need, capacity - used);
            const s = sessions.at(-1);
            if (!s.items.includes(id)) s.items.push(id);
            s.minutes += take;
            used += take;
            need -= take;
        }
    }
    const versions = [...new Set(seq.map((id) => items[id].version))];
    const random = rng(seed);
    const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
    const ends = Object.fromEntries(versions.map((v) => [v, []]));
    for (let r = 0; r < runs; r++) {
        let total = 0;
        const lastOf = {};
        for (const id of seq) {
            total += minutesOf(id) * Math.exp(cal.spread * normal() - (cal.spread * cal.spread) / 2) * (random() < cal.rework ? 1 + cal.reworkCost : 1);
            lastOf[items[id].version] = total;
        }
        for (const v of versions) ends[v].push(Math.max(1, Math.ceil(lastOf[v] / capacity)));
    }
    const q = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
    const forecast = versions.map((v) => {
        const p50 = q(ends[v], 0.5);
        const p80 = q(ends[v], 0.8);
        const safe = sessionDate(start, p80, perWeek);
        const due = milestones[v] ?? null;
        return { version: v, items: seq.filter((id) => items[id].version === v).length, p50, p80, likely: sessionDate(start, p50, perWeek), safe, due, slackDays: due ? Math.round((new Date(due) - new Date(safe)) / 86400000) : null };
    });
    const waiting = openItems(events).filter((id) => itemState(events, id)?.steps.some((s) => s.status === 'needs-user'));
    return { calibration: cal, done: done.size, remaining: seq.length, stuck, sessions, forecast, critical: criticalPath(items, done, minutesOf), waiting, open: openItems(events), capacity, perWeek, start };
}

/** What to do in the session that starts now. */
export function sessionPlan(p, items) {
    const lines = [];
    for (const id of p.open) lines.push(p.waiting.includes(id) ? `waiting for you: ${id} — answer its question, then it resumes` : `resume ${id} first (facet flow next)`);
    const first = p.sessions[0];
    if (first) lines.push(`then: ${first.items.filter((id) => !p.open.includes(id)).join(', ') || '—'} (about ${Math.round(first.minutes)} of ${p.capacity} min of agent time)`);
    if (p.stuck.length) lines.push(`cannot be scheduled (dependency cycle or unknown dependency): ${p.stuck.join(', ')}`);
    const late = p.forecast.filter((f) => f.slackDays !== null && f.slackDays < 0);
    for (const f of late) lines.push(`AT RISK ${f.version}: safe date ${f.safe} is ${-f.slackDays} days after ${f.due}; critical chain ${p.critical.path.filter((id) => items[id]).join(' → ')}`);
    return lines;
}

export function renderPlan(p, items) {
    const c = p.calibration;
    return [
        `# Schedule`,
        '',
        `Generated from the journal: ${p.done} items closed, ${p.remaining} remaining. A session is ${p.capacity} minutes of agent time, ${p.perWeek} sessions a week from ${p.start}.`,
        `Effort per item: ${Object.entries(c.tiers).map(([t, m]) => `${t} ${Math.round(m)} min (${c.source[t]})`).join(', ')}; spread ${c.spread}, rework rate ${c.rework}.`,
        'The forecast counts agent time only. Waiting for people — answers, material from a client, reviews, releases — is not in it, and an effort marked "prior" is an assumption until three items of that tier are closed.',
        '',
        '## Versions',
        '',
        '| Version | Items left | Likely (P50) | Safe (P80) | Milestone | Slack, days |',
        '|---|---|---|---|---|---|',
        ...p.forecast.map((f) => `| ${f.version} | ${f.items} | session ${f.p50}, ${f.likely} | session ${f.p80}, ${f.safe} | ${f.due ?? '—'} | ${f.slackDays ?? '—'} |`),
        '',
        `Critical chain: ${p.critical.path.join(' → ') || '—'} (${Math.round(p.critical.minutes)} min).`,
        '',
        '## Sessions',
        '',
        '| # | Date | Items | Minutes |',
        '|---|---|---|---|',
        ...p.sessions.map((s) => `| ${s.n} | ${s.date} | ${s.items.join(', ')} | ${Math.round(s.minutes)} |`),
        '',
        ...sessionPlan(p, items).map((l) => `- ${l}`),
        '',
    ].join('\n');
}
