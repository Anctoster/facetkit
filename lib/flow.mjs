// flow: orchestration as a pure function of the journal. The orchestrator does not plan, remember
// or decide: it asks `next`, does exactly that, and reports the end of the step. The same call
// resumes an interrupted item, because an interrupted step is simply a start without an end.
import { minutesBetween, ofItem } from './journal.mjs';

export const DEFAULT_FLOW = {
    steps: [
        { id: 'open', agent: 'route-conductor', mode: 'OPEN', phase: 'open' },
        { id: 'map', agent: 'context-cartographer', phase: 'map' },
        { id: 'design', agent: 'blueprint-architect', phase: 'design', optional: true },
        { id: 'spec', agent: 'spec-falsifier', mode: 'SPEC', phase: 'red', optional: true },
        { id: 'red', agent: 'red-first-specifier', mode: 'RED', phase: 'red' },
        { id: 'build', agent: 'slice-builder', phase: 'build' },
        { id: 'probe', agent: 'spec-falsifier', mode: 'PROBE', phase: 'probe', optional: true },
        { id: 'ops', agent: 'release-pilot', phase: 'ops', optional: true },
        { id: 'gates', gates: true },
        { id: 'proof', agent: 'proof-inspector', phase: 'proof', verdict: true },
        { id: 'green', agent: 'red-first-specifier', mode: 'GREEN', phase: 'green', bookkeeping: true },
        { id: 'commit', manual: 'commit with the message from the build handoff; do not push' },
        { id: 'close', agent: 'route-conductor', mode: 'CLOSE', phase: 'close', bookkeeping: true },
    ],
    rework: { max: 2, rerun: ['gates', 'proof'] },
    ladder: ['haiku', 'sonnet', 'opus'],
    tiers: { hard: { 'context-cartographer': 'sonnet' } },
    escalateAfter: 2,
};

/** The concrete steps of one item: optional steps only when their agent is on the route. */
export function planSteps(flow, { route = [], gates = [] } = {}) {
    return flow.steps
        .filter((s) => !s.optional || route.includes(s.agent))
        .filter((s) => !s.gates || gates.length)
        .map((s) => (s.gates ? { ...s, agents: gates } : { ...s }));
}

/** Where an item stands, from its events alone. */
export function itemState(events, item) {
    const mine = ofItem(events, item);
    const opened = mine.find((e) => e.kind === 'item.open');
    if (!opened) return null;
    const steps = opened.steps.map((s) => ({ ...s, status: 'pending', attempts: 0, notes: [] }));
    const byId = (id) => steps.find((s) => s.id === id);
    const state = { item, tier: opened.tier ?? 'normal', openedAt: opened.at, steps, cycles: 0, verdict: null, closed: false, question: null };
    for (const e of mine) {
        const step = e.step ? byId(e.step) : null;
        if (e.kind === 'step.start' && step) {
            if (step.status === 'running') {
                step.resumes = (step.resumes ?? 0) + 1; // a second start of a running step is a resume: checkpoints are kept
                continue;
            }
            if (e.assist) step.assisting = e.assist;
            else step.attempts++;
            Object.assign(step, { status: 'running', startedAt: e.at, model: e.model ?? step.model, notes: [], endedAt: undefined });
        } else if (e.kind === 'note' && step) step.notes.push({ at: e.at, text: e.text });
        else if (e.kind === 'step.end' && step) {
            step.endedAt = e.at;
            step.tokens = (step.tokens ?? 0) + (e.tokens ?? 0);
            if (step.assisting) {
                const helped = byId(step.assisting);
                if (helped) Object.assign(helped, { status: 'pending', assisted: true });
                step.assisting = undefined;
                step.status = 'done';
            } else if (e.status === 'DONE') step.status = 'done';
            else if (e.status === 'BLOCKED') Object.assign(step, { status: 'blocked', blockedFor: e.for ?? null, question: e.question ?? null });
            else if (e.status === 'NEEDS-USER') Object.assign(step, { status: 'needs-user', question: e.question ?? null });
            else Object.assign(step, { status: 'pending', interrupted: true });
        } else if (e.kind === 'answer' && step) Object.assign(step, { status: 'pending', assisted: false, question: null });
        else if (e.kind === 'verdict') {
            state.verdict = e.verdict;
            if (e.verdict === 'REWORK') {
                state.cycles++;
                const owners = new Set((e.fixes ?? []).map((f) => f.agent));
                for (const s of steps) {
                    if (s.status !== 'done') continue;
                    if ((owners.has(s.agent) && !s.bookkeeping && !s.verdict) || (opened.rerun ?? []).includes(s.id)) Object.assign(s, { status: 'pending', rework: true });
                }
            }
        } else if (e.kind === 'item.close') state.closed = true;
    }
    return state;
}

/** The model of a step: the role's phase model, the tier override, one step up after repeated failure. */
export function modelFor(step, { loadouts = {}, flow = DEFAULT_FLOW, tier = 'normal' } = {}) {
    const role = loadouts.roles?.[step.agent];
    let model = flow.tiers?.[tier]?.[step.agent] ?? role?.model?.[step.phase] ?? role?.model?.default ?? null;
    if (!model) return { model: null, escalated: false };
    const ladder = flow.ladder ?? [];
    const escalated = step.attempts >= (flow.escalateAfter ?? 2) && ladder.indexOf(model) >= 0 && ladder.indexOf(model) < ladder.length - 1;
    if (escalated) model = ladder[ladder.indexOf(model) + 1];
    return { model, escalated };
}

