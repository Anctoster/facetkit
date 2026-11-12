// retro: self-improvement that looks back instead of grading on the spot.
//  - Scores are beliefs, not marks: every piece of evidence about an agent — hard (a rework was
//    addressed to it), soft (it used more than its own usual budget), fractional (an inspector's
//    7 of 10, a human's "about half right") — moves a distribution, weighted and fading with age.
//    An agent is compared with its own history, not with a fixed bar.
//  - Evidence can arrive late: when a later fix repairs lines written during an earlier item,
//    that item's builder and the agents that should have caught the defect are debited in hindsight.
//  - A belief becomes a proposal only when the whole interval is on one side, and an adopted
//    change is itself reviewed after a few items: it stays only if the belief moved.
// Nothing here edits a prompt or a skill. It produces proposals with their evidence.
import { spawnSync } from 'node:child_process';
import { observations } from './evalx.mjs';
import { closedItems } from './journal.mjs';

const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};
export const DEFAULT_GUARDS = ['spec-falsifier', 'red-first-specifier', 'proof-inspector'];

/** Evidence derived from the journal, plus explicit `signal` and `escape` events. */
export function signals(events, { scoreMax = 10, guards = DEFAULT_GUARDS, builder = 'slice-builder', tokensOf } = {}) {
    const order = closedItems(events);
    const obs = observations(events, { tokensOf });
    const out = [];
    const push = (item, agent, dim, value, weight, why) => out.push({ item, index: order.indexOf(item), agent, dim, value, weight, why });
    for (const o of obs) {
        push(o.item, o.agent, 'first-pass', o.firstPass ? 1 : 0, 1, o.firstPass ? 'no rework addressed to it' : 'rework addressed to it');
        if (o.blocked) push(o.item, o.agent, 'flow', 0, 0.5, 'ended a step blocked');
        if (o.score !== null) push(o.item, o.agent, 'quality', Math.max(0, Math.min(1, o.score / scoreMax)), 1, `inspector score ${o.score}/${scoreMax}`);
        const earlier = obs.filter((x) => x.agent === o.agent && x.tier === o.tier && x.tokens && order.indexOf(x.item) < order.indexOf(o.item)).map((x) => x.tokens);
        if (o.tokens && earlier.length >= 3) {
            const ratio = o.tokens / median(earlier);
            if (ratio > 1.5) push(o.item, o.agent, 'thrift', 0, 0.5, `${ratio.toFixed(1)}× its own median for tier ${o.tier}`);
            else if (ratio < 0.75) push(o.item, o.agent, 'thrift', 1, 0.25, `${ratio.toFixed(1)}× its own median for tier ${o.tier}`);
            else push(o.item, o.agent, 'thrift', 1, 0.1, 'within its usual range');
        }
    }
    for (const e of events) {
        if (e.kind === 'signal' && order.includes(e.item)) push(e.item, e.agent, e.dim, e.value, e.weight ?? 1, e.why ?? 'recorded by hand');
        if (e.kind === 'escape' && order.includes(e.item)) {
            const on = new Set(obs.filter((o) => o.item === e.item).map((o) => o.agent));
            if (on.has(builder)) push(e.item, builder, 'first-pass', 0, 2, `defect escaped, fixed by ${e.fix}`);
            for (const g of guards) if (on.has(g)) push(e.item, g, 'quality', 0, 2, `did not catch a defect later fixed by ${e.fix}`);
        }
    }
    return out;
}

/** Belief per agent and dimension: Beta(1 + good, 1 + bad) with evidence fading by half every `halfLife` items. */
export function beliefs(sigs, { halfLife = 8, latest } = {}) {
    const last = latest ?? Math.max(0, ...sigs.map((s) => s.index));
    const map = new Map();
    for (const s of sigs) {
        const key = `${s.agent}|${s.dim}`;
        const b = map.get(key) ?? { agent: s.agent, dim: s.dim, good: 0, bad: 0, reasons: [] };
        const w = s.weight * 0.5 ** ((last - s.index) / halfLife);
        b.good += w * s.value;
        b.bad += w * (1 - s.value);
        if (s.value < 0.5) b.reasons.push(`${s.item}: ${s.why}`);
        map.set(key, b);
    }
    return [...map.values()].map((b) => {
        const a = 1 + b.good;
        const c = 1 + b.bad;
        const mean = a / (a + c);
        const sd = Math.sqrt((a * c) / ((a + c) ** 2 * (a + c + 1)));
        return { agent: b.agent, dim: b.dim, mean: +mean.toFixed(2), low: +Math.max(0, mean - 1.28 * sd).toFixed(2), high: +Math.min(1, mean + 1.28 * sd).toFixed(2), evidence: +(b.good + b.bad).toFixed(1), reasons: b.reasons.slice(-3) };
    });
}

export const DIM_FACETS = {
    'first-pass': ['spec-trace:verification-first', 'falsifiable-tests:right-reason-red', 'slice-seams:neighbour-run'],
    quality: ['claim-ledger:claim-evidence-pairs', 'falsifiable-tests:mutant-probe', 'claim-ledger:reproduce-not-quote'],
    thrift: ['thrift-loop:digest-runs', 'thrift-loop:anchored-reads', 'thrift-loop:no-replay'],
    flow: ['anchored-handoff:verify-on-read', 'anchored-handoff:parked-questions'],
};

