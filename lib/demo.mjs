// demo: a synthetic journal of a small team's work — closed items at different assurance levels,
// a rework, a late defect, an interrupted step, a waiting question — so that the board and the
// reports can be seen before a project has any history of its own.
import { DEFAULT_FLOW, planSteps } from './flow.mjs';

export function demoEvents(start = '2026-01-05T09:00:00.000Z') {
    const events = [];
    let t = new Date(start).getTime();
    const say = (e, minutes = 1) => {
        t += minutes * 60000;
        events.push({ at: new Date(t).toISOString(), w: e.item?.endsWith('7') ? 'ola' : 'sam', lc: events.length + 1, ...e });
    };
    const models = { 'route-conductor': 'haiku', 'context-cartographer': 'haiku', 'blueprint-architect': 'opus' };
    const facets = { 'slice-builder': ['thrift-loop:digest-runs', 'journal-flow:checkpoint-notes', 'claim-ledger:claim-evidence-pairs'], 'spec-falsifier': ['falsifiable-tests:mutant-probe', 'slice-seams:neighbour-run', 'spec-trace:claim-by-id'], 'context-cartographer': ['anchored-handoff:seal-on-write', 'slice-seams:seam-map'] };
    const run = (item, s, { status = 'DONE', minutes = 6, tokens = 9000, ...rest } = {}) => {
        say({ kind: 'step.start', item, step: s.id, agent: s.agent, mode: s.mode, model: s.agent ? (models[s.agent] ?? 'sonnet') : undefined, facets: facets[s.agent] });
        say({ kind: 'step.end', item, step: s.id, agent: s.agent, status, tokens: s.agent ? tokens : 0, ...rest }, minutes);
    };
    const steps = (route) => planSteps(DEFAULT_FLOW, { route, gates: ['code-reviewer'] }).map(({ id, agent, mode, phase, gates, agents, manual, verdict, bookkeeping }) => ({ id, agent, mode, phase, gates, agents, manual, verdict, bookkeeping }));
    function item(id, { route = [], rework = null, stopAt = null, ask = null, tier = 'normal', version = 'v1', evidence = {} } = {}) {
        const plan = steps(route);
        say({ kind: 'item.open', item: id, tier, version, steps: plan, rerun: ['gates', 'proof'] });
        let reworked = false;
        for (const [i, s] of plan.entries()) {
            if (stopAt === s.id) {
                say({ kind: 'step.start', item: id, step: s.id, agent: s.agent, model: 'sonnet', facets: facets[s.agent] });
                say({ kind: 'note', item: id, step: s.id, text: 'done: storage module with migrations; next: wire the routes' }, 7);
                say({ kind: 'note', item: id, step: s.id, text: 'done: routes read from the new store; next: backup script' }, 9);
                return;
            }
            if (ask === s.id) return void run(id, s, { status: 'NEEDS-USER', question: 'Which legal text goes into the consent banner?' });
            run(id, s, { minutes: 4 + ((i * 7) % 11), tokens: 6000 + ((i * 9173) % 38000) });
            if (s.verdict) {
                if (rework && !reworked) {
                    reworked = true;
                    say({ kind: 'verdict', item: id, verdict: 'REWORK', fixes: [{ agent: rework.split(':')[0], mode: rework.split(':')[1], note: 'a neighbouring module broke' }] });
                    run(id, plan.find((x) => x.agent === rework.split(':')[0]), { minutes: 8, tokens: 21000 });
                    run(id, plan.find((x) => x.gates), { minutes: 3 });
                    run(id, s, { minutes: 5, tokens: 15000 });
                }
                say({ kind: 'verdict', item: id, verdict: 'PASS', fixes: [], scores: { 'slice-builder': rework ? 6 : 9, 'proof-inspector': 9 } });
            }
        }
        for (const [name, v] of Object.entries({ scan: true, ...evidence })) say({ kind: 'evidence', item: id, name, ok: v !== false, value: typeof v === 'number' ? v : undefined });
        say({ kind: 'item.close', item: id });
    }
    item('T01', { evidence: { accept: true } });
    item('T02', { rework: 'slice-builder:seam-break', evidence: { accept: true } });
    item('T03', { route: ['spec-falsifier'], evidence: { trace: true, mutate: 0.92, neighbours: true } });
    item('T04', { route: ['release-pilot'] });
    item('T05', { evidence: { accept: true, mutate: 0.6 } });
    item('T06', { route: ['spec-falsifier', 'blueprint-architect'], tier: 'hard', evidence: { trace: true, mutate: 0.85, neighbours: true } });
    say({ kind: 'escape', item: 'T02', fix: '4be1a07', mode: 'regression' });
    for (let i = 0; i < 9; i++) say({ kind: 'canary', guard: 'tests', caught: i !== 2 });
    for (let i = 0; i < 4; i++) say({ kind: 'canary', guard: 'proof-inspector', caught: i < 3 });
    item('T07', { ask: 'map' });
    item('T08', { route: ['spec-falsifier', 'blueprint-architect', 'release-pilot'], stopAt: 'build', tier: 'hard', version: 'v2' });
    return events;
}

export const demoItems = () => Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`T${String(i + 1).padStart(2, '0')}`, { version: i < 9 ? 'v1' : 'v2', deps: i === 9 ? ['T06'] : [], tier: [5, 7, 11].includes(i) ? 'hard' : 'normal' }]));
