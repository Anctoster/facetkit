// intelligence: the team's competences are managed by experiment, not by opinion.
//
// A facet is a hypothesis about behaviour. This module tests such hypotheses the way a careful lab
// would, on the team's real work:
//
//  design      written before the data: the facet, the arms, one primary outcome, the sample size,
//              what is held equal. Arms can differ in whether the facet is delivered, in its
//              wording (a candidate variant), in the model that reads it, and in where it stands
//              among the other rules — so "does it help", "does it help a smaller model" and
//              "does its position matter" are separate, answerable questions.
//  strata      like is compared with like. Every unit (one step of one item) belongs to a stratum:
//              the agent's role, the class of task and its difficulty — all three known BEFORE the
//              work starts, so the outcome cannot leak into them. Arms are dealt in shuffled
//              blocks inside each stratum: every stratum gets every arm equally often.
//  outcomes    measured from the journal, never reported by the agent under test: errors blamed
//              on the step, defects found after acceptance (false passes), retries, tokens,
//              minutes, and whether the item closed clean.
//  inference   a stratified permutation test and a stratified bootstrap interval, both seeded, so a
//              result can be recomputed to the digit. Thresholds are adjusted for every comparison
//              read (Holm). Thirty units per arm is the default floor; below the floor, or without
//              strata shared by both arms, the answer is "not enough data".
//  stages      exploratory → confirmed (an independent repetition agrees) — and only a confirmed
//              result may change a facet. The engine proposes; a person adopts.
import { itemState } from './flow.mjs';
import { closedItems, minutesBetween, ofItem } from './journal.mjs';
import { sha } from './text.mjs';

export const DESIGN_SCHEMA = 2;
/** name → [how it is read from a unit, whether smaller is better]. */
export const METRICS = {
    clean: { better: 'higher', what: 'the item closed without rework and without a defect found later' },
    errors: { better: 'lower', what: 'fixes the inspector blamed on this step' },
    falsePasses: { better: 'lower', what: 'defects found after the item was accepted' },
    retries: { better: 'lower', what: 'extra attempts of the step' },
    tokens: { better: 'lower', what: 'tokens the step spent' },
    minutes: { better: 'lower', what: 'minutes the step ran' },
};
export const STRATA = ['agent', 'taskClass', 'difficulty'];

/** The classic four: without, with, with on another model, with in another position. */
export const fourArms = (otherModel) => [
    { id: 'A', facet: 'off' },
    { id: 'B', facet: 'on' },
    { id: 'C', facet: 'on', model: otherModel },
    { id: 'D', facet: 'on', order: 'last' },
];

export function newDesign({ id, facet, seed, arms = [{ id: 'A', facet: 'off' }, { id: 'B', facet: 'on' }], control = arms[0]?.id, primary = 'clean', strata = STRATA, minPerArm = 30, alpha = 0.05, confirms = null, hypothesis = null, proposal = null, now = new Date().toISOString() }) {
    if (!id || !facet) throw new Error('a design needs an id and a facet');
    if (seed === undefined || seed === null || seed === '') throw new Error('a design needs a seed, written down before the first unit');
    if (!METRICS[primary]) throw new Error(`unknown primary outcome "${primary}" (one of: ${Object.keys(METRICS).join(', ')})`);
    if (arms.length < 2 || new Set(arms.map((a) => a.id)).size !== arms.length) throw new Error('a design needs at least two arms with different ids');
    if (!arms.some((a) => a.id === control)) throw new Error(`the control arm "${control}" is not among the arms`);
    for (const a of arms) if (!['on', 'off', 'variant'].includes(a.facet) || (a.facet === 'variant' && !a.variant)) throw new Error(`arm ${a.id}: facet must be "on", "off" or "variant" with a "variant" file`);
    if (minPerArm < 10) throw new Error('fewer than 10 units per arm cannot carry a conclusion; the default is 30');
    return { schemaVersion: DESIGN_SCHEMA, id, facet, status: 'planned', seed: String(seed), arms, control, primary, secondary: Object.keys(METRICS).filter((m) => m !== primary), strata, minPerArm, alpha, confirms, proposal,
        hypothesis: hypothesis ?? `with ${facet} delivered, "${primary}" is ${METRICS[primary].better} than without it`, createdAt: now };
}