/** Proposals where the evidence is one-sided. `loadouts` tells which facets the agent already reads. */
export function proposals(bs, { loadouts = {}, ladder = ['haiku', 'sonnet', 'opus'], minEvidence = 4, weakBelow = 0.6, strongAbove = 0.75, dimFacets = DIM_FACETS } = {}) {
    const out = [];
    const has = (agent) => {
        const r = loadouts.roles?.[agent];
        return new Set([...(r?.always ?? []), ...Object.values(r?.phases ?? {}).flat()]);
    };
    for (const b of bs) {
        if (b.evidence < minEvidence || b.high >= weakBelow) continue;
        const mine = has(b.agent);
        const missing = (dimFacets[b.dim] ?? []).filter((f) => !mine.has(f));
        const model = loadouts.roles?.[b.agent]?.model?.default;
        const up = ladder[ladder.indexOf(model) + 1];
        out.push({
            id: `${b.agent}:${b.dim}:${missing.length ? 'add-facet' : 'reword-or-escalate'}`,
            agent: b.agent,
            dim: b.dim,
            belief: `${b.mean} (${b.low}–${b.high}), evidence ${b.evidence}`,
            action: missing.length ? `add ${missing[0]} to a loadout of ${b.agent}, with a trial that reproduces: ${b.reasons.at(-1) ?? 'the pattern'}` : `the facets for "${b.dim}" are already loaded: reword the one that was ignored and add its trial${up ? `; if that was tried, run this agent one step up (${up}) for five items` : ''}`,
            reasons: b.reasons,
        });
    }
    for (const agent of new Set(bs.map((b) => b.agent))) {
        const mine = bs.filter((b) => b.agent === agent);
        const model = loadouts.roles?.[agent]?.model?.default;
        const down = ladder[ladder.indexOf(model) - 1];
        const core = mine.filter((b) => ['first-pass', 'quality'].includes(b.dim) && b.evidence >= minEvidence + 2);
        const weak = mine.some((b) => b.evidence >= minEvidence && b.high < weakBelow);
        if (down && !weak && core.some((b) => b.dim === 'first-pass') && core.every((b) => b.low > strongAbove)) out.push({ id: `${agent}:model:demote-trial`, agent, dim: 'model', belief: core.map((b) => `${b.dim} ${b.low}–${b.high}`).join(', '), action: `consistently strong on ${model}: replay two of its steps on ${down} (facet eval replay) before changing the loadout`, reasons: [] });
    }
    return out;
}

/** Did an adopted change earn its keep? Compares the dimension before and after the `change` event. */
export function reviewChanges(events, sigs, { minAfter = 5, gain = 0.1 } = {}) {
    const order = closedItems(events);
    return events.filter((e) => e.kind === 'change').map((c) => {
        const at = order.filter((id) => events.findIndex((e) => e.kind === 'item.close' && e.item === id) < events.indexOf(c)).length;
        const mine = sigs.filter((s) => s.agent === c.agent && s.dim === c.dim);
        const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x.value * x.weight, 0) / xs.reduce((s, x) => s + x.weight, 0) : null);
        const before = mean(mine.filter((s) => s.index < at && s.index >= at - 8));
        const afterSigs = mine.filter((s) => s.index >= at);
        const items = new Set(afterSigs.map((s) => s.item)).size;
        const after = mean(afterSigs);
        const verdict = items < minAfter ? `too early: ${items} of ${minAfter} items since the change` : before === null ? 'no baseline before the change' : after >= before + gain ? 'keep: the belief moved' : 'revert: no measurable effect';
        return { proposal: c.proposal, agent: c.agent, dim: c.dim, before: before === null ? null : +before.toFixed(2), after: after === null ? null : +after.toFixed(2), items, verdict };
    });
}

/**
 * Hindsight: which earlier items wrote the lines that commit `fix` had to change?
 * `itemOf(sha, subject)` maps a commit to an item id (or null).
 */
export function hindsight(root, fix, { itemOf, isTest = (f) => /\.(test|spec)\.|(^|\/)(tests?|e2e|acceptance)\//.test(f) } = {}) {
    const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf-8' }).stdout ?? '';
    const origins = new Map();
    let file = null;
    for (const line of git('diff', '-U0', `${fix}^`, fix).split('\n')) {
        if (line.startsWith('--- ')) file = line.startsWith('--- a/') ? line.slice(6) : null;
        const h = /^@@ -(\d+)(?:,(\d+))? /.exec(line);
        if (!h || !file || isTest(file)) continue;
        const count = h[2] === undefined ? 1 : Number(h[2]);
        if (!count) continue;
        for (const b of git('blame', '-l', '-s', '-L', `${h[1]},${Number(h[1]) + count - 1}`, `${fix}^`, '--', file).split('\n')) {
            const sha = /^\^?([0-9a-f]{7,40})/.exec(b)?.[1];
            if (!sha) continue;
            const subject = git('log', '-1', '--format=%s', sha).trim();
            const item = itemOf?.(sha, subject) ?? null;
            const key = item ?? `unknown:${sha.slice(0, 8)}`;
            const o = origins.get(key) ?? { item, lines: 0, files: new Set(), commits: new Set() };
            o.lines++;
            o.files.add(file);
            o.commits.add(sha.slice(0, 8));
            origins.set(key, o);
        }
    }
    return [...origins.values()].map((o) => ({ item: o.item, lines: o.lines, files: [...o.files], commits: [...o.commits] })).sort((a, b) => b.lines - a.lines);
}

export function renderBeliefs(bs) {
    return ['agent                  dimension    belief (80% interval)  evidence', ...[...bs].sort((a, b) => a.agent.localeCompare(b.agent) || a.dim.localeCompare(b.dim)).map((b) => `${b.agent.padEnd(22)} ${b.dim.padEnd(12)} ${String(b.mean).padEnd(5)} (${b.low}–${b.high})${' '.repeat(8)} ${b.evidence}`)].join('\n');
}