/** The one thing to do now. Never more than one. */
export function next(state, { loadouts = {}, flow = DEFAULT_FLOW } = {}) {
    if (!state) return { action: 'open' };
    if (state.closed) return { action: 'complete', item: state.item };
    const { steps } = state;
    const running = steps.find((s) => s.status === 'running');
    if (running) return { action: 'resume', item: state.item, step: running.id, agent: running.agent, mode: running.mode, model: running.model ?? null };
    const waiting = steps.find((s) => s.status === 'needs-user');
    if (waiting) return { action: 'ask', item: state.item, step: waiting.id, agent: waiting.agent, question: waiting.question ?? 'see the handoff of this step' };
    const blocked = steps.find((s) => s.status === 'blocked');
    if (blocked) {
        const helper = blocked.blockedFor && !blocked.assisted ? [...steps].reverse().find((s) => s.agent === blocked.blockedFor && s.id !== blocked.id) : null;
        if (!helper) return { action: 'ask', item: state.item, step: blocked.id, agent: blocked.agent, question: blocked.question ?? `${blocked.agent} is blocked and nobody on the route can unblock it` };
        return { action: 'call', item: state.item, step: helper.id, agent: helper.agent, mode: helper.mode, assist: blocked.id, ...modelFor(helper, { loadouts, flow, tier: state.tier }), phase: helper.phase, why: `${blocked.agent} is blocked: read the note addressed to you in its handoff` };
    }
    if (state.verdict === 'REWORK' && state.cycles > (flow.rework?.max ?? 2)) return { action: 'ask', item: state.item, step: 'proof', question: `rework cycle ${state.cycles} exceeds the limit of ${flow.rework?.max ?? 2}: read the proof and decide` };
    const step = steps.find((s) => s.status === 'pending');
    if (!step) return { action: 'close', item: state.item };
    if (step.manual) return { action: 'manual', item: state.item, step: step.id, what: step.manual };
    if (step.gates) return { action: 'gates', item: state.item, step: step.id, agents: step.agents };
    return { action: 'call', item: state.item, step: step.id, agent: step.agent, mode: step.rework ? 'REWORK' : step.mode, phase: step.rework && step.agent ? (loadouts.roles?.[step.agent]?.phases?.rework ? 'rework' : step.phase) : step.phase, attempt: step.attempts + 1, interrupted: !!step.interrupted, ...modelFor(step, { loadouts, flow, tier: state.tier }) };
}

/** What a fresh agent needs to continue an interrupted step — instead of the whole context. */
export function resumeCard(state, stepId, { runs = [], changed = [] } = {}) {
    const step = state.steps.find((s) => s.id === stepId);
    if (!step) return `no step "${stepId}" in ${state.item}`;
    const since = runs.filter((r) => !step.startedAt || r.at >= step.startedAt);
    const failed = since.filter((r) => r.kind === 'run' && r.exit !== 0);
    const lines = [
        `RESUME ${state.item} / ${step.id} — ${step.agent}${step.mode ? ` (${step.mode})` : ''}, attempt ${step.attempts}, started ${step.startedAt ?? '—'}`,
        `Done before this step: ${state.steps.filter((s) => s.status === 'done').map((s) => s.id).join(', ') || 'nothing'}`,
        step.notes.length ? 'Checkpoints of this step (oldest first):' : 'No checkpoints were written in this step: assume nothing is finished, verify before continuing.',
        ...step.notes.slice(-6).map((n) => `  ${n.at.slice(11, 16)}  ${n.text}`),
        `Commands since the step started: ${since.filter((r) => r.kind === 'run').length} (${failed.length} failed)`,
        ...failed.slice(-2).map((r) => `  failed: $ ${r.cmd} → exit ${r.exit}`),
        `Files changed in the working tree: ${changed.length}${changed.length ? ` — ${changed.slice(0, 8).join(', ')}${changed.length > 8 ? ', …' : ''}` : ''}`,
        'Continue from the last checkpoint. Do not redo what a checkpoint lists as done; verify it with one command instead. Do not re-read handoffs you can verify with `facet capsule verify`.',
    ];
    return lines.join('\n');
}

/** One line per step for humans: what happened, how long, on which model. */
export function statusLines(state) {
    const mark = { done: '✓', running: '▶', pending: '·', blocked: '✗', 'needs-user': '?' };
    return state.steps.map((s) => {
        const took = s.startedAt && s.endedAt ? ` ${minutesBetween(s.startedAt, s.endedAt)} min` : '';
        return `${mark[s.status] ?? ' '} ${s.id.padEnd(7)} ${(s.agent ?? (s.gates ? s.agents.join('+') : 'you')).padEnd(22)} ${s.status}${s.attempts > 1 ? ` ×${s.attempts}` : ''}${s.model ? ` · ${s.model}` : ''}${took}${s.tokens ? ` · ${s.tokens} tok` : ''}${s.rework ? ' · rework' : ''}${s.interrupted && s.status === 'pending' ? ' · interrupted' : ''}`;
    });
}
