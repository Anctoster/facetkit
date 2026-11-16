import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adapt } from '../lib/adapt.mjs';
import { DEFAULT_FLOW, itemState } from '../lib/flow.mjs';
import { story } from './helpers.mjs';

const steps = [{ id: 'open', agent: 'route-conductor', phase: 'open' }, { id: 'map', agent: 'context-cartographer', phase: 'map' }, { id: 'red', agent: 'red-first-specifier', phase: 'red' }, { id: 'build', agent: 'slice-builder', phase: 'build' }, { id: 'ops', agent: 'release-pilot', phase: 'ops' }, { id: 'proof', agent: 'proof-inspector', phase: 'proof', verdict: true }];
const plan = { route: ['blueprint-architect'], gates: [], locked: [], risk: { level: 'normal', reasons: ['3 dependent module(s) have no test'] } };

test('adapt: a step asked for before a step that already started reviews that work after it, instead of resetting it', () => {
    const s = story();
    s.open('A', steps);
    for (const [id, agent] of [['open', 'route-conductor'], ['map', 'context-cartographer'], ['red', 'red-first-specifier']]) s.run('A', id, agent);
    s.run('A', 'build', 'slice-builder', { status: 'BLOCKED', for: 'release-pilot' }); // build started and stopped, as in the field
    const late = adapt({ state: itemState(s.events, 'A'), flow: DEFAULT_FLOW, plan, events: s.events });
    assert.equal(late.length, 1);
    assert.deepEqual([late[0].step, late[0].before, late[0].def.mode, late[0].review], ['design', 'ops', 'REVIEW', 'build']);
    assert.match(late[0].why, /build had already started/);
    // before build started, the same plan puts design in front of build, as the flow orders it
    const t = story();
    t.open('B', steps);
    for (const [id, agent] of [['open', 'route-conductor'], ['map', 'context-cartographer'], ['red', 'red-first-specifier']]) t.run('B', id, agent);
    const early = adapt({ state: itemState(t.events, 'B'), flow: DEFAULT_FLOW, plan, events: t.events });
    assert.deepEqual([early[0].before, early[0].def.mode ?? null], ['build', null]);
});

test('adapt: a weak first-pass record does not buy a stronger model when the reworks were about handoffs and documents', () => {
    const make = (mode) => {
        const s = story();
        for (const i of ['P1', 'P2', 'P3', 'P4', 'P5']) {
            s.open(i, steps);
            s.run(i, 'build', 'slice-builder', { model: 'sonnet' });
            s.say({ kind: 'verdict', item: i, verdict: 'REWORK', fixes: [{ agent: 'slice-builder', mode }] });
            s.say({ kind: 'verdict', item: i, verdict: 'PASS', fixes: [] });
            s.say({ kind: 'item.close', item: i });
        }
        s.open('A', steps);
        for (const [id, agent] of [['open', 'route-conductor'], ['map', 'context-cartographer'], ['red', 'red-first-specifier']]) s.run('A', id, agent);
        const state = itemState(s.events, 'A');
        state.steps.find((x) => x.id === 'build').model = 'sonnet';
        return adapt({ state, flow: DEFAULT_FLOW, events: s.events }).filter((a) => a.op === 'model');
    };
    assert.deepEqual(make('stale-handoff'), [], 'format causes: no escalation');
    assert.deepEqual(make('doc-drift'), []);
    assert.deepEqual(make('spec-gap').map((a) => a.model), ['opus'], 'a capability cause still escalates');
});
