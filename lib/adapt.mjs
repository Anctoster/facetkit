// adapt: the route of an item is not fixed when it opens. While the work runs, the record can show
// that the item is riskier than planned, that the next agent keeps making the same mistake here, or
// that its model keeps falling short — and the route changes, by rules, with every change recorded
// and its reason in words.
//
//  grow      the files changed so far are planned again (lib/planner.mjs). A risk class or a
//            gate the opening plan did not see adds its agents and gates before the verdict —
//            a change that turned out to touch security gets the security review it needs.
//  reinforce the next agent has been blamed for the same cause at least `recurring` times on this
//            project: the rules that guard that cause and are not in its loadout are added for
//            this step, and the reason is printed with them.
//  escalate  the agent's record on its model is weak beyond doubt (enough items, the upper bound
//            of its first-pass rate below `weak`): this step runs one model up.
//
// What it never does: remove a step, drop a gate, lower a model, or touch a running step. Adapting
// can make an item more careful, never less. Each adaptation is an event, so it is part of what
// the proof of the item rests on, and `facet flow status` shows it.
import { matrix, observations } from './evalx.mjs';
import { patterns } from './evolve.mjs';
import { ofItem } from './journal.mjs';

export const ADAPT = { recurring: 3, weak: 0.5, minN: 5, window: 30 };

/** Adaptations already recorded for an item. */
export const adaptationsOf = (events, item) => ofItem(events, item).filter((e) => e.kind === 'route.adapt');
const keyOf = (a) => `${a.op}|${a.step}|${a.agent ?? ''}|${(a.facets ?? []).join(',')}|${a.model ?? ''}`;

/**
 * New adaptations for an item, from: its state, the flow definition, the plan of the files changed
 * so far (or null), the whole journal, the facets of the kit and the loadouts.
 */
/** Rework causes a stronger model can plausibly remove; format and bookkeeping causes are not among them. */
export const CAPABILITY = ['false-green', 'seam-break', 'spec-gap', 'regression', 'weakened-test', 'lost-work', 'loop', 'repeated-mistake'];

