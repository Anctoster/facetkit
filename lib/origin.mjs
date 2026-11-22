// origin: which step a defect came from (plan 2.8, strategic plan 9.3).
//
// Run on every return, every remark of a person and every defect found after acceptance, for one
// criterion C of the item:
//
//  1. C is not in the approved list → the source is the step that stated the work (the brief): "done"
//     was never said. Brief or new wish — a person decides (cause). Nobody who worked is charged.
//  2. C has a chain of values (source → intermediate documents → result) → the links are compared
//     pairwise, from the source; the first pair that differs names the step that produced the later
//     link. A link no tool compares (a raster drawing read by eye) is `human` and is skipped.
//  3. The chain holds → C's check is run on the state after each step, from C's `by` step on:
//       never met → the `by` step did not do the work (`not-done`);
//       met after step k, broken at the end → bisection between k and the end finds the step that
//       broke it (`regression`).
//  4. No snapshots, or the check cannot be run → the step the reviewer names (`judged`). Such records
//     are shown, and are kept out of anything that changes skills.
//
// The algorithm takes its operations as arguments, so the same code serves the core (git snapshots
// of the working tree, configured checks) and the domains (scene transactions, model snapshots and
// the domain's tools, from domain.json "chains").
export const METHODS = ['measured', 'chain', 'human', 'judged'];
export const FROM = ['return', 'human', 'defect'];

/**
 * links: [{ name, step }] source first, as the criterion's chain names them, each with the step that
 * produces it. compare(a, b) → true (the same), false (differs) or null (no tool compares them).
 * Returns { link, step } of the first difference, or null when every comparable pair agrees.
 */
export async function chainBreak(links, compare) {
    for (let i = 1; i < links.length; i++) {
        const same = await compare(links[i - 1], links[i]);
        if (same === false) return { link: links[i].name, after: links[i - 1].name, step: links[i].step };
    }
    return null;
}

/**
 * states: the states after each step, in order — [{ step, check: async () => true | false | null }] —
 * starting with the `by` step, the last being the final state. Returns { step, cause, runs } or
 * null when a needed check could not be run.
 */
export async function measuredSource(states) {
    if (!states.length) return null;
    const seen = new Map();
    let runs = 0;
    const at = async (i) => {
        if (!seen.has(i)) {
            runs++;
            seen.set(i, await states[i].check());
        }
        return seen.get(i);
    };
    // the first state where the criterion was met, if any
    let met = -1;
    for (let i = 0; i < states.length; i++) {
        const ok = await at(i);
        if (ok === null) return null;
        if (ok) {
            met = i;
            break;
        }
    }
    if (met < 0) return { step: states[0].step, cause: 'not-done', runs };
    const last = states.length - 1;
    const end = await at(last);
    if (end === null) return null;
    if (end) return { step: null, cause: 'holds', runs }; // met at the end: nothing to find here
    // met at `met`, broken at `last`: the first broken state lies in (met, last]
    let lo = met;
    let hi = last;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        const ok = await at(mid);
        if (ok === null) return null;
        if (ok) lo = mid;
        else hi = mid;
    }
    return { step: states[hi].step, cause: 'regression', runs };
}

/**
 * The source of one finding. `steps`: the item's step ids in order; `criterion`: the approved
 * criterion or null; `briefStep`: the step that states the work; `chain`/`states`: as above (null
 * when the domain has none); `judgedStep`: what the reviewer says, used only when nothing measures.
 */
export async function findOrigin({ steps, criterion, briefStep, links = null, compare = null, states = null, judgedStep = null }) {
    if (!criterion) return { method: 'human', step: briefStep, cause: 'brief', charged: false, why: 'the criterion is not in the approved list: "done" was never said' };
    if (links && links.length > 1 && compare) {
        const b = await chainBreak(links, compare);
        if (b) return { method: 'chain', step: b.step, cause: 'chain', link: b.link, charged: true, why: `${b.after} and ${b.link} differ: the step that produced ${b.link} is the source` };
    }
    if (states && states.length) {
        const m = await measuredSource(states);
        if (m && m.cause !== 'holds') return { method: 'measured', step: m.step, cause: m.cause, runs: m.runs, charged: true, why: m.cause === 'not-done' ? `the check never held after ${m.step}: the work was not done` : `the check held, then ${m.step} broke it` };
        if (m && m.cause === 'holds') return { method: 'judged', step: judgedStep ?? criterion.by, cause: 'holds-now', charged: true, why: 'the check holds on the final state: what was found is not what the criterion measures — named by the reviewer' };
    }
    return { method: 'judged', step: judgedStep ?? criterion.by, cause: 'judged', charged: true, why: 'nothing could be measured: the source is named by the reviewer' };
}

/** How many steps late it was found: the index of the step that found it minus the source's (K4). */
export const delayOf = (steps, source, foundAt) => {
    const s = steps.indexOf(source);
    const f = foundAt === null ? steps.length : steps.indexOf(foundAt);
    return s < 0 || f < 0 ? null : Math.max(0, f - s);
};