/**
 * Units needed in each arm to see a change of a yes/no outcome from rate `from` to rate `to`
 * (two-sided, normal approximation). The floor of 30 is a floor, not a plan: at 30 per arm only
 * very large effects are visible, so a design should carry the number this returns.
 */
export function unitsNeeded(from, to, { alpha = 0.05, power = 0.8 } = {}) {
    if (!(from >= 0 && from <= 1 && to >= 0 && to <= 1) || from === to) throw new Error('give two different rates between 0 and 1');
    const z = (p) => { // inverse normal, Beasley-Springer-Moro central region is enough here
        const t = Math.sqrt(-2 * Math.log(1 - p));
        return t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
    };
    const pbar = (from + to) / 2;
    const n = (z(1 - alpha / 2) * Math.sqrt(2 * pbar * (1 - pbar)) + z(power) * Math.sqrt(from * (1 - from) + to * (1 - to))) ** 2 / (from - to) ** 2;
    return Math.ceil(n);
}

export const stratumOf = (design, facts) => design.strata.map((k) => `${k}=${facts[k] ?? '?'}`).join('|');

function shuffled(ids, key) {
    return ids.map((id) => [sha(`${key}|${id}`, 12), id]).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map((x) => x[1]);
}
/**
 * The arm of the k-th unit of a stratum (k counts from 0, in journal order). Arms come in shuffled
 * blocks, one of each per block, so no stratum can end up with one arm only.
 */
export function armFor(design, stratum, k) {
    const m = design.arms.length;
    return shuffled(design.arms.map((a) => a.id), `${design.seed}|${design.id}|${stratum}|${Math.floor(k / m)}`)[k % m];
}
/** How many units of this stratum the journal already holds for the design. */
export function unitsSoFar(events, design, stratum) {
    const seen = new Set();
    for (const e of events) if (e.kind === 'step.start') for (const x of e.experiments ?? []) if (x.id === design.id && x.stratum === stratum) seen.add(`${e.item}|${e.step}`);
    return seen.size;
}
/** The assignment recorded for a unit earlier (a rework or a resume keeps its arm), or null. */
export function armOfUnit(events, design, item, step) {
    for (const e of events) if (e.kind === 'step.start' && e.item === item && e.step === step) for (const x of e.experiments ?? []) if (x.id === design.id) return x;
    return null;
}

/** One row per assigned unit of a closed item, with every outcome read from the journal. */
export function unitsOf(events, design) {
    const closed = new Set(closedItems(events));
    const rows = [];
    let open = 0;
    const seen = new Set();
    for (const e of events) {
        if (e.kind !== 'step.start') continue;
        const mine = (e.experiments ?? []).find((x) => x.id === design.id);
        const key = `${e.item}|${e.step}`;
        if (!mine || seen.has(key)) continue;
        seen.add(key);
        if (!closed.has(e.item)) {
            open++;
            continue;
        }
        const item = ofItem(events, e.item);
        const starts = item.filter((x) => x.kind === 'step.start' && x.step === e.step && !x.assist);
        const ends = item.filter((x) => x.kind === 'step.end' && x.step === e.step);
        const fixes = item.filter((x) => x.kind === 'verdict').flatMap((v) => v.fixes ?? []).filter((f) => f.agent === e.agent);
        const late = events.filter((x) => x.kind === 'escape' && x.item === e.item).length;
        const minutes = starts.reduce((sum, s, i) => sum + (ends[i] ? minutesBetween(s.at, ends[i].at) : 0), 0);
        const tokens = ends.reduce((sum, x) => sum + (x.tokens ?? 0), 0);
        const arm = design.arms.find((a) => a.id === mine.arm);
        const delivered = (e.facets ?? []).includes(design.facet);
        rows.push({ unit: key, item: e.item, step: e.step, arm: mine.arm, stratum: mine.stratum ?? '?', model: e.model ?? null,
            // delivery is checked against the arm: a control that got the facet, or the wrong model, is not an observation
            broken: !arm || (arm.facet === 'off') === delivered || (!!arm.model && e.model !== arm.model),
            clean: fixes.length === 0 && late === 0 && (itemState(events, e.item)?.cycles ?? 0) === 0 ? 1 : 0,
            errors: fixes.length, falsePasses: late, retries: Math.max(0, starts.length - 1), tokens: ends.some((x) => x.tokens !== undefined) ? tokens : null, minutes: +minutes.toFixed(1) });
    }
    return { rows, open };
}

