// skillint: which rules actually work, why, and what to do about each one.
//
// A skill system usually knows two things about a rule: that it was written, and that somebody
// believes in it. This module adds the three it lacks, from the journal and the run ledgers:
//   exposure   was the rule in what the agent read for this step — or deliberately withheld;
//   adherence  did the agent do what the rule says: every facet may declare a footprint, the trace
//              its observance leaves (a tool that was used, evidence that was recorded, a red run
//              before a green one, a checkpoint);
//   effect     did the failure the rule guards against happen less often when it was followed.
// Correlation is turned into an experiment by withholding: a small, seeded share of the rules
// that may be withheld is left out of a step, so "with" and "without" are compared on the team's
// own work. From the three numbers each facet gets a diagnosis and one action — keep, reword,
// graduate into a tool, retire, test — and failure modes with incidents and no guarding rule
// are reported as gaps, with a trial harvested from the real incident.
import { interval } from './evalx.mjs';
import { closedItems, ofItem } from './journal.mjs';
import { sha } from './text.mjs';

export const MODES = ['false-green', 'seam-break', 'spec-gap', 'scope-creep', 'weakened-test', 'unverified-claim', 'stale-handoff', 'doc-drift', 'budget-burn', 'loop', 'flaky', 'regression', 'lost-work', 'repeated-mistake', 'unasked-assumption', 'security', 'other'];
export const SKILL_LIMITS = { minN: 5, followed: 0.7, ignored: 0.5, gain: 0.1 };

/** Which facets of a loadout are withheld for this step: seeded, at most one, never a safety rule. */
export function withheldFor(facets, { item, step, rate = 0, seed = 'facet' } = {}) {
    if (!(rate > 0)) return [];
    const draw = (ref) => parseInt(sha(`${seed}|${item}|${step}|${ref}`, 8), 16) / 0xffffffff;
    const picked = facets.filter((f) => f.ablatable && draw(f.ref) < rate).sort((a, b) => draw(a.ref) - draw(b.ref));
    return picked.slice(0, 1).map((f) => f.ref);
}

/** Did the step leave the footprint? true, false, or null when the facet declares none. */
export function adhered(footprint, { runs = [], events = [] }) {
    if (!footprint.length) return null;
    const cmds = runs.filter((r) => r.kind === 'run');
    return footprint.every((atom) => {
        const [kind, arg = ''] = [atom.slice(0, atom.indexOf(':') < 0 ? atom.length : atom.indexOf(':')), atom.indexOf(':') < 0 ? '' : atom.slice(atom.indexOf(':') + 1)];
        if (kind === 'tool') return runs.some((r) => r.kind === 'tool' && r.cmd.trim().startsWith(arg));
        if (kind === 'evidence') return events.some((e) => e.kind === 'evidence' && e.name === arg);
        if (kind === 'event') return events.some((e) => e.kind === arg);
        if (kind === 'note') return events.some((e) => e.kind === 'note');
        if (kind === 'runs') return cmds.length > 0;
        if (kind === 'red-first') {
            const firstGreen = cmds.findIndex((r) => r.exit === 0);
            return cmds.some((r, i) => r.exit !== 0 && (firstGreen < 0 || i < firstGreen));
        }
        return false;
    });
}

/**
 * One row per facet per step of every closed item: exposed or withheld, adhered or not, and how
 * the item went for that agent (was it blamed, and for which failure modes).
 * `ledgerOf(item)` returns the run ledger of an item.
 */
