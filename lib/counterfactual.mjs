// counterfactual: what would this step have produced without that rule? Asked of finished work,
// not of live work: a step whose start was snapshotted is re-run twice from the same snapshot —
// once with the rule and once without it, same agent, same model, same instruction — and the
// project's checks judge both runs. Each pair is its own control: the task, the code and the
// difficulty are identical, so the only difference left is the rule (and the model's own noise,
// which the "with" run measures).
//
// This is how rules that may never be withheld from real work (`ablatable: replay`) are measured,
// and it costs nothing to the item that already closed.
//
//  pair     { item, step, facet, with: passed/total, without: passed/total }
//  effect   the mean of (with − without) over pairs, as a share of the checks
//  test     a sign test over pairs that differ: how often would chance alone tilt this far
import fs from 'node:fs';
import path from 'node:path';
import { closedItems } from './journal.mjs';

/** Steps of closed items that had the facet and were snapshotted: where a counterfactual can be asked. */
export function candidates(events, facet) {
    const closed = new Set(closedItems(events));
    const snaps = new Set(events.filter((e) => e.kind === 'snapshot').map((e) => `${e.item}|${e.step}`));
    const out = new Map();
    for (const e of events) if (e.kind === 'step.start' && closed.has(e.item) && (e.facets ?? []).includes(facet) && snaps.has(`${e.item}|${e.step}`)) out.set(`${e.item}|${e.step}`, { item: e.item, step: e.step, agent: e.agent, model: e.model ?? null });
    return [...out.values()];
}
/** The rules file for one arm of a replay: the step's own rules, with or without the facet. */
export function armRules(renderedWith, facet, arm) {
    if (arm === 'with') return renderedWith;
    const blocks = renderedWith.split(/\n(?=## )/);
    return blocks.filter((b) => !b.includes(`\`${facet}\``)).join('\n');
}
/** Pairs from the journal: one `cf` event per judged arm. */
export function pairs(events, facet = null) {
    const runs = new Map();
    for (const e of events) if (e.kind === 'cf' && (!facet || e.facet === facet)) runs.set(`${e.facet}|${e.item}|${e.step}|${e.model}|${e.arm}`, e);
    const out = [];
    for (const [key, w] of runs) {
        if (w.arm !== 'with') continue;
        const wo = runs.get(key.replace(/\|with$/, '|without'));
        if (wo && w.total && wo.total) out.push({ facet: w.facet, item: w.item, step: w.step, model: w.model, with: w.passed / w.total, without: wo.passed / wo.total });
    }
    return out;
}
const choose = (n, k) => {
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return r;
};
/** Two-sided sign test: pairs where the facet helped against pairs where it hurt; ties are left out. */
export function signTest(up, down) {
    const n = up + down;
    if (!n) return 1;
    const k = Math.min(up, down);
    let p = 0;
    for (let i = 0; i <= k; i++) p += choose(n, i);
    return Math.min(1, +(2 * p * 0.5 ** n).toFixed(4));
}
export function cfReport(events, facet = null, { minPairs = 5 } = {}) {
    const all = pairs(events, facet);
    const facets = [...new Set(all.map((p) => p.facet))].sort();
    return facets.map((f) => {
        const mine = all.filter((p) => p.facet === f);
        const up = mine.filter((p) => p.with > p.without).length;
        const down = mine.filter((p) => p.with < p.without).length;
        const effect = +(mine.reduce((s, p) => s + p.with - p.without, 0) / mine.length).toFixed(3);
        const p = signTest(up, down);
        const verdict = mine.length < minPairs ? `not enough pairs (${mine.length} of ${minPairs})` : p < 0.1 ? (effect > 0 ? 'helps: without it, the checks fail more often' : 'hurts: without it, the checks pass more often') : 'no difference the pairs can show';
        return { facet: f, pairs: mine.length, helped: up, hurt: down, ties: mine.length - up - down, effect, p, verdict };
    });
}
export const renderCf = (rows) => (rows.length ? rows.map((r) => `${r.facet.padEnd(40)} ${String(r.pairs).padStart(3)} pairs · helped ${r.helped} · hurt ${r.hurt} · same ${r.ties} · effect ${r.effect >= 0 ? '+' : ''}${Math.round(r.effect * 100)} points of checks · p=${r.p}\n${' '.repeat(41)}${r.verdict}`).join('\n') : 'no counterfactual pairs yet: facet cf candidates --facet <skill:facet>');
export const writeRules = (dir, item, step, text) => {
    const file = path.join(dir, item, `rules-${step}.md`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return file;
};