// ---- inference: seeded, stratified, assumption-free ------------------------------------------
function rng(seed) { // mulberry32 over a hash of the seed: the same seed, the same draws, on any machine
    let a = parseInt(sha(String(seed), 8), 16) >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
/** Difference of means (treatment − control), averaged over the strata that hold both arms, weighted by their size. */
function stratifiedDiff(groups) {
    let num = 0;
    let den = 0;
    for (const g of groups) {
        if (!g.t.length || !g.c.length) continue;
        const w = g.t.length + g.c.length;
        num += w * (mean(g.t) - mean(g.c));
        den += w;
    }
    return den ? num / den : null;
}
/**
 * Compares one arm with the control on one metric. Returns the stratified difference, a bootstrap
 * interval and a permutation p-value; `n` counts only units in strata that hold both arms.
 */
export function compareArms(rows, metric, arm, control, { seed = 'facet', rounds = 2000, level = 0.95 } = {}) {
    const usable = rows.filter((r) => !r.broken && r[metric] !== null && r[metric] !== undefined && (r.arm === arm || r.arm === control));
    const strata = [...new Set(usable.map((r) => r.stratum))].sort();
    const groups = strata.map((s) => ({ s, t: usable.filter((r) => r.stratum === s && r.arm === arm).map((r) => r[metric]), c: usable.filter((r) => r.stratum === s && r.arm === control).map((r) => r[metric]) }));
    const shared = groups.filter((g) => g.t.length && g.c.length);
    const nT = shared.reduce((s, g) => s + g.t.length, 0);
    const nC = shared.reduce((s, g) => s + g.c.length, 0);
    const diff = stratifiedDiff(shared);
    if (diff === null) return { metric, arm, control, nArm: 0, nControl: 0, strata: 0, lost: usable.length, diff: null, low: null, high: null, p: null };
    const rand = rng(`${seed}|${metric}|${arm}|${control}`);
    // permutation: inside each stratum the labels are exchangeable if the arm makes no difference
    let extreme = 0;
    for (let i = 0; i < rounds; i++) {
        const perm = shared.map((g) => {
            const all = [...g.t, ...g.c];
            for (let j = all.length - 1; j > 0; j--) {
                const k = Math.floor(rand() * (j + 1));
                [all[j], all[k]] = [all[k], all[j]];
            }
            return { t: all.slice(0, g.t.length), c: all.slice(g.t.length) };
        });
        if (Math.abs(stratifiedDiff(perm)) >= Math.abs(diff) - 1e-12) extreme++;
    }
    const boots = [];
    const draw = (xs) => xs.map(() => xs[Math.floor(rand() * xs.length)]);
    for (let i = 0; i < rounds; i++) boots.push(stratifiedDiff(shared.map((g) => ({ t: draw(g.t), c: draw(g.c) }))));
    boots.sort((a, b) => a - b);
    const tail = (1 - level) / 2;
    return { metric, arm, control, nArm: nT, nControl: nC, strata: shared.length, lost: usable.length - nT - nC,
        armMean: +mean(shared.flatMap((g) => g.t)).toFixed(3), controlMean: +mean(shared.flatMap((g) => g.c)).toFixed(3),
        diff: +diff.toFixed(4), low: +boots[Math.floor(tail * rounds)].toFixed(4), high: +boots[Math.min(rounds - 1, Math.ceil((1 - tail) * rounds))].toFixed(4), p: +((extreme + 1) / (rounds + 1)).toFixed(4) };
}

/** Holm's step-down: which of the p-values stay significant when all of them are read together. */
export function holm(ps, alpha) {
    const order = ps.map((p, i) => [p, i]).filter((x) => x[0] !== null).sort((a, b) => a[0] - b[0]);
    const keep = new Array(ps.length).fill(false);
    for (let k = 0; k < order.length; k++) {
        if (order[k][0] > alpha / (order.length - k)) break;
        keep[order[k][1]] = true;
    }
    return keep;
}

/**
 * The full reading of a design. `prior` is the analysis of the design this one confirms.
 * Per arm (against the control): the primary outcome with its verdict, and the secondary outcomes
 * marked as exploratory — they describe, they do not decide.
 */
export function analyseDesign(events, design, { rounds = 2000, prior = null } = {}) {
    const { rows, open } = unitsOf(events, design);
    const broken = rows.filter((r) => r.broken).length;
    const others = design.arms.filter((a) => a.id !== design.control);
    const opts = { seed: design.seed, rounds };
    const primary = others.map((a) => compareArms(rows, design.primary, a.id, design.control, opts));
    const significant = holm(primary.map((c) => c.p), design.alpha);
    const sign = METRICS[design.primary].better === 'higher' ? 1 : -1;
    const arms = others.map((a, i) => {
        const c = primary[i];
        const enough = c.nArm >= design.minPerArm && c.nControl >= design.minPerArm;
        const direction = !enough || !significant[i] ? 'none' : c.diff * sign > 0 ? 'better' : 'worse';
        const secondary = design.secondary.map((m) => compareArms(rows, m, a.id, design.control, opts));
        const keep = holm(secondary.map((s) => s.p), design.alpha);
        return { arm: a.id, what: describeArm(a), primary: c, enough, direction, secondary: secondary.map((s, j) => ({ ...s, notable: keep[j] && s.nArm >= design.minPerArm && s.nControl >= design.minPerArm })) };
    });
    const main = arms[0];
    const agrees = prior && prior.arms?.[0] && prior.arms[0].direction !== 'none' && prior.arms[0].direction === main?.direction;
    const stage = design.confirms ? (agrees ? 'confirmed' : 'confirmatory') : 'exploratory';
    const balance = {};
    for (const r of rows) (balance[r.stratum] ??= {})[r.arm] = (balance[r.stratum][r.arm] ?? 0) + 1;
    return { id: design.id, facet: design.facet, primary: design.primary, control: design.control, stage, units: rows.length, open, broken, balance, arms,
        verdict: broken > rows.length * 0.1 ? `invalid: ${broken} of ${rows.length} units did not receive what their arm prescribes` : !main?.enough ? `not enough data: ${design.minPerArm} comparable units are needed in each arm (have ${main?.primary.nControl ?? 0} control, ${main?.primary.nArm ?? 0} in arm ${main?.arm})` : main.direction === 'none' ? 'no effect shown at this sample size' : `arm ${main.arm} is ${main.direction} than ${design.control} on "${design.primary}"`,
        action: stage === 'confirmed' ? `confirmed (${main.direction}): the change may be adopted by a person — facet evolve adopt` : main?.direction && main.direction !== 'none' ? 'repeat on an independent sample (a new design with --confirms) before anything is changed' : 'keep collecting; change nothing' };
}
const describeArm = (a) => [a.facet === 'off' ? 'facet withheld' : a.facet === 'variant' ? `candidate wording (${a.variant})` : 'facet delivered', a.model ? `on ${a.model}` : null, a.order ? `placed ${a.order}` : null].filter(Boolean).join(', ');

export function renderDesign(a) {
    const pct = (x) => (x === null || x === undefined ? '—' : x);
    return [
        `${a.id} · ${a.facet} · primary outcome "${a.primary}" · ${a.stage} · ${a.units} units${a.open ? ` (+${a.open} in open items)` : ''}${a.broken ? ` · ${a.broken} broken deliveries` : ''}`,
        ...a.arms.flatMap((x) => [
            `  arm ${x.arm} (${x.what}) vs ${a.control}: ${pct(x.primary.armMean)} vs ${pct(x.primary.controlMean)}  difference ${pct(x.primary.diff)} [${pct(x.primary.low)}, ${pct(x.primary.high)}]  p=${pct(x.primary.p)}  n=${x.primary.nArm}+${x.primary.nControl} in ${x.primary.strata} shared strata → ${x.enough ? x.direction : 'not enough data'}`,
            ...x.secondary.filter((s) => s.diff !== null).map((s) => `      ${s.metric.padEnd(12)} ${String(s.armMean).padStart(9)} vs ${String(s.controlMean).padEnd(9)} difference ${s.diff} [${s.low}, ${s.high}]${s.notable ? '  ← worth a design of its own' : ''}`),
        ]),
        `  verdict: ${a.verdict}`,
        `  next: ${a.action}`,
    ].join('\n');
}