export function exposures(events, { ledgerOf = () => [], facets = [] } = {}) {
    const meta = new Map(facets.map((f) => [f.ref, f]));
    const rows = [];
    for (const item of closedItems(events)) {
        const mine = ofItem(events, item);
        const runs = ledgerOf(item);
        const fixes = mine.filter((e) => e.kind === 'verdict').flatMap((v) => v.fixes ?? []);
        const late = events.filter((e) => e.kind === 'escape' && e.item === item);
        const first = new Map();
        for (const e of mine) if (e.kind === 'step.start' && !e.assist && !first.has(e.step)) first.set(e.step, e);
        for (const [step, start] of first) {
            const end = mine.find((e) => e.kind === 'step.end' && e.step === step && e.at >= start.at);
            const inside = (x) => x.at >= start.at && (!end || x.at <= end.at);
            const window = { runs: runs.filter(inside), events: mine.filter((e) => inside(e) && (e.step === undefined || e.step === step)) };
            const blamed = fixes.filter((f) => f.agent === start.agent);
            const modes = [...new Set([...blamed.map((f) => f.mode ?? 'other'), ...late.map((e) => e.mode ?? 'other')])];
            const base = { item, step, agent: start.agent ?? null, model: start.model ?? null, clean: blamed.length === 0 && late.length === 0, modes, tokens: end?.tokens ?? null, blocked: end?.status === 'BLOCKED' };
            for (const ref of start.facets ?? []) rows.push({ ...base, facet: ref, exposed: true, adhered: adhered(meta.get(ref)?.footprint ?? [], window) });
            for (const ref of start.withheld ?? []) rows.push({ ...base, facet: ref, exposed: false, adhered: false });
        }
    }
    return rows;
}

const rate = (rows, good) => {
    const k = rows.filter(good).length;
    return { n: rows.length, k, p: rows.length ? +(k / rows.length).toFixed(2) : null, ...interval(k, rows.length) };
};
const median = (xs) => {
    const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};

/** The diagnosis of every facet: numbers, a verdict in words, and one action. */
export function diagnose(rows, facets, { limits = SKILL_LIMITS } = {}) {
    return facets.map((f) => {
        const mine = rows.filter((r) => r.facet === f.ref);
        const exposed = mine.filter((r) => r.exposed);
        const withheld = mine.filter((r) => !r.exposed);
        const observable = f.footprint.length > 0;
        const followed = exposed.filter((r) => r.adhered === true);
        const notFollowed = exposed.filter((r) => r.adhered === false);
        // "good" is specific when the facet names what it guards: no incident of those modes
        const good = (r) => (f.guards.length ? !r.modes.some((m) => f.guards.includes(m)) : r.clean);
        const adherence = observable ? rate(exposed, (r) => r.adhered === true) : null;
        const withRule = rate(observable ? followed : exposed, good);
        const without = rate([...(observable ? notFollowed : []), ...withheld], good);
        const effect = withRule.n && without.n ? +(withRule.p - without.p).toFixed(2) : null;
        const byModel = observable ? Object.fromEntries([...new Set(exposed.map((r) => r.model))].map((m) => [m, rate(exposed.filter((r) => r.model === m), (r) => r.adhered === true)]).filter(([, r]) => r.n >= 3).map(([m, r]) => [m, r.p])) : {};
        const cost = { with: median((observable ? followed : exposed).map((r) => r.tokens)), without: median([...(observable ? notFollowed : []), ...withheld].map((r) => r.tokens)) };
        let verdict;
        let action;
        const enough = without.n >= limits.minN && withRule.n >= limits.minN;
        const spread = Object.values(byModel);
        if (!exposed.length && !withheld.length) [verdict, action] = ['never used', 'no closed item has loaded it: check the loadouts, or wait'];
        else if (exposed.length < limits.minN) [verdict, action] = ['thin', `only ${exposed.length} exposure(s): no conclusion yet`];
        else if (enough && withRule.low > without.high) [verdict, action] = observable && adherence.high < limits.ignored ? ['works when followed, mostly ignored', 'graduate it: turn its Check into a tool or a policy rule, then shorten the prose'] : ['works', 'keep; protect its wording from growth'];
        else if (spread.length > 1 && Math.max(...spread) - Math.min(...spread) >= 0.4) [verdict, action] = ['model-dependent', `followed on some models only (${Object.entries(byModel).map(([m, p]) => `${m} ${p}`).join(', ')}): keep it in the loadouts of the models that follow it, or raise the model`];
        else if (enough && effect !== null && effect < limits.gain) [verdict, action] = observable && adherence.low >= limits.followed ? ['followed, no measurable effect', 'retire it, or the models have outgrown it: confirm with two replays without it, then delete'] : ['no measurable effect', 'retire it unless a trial shows the failure it prevents'];
        else if (observable && adherence.high < limits.ignored) [verdict, action] = ['ignored', 'reword it shorter and move it earlier in the loadout; if its Check can be a tool, graduate it'];
        else if (!observable) [verdict, action] = ['unobservable', without.n ? 'effect is known only from withholding: give it a footprint so that adherence can be seen' : 'cannot be evaluated: give it a footprint, or enable withholding to learn its effect'];
        else [verdict, action] = ['followed; effect unknown', 'nothing to compare with: enable withholding, or replay a step without it'];
        return { facet: f.ref, guards: f.guards, observable, ablatable: f.ablatable, exposed: exposed.length, withheld: withheld.length, adherence, withRule, without, effect, byModel, cost, verdict, action };
    });
}

