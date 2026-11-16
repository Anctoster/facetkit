// experiments: whether a rule changes what agents do is an empirical question, and it is answered
// like one — a hypothesis written down before the data, two groups drawn by a seed, like compared
// with like, and a verdict that says "not enough data" when that is the truth.
//
//  manifest    one file per experiment: the facet, the seed, the primary outcome, the sample size,
//              and what must be held equal (model, class of task). Written before the first unit.
//  unit        one step of one item. Its arm is a pure function of seed, experiment and unit:
//              anyone can recompute who got what, and nobody can choose it after seeing a result.
//  arms        control — the agent receives the facet; treatment — the facet is withheld.
//  outcome     first-pass: the item closed without a rework cycle.
//  stages      exploratory → confirmatory (an independent repetition, declared with `confirms`) →
//              validated (both show the same direction). One experiment never validates anything,
//              and nothing here deletes a facet: the report ends with a decision for a person.
import fs from 'node:fs';
import path from 'node:path';
import { itemState } from './flow.mjs';
import { closedItems } from './journal.mjs';
import { sha } from './text.mjs';

export const EXPERIMENT_SCHEMA = 1;
export const ARMS = ['control', 'treatment'];

export function newExperiment({ id, facet, seed, minSamples = 20, model = null, taskClass = null, loadout = null, confirms = null, hypothesis = null, now = new Date().toISOString() }) {
    if (!id || !facet) throw new Error('an experiment needs an id and a facet');
    if (seed === undefined || seed === null || seed === '') throw new Error('an experiment needs a seed, written down before the first unit');
    return { schemaVersion: EXPERIMENT_SCHEMA, id, facet, status: 'planned', seed: String(seed), primary: 'first-pass', hypothesis: hypothesis ?? `with ${facet} delivered, more items close without rework than with it withheld`, minSamples, model, taskClass, loadout, confirms, createdAt: now };
}

/** Rules that guard safety may never be withheld, whatever an experiment asks for. */
export function assertAblatable(facet) {
    if (!facet) throw new Error('unknown facet');
    if (!facet.ablatable) throw new Error(facet.withhold === 'replay' ? `${facet.ref} is marked "ablatable: replay": it is never withheld in real work — measure it with facet cf (counterfactual replay)` : `${facet.ref} is marked "ablatable: ${facet.withhold ?? 'no'}": it guards safety and is never withheld`);
    return true;
}

/** The arm of a unit: deterministic in (seed, experiment, unit). */
export const assign = (manifest, unit) => ARMS[parseInt(sha(`${manifest.seed}|${manifest.id}|${unit}`, 8), 16) % 2];
export const unitOf = (item, step) => `${item}|${step}`;

/** One row per unit that was assigned and whose item has closed. Units that break the held-equal conditions are counted apart. */
export function observationsOf(events, manifest) {
    const closed = new Set(closedItems(events));
    const rows = [];
    const excluded = { open: 0, model: 0, taskClass: 0 };
    const seen = new Set();
    for (const e of events.filter((x) => x.kind === 'step.start')) {
        const mine = (e.experiments ?? []).find((x) => x.id === manifest.id);
        if (!mine || seen.has(unitOf(e.item, e.step))) continue; // the first attempt of a unit is the observation
        seen.add(unitOf(e.item, e.step));
        if (!closed.has(e.item)) excluded.open++;
        else if (manifest.model && e.model !== manifest.model) excluded.model++;
        else if (manifest.taskClass && (mine.taskClass ?? null) !== manifest.taskClass) excluded.taskClass++;
        else rows.push({ unit: unitOf(e.item, e.step), item: e.item, step: e.step, arm: mine.arm, model: e.model ?? null, delivered: (e.facets ?? []).includes(manifest.facet), firstPass: (itemState(events, e.item)?.cycles ?? 0) === 0 });
    }
    return { rows, excluded };
}