export function adapt({ state, flow, plan = null, events, facets = [], loadoutOf = () => [], limits = ADAPT }) {
    if (!state || state.closed) return [];
    const out = [];
    const have = new Set(adaptationsOf(events, state.item).map(keyOf));
    const steps = state.steps;
    const judgeAt = steps.findIndex((s) => s.verdict);
    const judged = judgeAt >= 0 && steps[judgeAt].status === 'done' && state.verdict === 'PASS';
    const add = (a) => {
        if (!have.has(keyOf(a))) {
            have.add(keyOf(a));
            out.push(a);
        }
    };
    // grow: the plan of what actually changed asks for more than the route has
    if (plan && !judged) {
        const onRoute = new Set(steps.map((s) => s.agent).filter(Boolean));
        const gatesNow = new Set(steps.filter((s) => s.gates).flatMap((s) => s.agents ?? []));
        for (const agent of plan.route) {
            if (onRoute.has(agent)) continue;
            const def = flow.steps.find((s) => s.optional && s.agent === agent);
            if (!def) continue;
            // place it where the flow places it: before the first step that comes after it in the flow and is not done
            const order = flow.steps.map((s) => s.id);
            const before = steps.find((s) => order.indexOf(s.id) > order.indexOf(def.id) && s.status !== 'done') ?? steps[judgeAt] ?? null;
            if (!before) continue;
            const why = `the files changed so far ask for it: ${plan.risk.reasons.slice(0, 2).join('; ') || `risk ${plan.risk.level}`}`;
            // the step it belongs before has already started: it can no longer shape that work, only review it —
            // so it goes after the started step, in REVIEW mode, and the started step's work is not thrown away
            if (before.attempts > 0) {
                const at = steps.indexOf(before);
                const after = steps.slice(at + 1).find((s) => s.status !== 'done') ?? steps[judgeAt] ?? null;
                if (!after) continue;
                add({ op: 'insert', step: def.id, before: after.id, agent, def: { id: def.id, agent: def.agent, mode: 'REVIEW', phase: def.phase }, review: before.id, why: `${why} — ${before.id} had already started, so it reviews that work instead of preceding it` });
                continue;
            }
            add({ op: 'insert', step: def.id, before: before.id, agent, def: { id: def.id, agent: def.agent, mode: def.mode, phase: def.phase }, why });
        }
        const missing = plan.gates.filter((g) => !gatesNow.has(g));
        if (missing.length) {
            const gateStep = steps.find((s) => s.gates);
            if (gateStep) add({ op: 'gates', step: gateStep.id, agents: missing, why: `locked by the plan of the changed files: ${plan.locked.map((l) => l.why).join('; ')}` });
            else if (judgeAt >= 0) add({ op: 'insert', step: 'gates', before: steps[judgeAt].id, def: { id: 'gates', gates: true, agents: missing }, agents: missing, why: `a gate the opening plan did not need: ${plan.locked.map((l) => l.why).join('; ')}` });
        }
    }
    // the next step that will be called
    const next = steps.find((s) => s.status === 'pending' && s.agent);
    if (next) {
        // reinforce: the same cause, blamed on this agent, again and again
        for (const p of patterns(events, { limits: { minIncidents: limits.recurring, window: limits.window } }).filter((x) => x.agent === next.agent)) {
            const given = new Set(loadoutOf(next));
            const guards = facets.filter((f) => f.guards.includes(p.mode) && !given.has(f.ref)).map((f) => f.ref).slice(0, 2);
            if (guards.length) add({ op: 'reinforce', step: next.id, agent: next.agent, facets: guards, why: `${next.agent} was sent back for "${p.mode}" in ${p.items.length} items (${p.items.slice(-3).join(', ')})` });
        }
        // escalate: a record on this model that is weak beyond doubt
        const ladder = flow.ladder ?? [];
        const row = matrix(observations(events), { minN: limits.minN }).find((r) => r.agent === next.agent && r.model === (next.model ?? null));
        const at = row ? ladder.indexOf(row.model) : -1;
        // a stronger model fixes reasoning, not bookkeeping: escalate only when most of this agent's reworks had a capability cause
        const causes = events.filter((e) => e.kind === 'verdict' && e.verdict === 'REWORK').flatMap((e) => (e.fixes ?? []).filter((f) => f.agent === next.agent).map((f) => f.mode ?? 'other'));
        const capability = causes.filter((c) => CAPABILITY.includes(c)).length;
        const forCapability = causes.length === 0 || capability * 2 >= causes.length;
        if (row && row.n >= limits.minN && row.high < limits.weak && forCapability && at >= 0 && at < ladder.length - 1) add({ op: 'model', step: next.id, agent: next.agent, model: ladder[at + 1], why: `${next.agent} on ${row.model}: first pass in ${row.n} items is at most ${Math.round(row.high * 100)}% (80% interval)` });
    }
    return out;
}

/** Applies recorded adaptations to an item's steps (pure): inserted steps, extra gates. */
export function applyAdaptations(steps, events) {
    let out = steps.map((s) => ({ ...s }));
    for (const a of events) {
        if (a.op === 'insert' && !out.some((s) => s.id === a.step)) {
            const at = out.findIndex((s) => s.id === a.before);
            const s = { ...a.def, status: 'pending', attempts: 0, notes: [], adapted: a.why };
            out = at < 0 ? [...out, s] : [...out.slice(0, at), s, ...out.slice(at)];
        } else if (a.op === 'gates') {
            const g = out.find((s) => s.id === a.step);
            if (g) {
                g.agents = [...new Set([...(g.agents ?? []), ...a.agents])];
                if (g.status === 'done') Object.assign(g, { status: 'pending', adapted: a.why });
            }
        }
    }
    return out;
}
/** For a step: the extra rules and the model the record asks for. */
export function adaptationFor(events, item, stepId) {
    const mine = adaptationsOf(events, item).filter((a) => a.step === stepId);
    return { facets: [...new Set(mine.filter((a) => a.op === 'reinforce').flatMap((a) => a.facets))], model: mine.filter((a) => a.op === 'model').at(-1)?.model ?? null, why: mine.map((a) => a.why) };
}
export const renderAdaptations = (list) => list.map((a) => `  ↻ ${a.op === 'insert' ? `+ step ${a.step} (${a.agent ?? (a.agents ?? []).join(', ')}) before ${a.before}` : a.op === 'gates' ? `+ gate ${a.agents.join(', ')}` : a.op === 'reinforce' ? `${a.step}: + rules ${a.facets.join(', ')}` : `${a.step}: model ${a.model}`} — ${a.why}`).join('\n');