/** Failure modes against the rules that guard them: incidents, guards, gaps, and a trial per gap. */
export function coverage(events, facets, { loaded = new Set(facets.map((f) => f.ref)) } = {}) {
    const incidents = new Map();
    const add = (mode, what) => incidents.set(mode, [...(incidents.get(mode) ?? []), what]);
    for (const e of events) {
        if (e.kind === 'verdict') for (const f of e.fixes ?? []) add(f.mode ?? 'other', { item: e.item, agent: f.agent, note: f.note ?? null });
        if (e.kind === 'escape') add(e.mode ?? 'other', { item: e.item, agent: null, note: `found later, fixed by ${e.fix}` });
    }
    return [...new Set([...MODES, ...incidents.keys()])].map((mode) => {
        const hits = incidents.get(mode) ?? [];
        const guards = facets.filter((f) => f.guards.includes(mode)).map((f) => f.ref);
        const active = guards.filter((g) => loaded.has(g));
        const gap = hits.length > 0 && active.length === 0;
        const last = hits.at(-1);
        return { mode, incidents: hits.length, guards, active, gap, recurring: hits.length >= 3 && active.length > 0, trial: gap || (hits.length >= 3 && last) ? `Trial harvested from ${last.item}: ${last.agent ?? 'the team'} produced "${mode}"${last.note ? ` — ${last.note}` : ''}. Pass: the same task ends without it.` : null };
    }).filter((c) => c.incidents || c.guards.length);
}

export function renderDiagnosis(rows) {
    const pct = (r) => (r && r.n ? `${Math.round(r.p * 100)}% (${r.k}/${r.n})` : '—');
    const order = ['works when followed, mostly ignored', 'ignored', 'followed, no measurable effect', 'no measurable effect', 'model-dependent', 'works', 'followed; effect unknown', 'unobservable', 'thin', 'never used'];
    const sorted = [...rows].sort((a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict) || b.exposed - a.exposed);
    const counts = order.map((v) => [v, rows.filter((r) => r.verdict === v).length]).filter(([, n]) => n);
    return [
        `${rows.length} facets — ${counts.map(([v, n]) => `${v}: ${n}`).join(' · ')}`,
        '',
        ...sorted.filter((r) => !['never used', 'thin'].includes(r.verdict)).flatMap((r) => [
            `${r.facet} — ${r.verdict}`,
            `    exposed ${r.exposed}${r.withheld ? `, withheld ${r.withheld}` : ''} · followed ${r.observable ? pct(r.adherence) : 'not observable'} · clean with it ${pct(r.withRule)} · without ${pct(r.without)}${r.effect !== null ? ` · effect ${r.effect > 0 ? '+' : ''}${Math.round(r.effect * 100)} points` : ''}${r.cost.with && r.cost.without ? ` · median tokens ${r.cost.with} vs ${r.cost.without}` : ''}`,
            `    → ${r.action}`,
        ]),
    ].join('\n');
}

export function renderCoverage(rows) {
    return rows.sort((a, b) => Number(b.gap) - Number(a.gap) || b.incidents - a.incidents).map((c) => `${c.gap ? 'GAP      ' : c.recurring ? 'RECURRING' : '         '} ${c.mode.padEnd(19)} incidents ${String(c.incidents).padStart(2)} · guarded by ${c.active.length ? c.active.join(', ') : c.guards.length ? `nothing loaded (exists: ${c.guards.join(', ')})` : 'nothing'}${c.trial ? `\n          ${c.trial}` : ''}`).join('\n') || 'no incidents and no guards on record';
}