// two-sided critical value for confidence 1-alpha (Acklam's approximation of the normal quantile)
function zFor(alpha) {
    const p = 1 - alpha / 2;
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    if (p > 0.97575) {
        const q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    const q = p - 0.5;
    const r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
function wilson(k, n, z) {
    if (!n) return { low: 0, high: 1 };
    const p = k / n;
    const d = 1 + (z * z) / n;
    const c = p + (z * z) / (2 * n);
    const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    return { low: +Math.max(0, (c - m) / d).toFixed(3), high: +Math.min(1, (c + m) / d).toFixed(3) };
}

/**
 * The result of one experiment. `comparisons` is how many experiments are read together: the
 * confidence of each interval is raised accordingly (Bonferroni), so that looking at many facets
 * at once does not manufacture a finding. `prior` is the analysis of the experiment this one confirms.
 */
export function analyse(events, manifest, { alpha = 0.1, comparisons = 1, prior = null } = {}) {
    const { rows, excluded } = observationsOf(events, manifest);
    const z = zFor(alpha / Math.max(1, comparisons));
    const arm = (name) => {
        const mine = rows.filter((r) => r.arm === name);
        const ok = mine.filter((r) => r.firstPass).length;
        return { n: mine.length, ok, rate: mine.length ? +(ok / mine.length).toFixed(3) : null, ...wilson(ok, mine.length, z) };
    };
    const control = arm('control');
    const treatment = arm('treatment');
    // a control unit that did not actually receive the facet, or a treatment unit that did, is a broken delivery
    const misdelivered = rows.filter((r) => (r.arm === 'control') !== r.delivered).length;
    const enough = control.n >= manifest.minSamples && treatment.n >= manifest.minSamples;
    let direction = 'none';
    if (enough && control.low > treatment.high) direction = 'helps';
    else if (enough && treatment.low > control.high) direction = 'hurts';
    let stage = 'exploratory';
    if (manifest.confirms) stage = prior && prior.direction !== 'none' && prior.direction === direction ? 'validated' : 'confirmatory';
    const verdict = misdelivered ? 'invalid: delivery did not follow the assignment' : !enough ? `not enough data: ${control.n} + ${treatment.n} units, ${manifest.minSamples} needed in each arm` : direction === 'none' ? 'no effect shown at this sample size' : `the facet ${direction}`;
    const action = stage === 'validated' ? `validated (${direction}): a person decides whether to keep, change or retire the facet` : direction !== 'none' && enough ? 'repeat on an independent sample (a new experiment with "confirms") before acting' : 'keep collecting; change nothing';
    return { id: manifest.id, facet: manifest.facet, stage, control, treatment, difference: control.rate !== null && treatment.rate !== null ? +(control.rate - treatment.rate).toFixed(3) : null, direction, enough, misdelivered, excluded, confidence: +(1 - alpha / Math.max(1, comparisons)).toFixed(4), verdict, action };
}

export const experimentsDir = (root) => path.join(root, 'trials', 'experiments');
export function loadExperiments(root) {
    const dir = experimentsDir(root);
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))) : [];
}
export function saveExperiment(root, manifest) {
    fs.mkdirSync(experimentsDir(root), { recursive: true });
    fs.writeFileSync(path.join(experimentsDir(root), `${manifest.id}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
}

export function renderAnalysis(a) {
    const row = (name, x) => `  ${name.padEnd(28)} ${String(x.ok).padStart(3)} of ${String(x.n).padStart(3)} first-pass${x.rate === null ? '' : `  ${Math.round(x.rate * 100)}%  (${Math.round(x.low * 100)}–${Math.round(x.high * 100)}%)`}`;
    return [
        `${a.id} · ${a.facet} · ${a.stage}`,
        row('control (facet delivered)', a.control),
        row('treatment (facet withheld)', a.treatment),
        `  verdict: ${a.verdict}`,
        `  next: ${a.action}`,
        a.excluded.open || a.excluded.model || a.excluded.taskClass ? `  left out: ${a.excluded.open} still open, ${a.excluded.model} on another model, ${a.excluded.taskClass} of another task class` : null,
    ].filter(Boolean).join('\n');
}
