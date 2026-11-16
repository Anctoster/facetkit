// Tests added because `facet mutate`, run on the modules new in 0.7, found breakages nothing noticed (docs/dogfood.md).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADAPT, adapt, adaptationFor } from '../lib/adapt.mjs';
import { armRules, candidates, pairs } from '../lib/counterfactual.mjs';
import { exportKnowledge, importLessons, pool } from '../lib/crosslearn.mjs';
import { checkRule } from '../lib/fitness.mjs';
import { DEFAULT_FLOW, itemState } from '../lib/flow.mjs';
import { parseTemplate } from '../lib/handoff.mjs';
import { keyId, newKey } from '../lib/sign.mjs';
import { story } from './helpers.mjs';

const STEPS = [{ id: 'map', agent: 'context-cartographer', phase: 'map' }, { id: 'build', agent: 'slice-builder', phase: 'build' }, { id: 'proof', agent: 'proof-inspector', phase: 'proof', verdict: true }];
const secPlan = { route: ['spec-falsifier'], gates: ['security-auditor'], locked: [{ agent: 'security-auditor', why: 'auth' }], risk: { level: 'high', reasons: ['touches security-relevant files'] } };

test('adapt: limits as documented; nothing for a closed item; nothing grows after the verdict passed; a gate step is inserted when the item had none; each change once', () => {
    assert.deepEqual(ADAPT, { recurring: 3, weak: 0.5, minN: 5, window: 30 });
    const s = story();
    s.open('A', STEPS);
    s.run('A', 'map', 'context-cartographer');
    const found = adapt({ state: itemState(s.events, 'A'), flow: DEFAULT_FLOW, plan: secPlan, events: s.events });
    assert.deepEqual(found.map((a) => `${a.op}:${a.step}:${a.before ?? ''}`), ['insert:spec:build', 'insert:gates:proof']);
    assert.equal(adapt({ state: null, flow: DEFAULT_FLOW, plan: secPlan, events: s.events }).length, 0);
    s.say({ kind: 'route.adapt', item: 'A', ...found[0] });
    assert.deepEqual(adapt({ state: itemState(s.events, 'A'), flow: DEFAULT_FLOW, plan: secPlan, events: s.events }).map((a) => a.step), ['gates'], 'a recorded change is not made twice');
    s.say({ kind: 'route.adapt', item: 'A', op: 'note-for-another-item', step: 'x' });
    s.run('A', 'spec', 'spec-falsifier');
    s.run('A', 'build', 'slice-builder');
    s.run('A', 'proof', 'proof-inspector');
    s.say({ kind: 'verdict', item: 'A', verdict: 'PASS' });
    assert.deepEqual(adapt({ state: itemState(s.events, 'A'), flow: DEFAULT_FLOW, plan: secPlan, events: s.events }), [], 'after a passed verdict the route does not grow');
    s.say({ kind: 'item.close', item: 'A' });
    assert.deepEqual(adapt({ state: itemState(s.events, 'A'), flow: DEFAULT_FLOW, plan: secPlan, events: s.events }), []);
    assert.deepEqual(adaptationFor(s.events, 'A', 'spec').facets, []);
});

test('adapt: escalation needs enough items and an upper bound below the limit, and stops at the top of the ladder', () => {
    const make = (n, model) => {
        const s = story();
        for (let i = 0; i < n; i++) {
            s.open(`P${i}`, STEPS);
            s.run(`P${i}`, 'build', 'slice-builder', { model });
            s.say({ kind: 'verdict', item: `P${i}`, verdict: 'REWORK', fixes: [{ agent: 'slice-builder', mode: 'spec-gap' }] });
            s.say({ kind: 'verdict', item: `P${i}`, verdict: 'PASS' });
            s.say({ kind: 'item.close', item: `P${i}` });
        }
        s.open('A', STEPS);
        s.run('A', 'map', 'context-cartographer');
        const state = itemState(s.events, 'A');
        state.steps.find((x) => x.id === 'build').model = model;
        return adapt({ state, flow: DEFAULT_FLOW, events: s.events }).filter((a) => a.op === 'model').map((a) => a.model);
    };
    assert.deepEqual(make(4, 'haiku'), [], 'four items are not enough');
    assert.deepEqual(make(5, 'haiku'), ['sonnet']);
    assert.deepEqual(make(6, 'opus'), [], 'nothing above the top');
});

test('counterfactual: candidates need a closed item, the facet delivered and a snapshot; the "without" rules lose exactly the facet', () => {
    const s = story();
    s.say({ kind: 'item.open', item: 'A', steps: STEPS });
    s.say({ kind: 'step.start', item: 'A', step: 'build', agent: 'slice-builder', facets: ['x:rule'] });
    s.say({ kind: 'snapshot', item: 'A', step: 'build' });
    s.say({ kind: 'step.start', item: 'A', step: 'map', agent: 'context-cartographer', facets: ['x:rule'] });
    s.say({ kind: 'item.open', item: 'B', steps: STEPS });
    s.say({ kind: 'step.start', item: 'B', step: 'build', agent: 'slice-builder', facets: ['x:rule'] });
    s.say({ kind: 'snapshot', item: 'B', step: 'build' });
    s.say({ kind: 'item.close', item: 'A' });
    assert.deepEqual(candidates(s.events, 'x:rule').map((c) => `${c.item}/${c.step}`), ['A/build']);
    assert.deepEqual(candidates(s.events, 'y:other'), []);
    const rules = '# Loadout\n\n## Keep `a:one`\ntext\n\n## Drop `x:rule`\ntext\n';
    assert.equal(armRules(rules, 'x:rule', 'with'), rules);
    assert.equal(armRules(rules, 'x:rule', 'without'), '# Loadout\n\n## Keep `a:one`\ntext\n');
    s.say({ kind: 'cf', facet: 'x:rule', item: 'A', step: 'build', model: 'm', arm: 'with', passed: 2, total: 2 });
    s.say({ kind: 'cf', facet: 'x:rule', item: 'A', step: 'build', model: 'm', arm: 'without', passed: 1, total: 2 });
    s.say({ kind: 'cf', facet: 'y:other', item: 'A', step: 'build', model: 'm', arm: 'with', passed: 1, total: 2 });
    s.say({ kind: 'cf', facet: 'y:other', item: 'A', step: 'build', model: 'm', arm: 'without', passed: 1, total: 2 });
    assert.deepEqual(pairs(s.events, 'x:rule').map((p) => [p.facet, p.with, p.without]), [['x:rule', 1, 0.5]]);
    assert.equal(pairs(s.events).length, 2);
});

test('crosslearn: only facets that were observed travel; a lesson already imported is not imported twice; five observations per side is the floor', () => {
    const lessons = [{ id: 'L1', kind: 'practice', facet: null, when: {}, do: 'x', basis: 'supported', status: 'active' }, { id: 'L2', kind: 'practice', facet: null, when: {}, do: 'y', basis: 'supported', status: 'retired' }];
    const row = (facet, exposed, withheld, nWith, nWithout) => ({ facet, exposed, withheld, withRule: { p: 0.9, n: nWith }, without: { p: 0.5, n: nWithout }, adherence: null, effect: 0.4, verdict: 'works' });
    const pack = exportKnowledge({ project: 'p', diagnoses: [row('a:seen', 3, 0, 5, 5), row('a:withheld-only', 0, 2, 5, 5), row('a:never', 0, 0, 0, 0)], lessons, now: 'x' });
    assert.deepEqual(pack.facets.map((f) => f.facet), ['a:seen', 'a:withheld-only']);
    assert.equal(pack.source.length, 16);
    assert.deepEqual(pack.lessons.map((l) => l.id), ['L1']);
    const first = importLessons(pack, [], { by: 'ann' });
    assert.deepEqual(importLessons(pack, first, { by: 'ann' }), []);
    const thin = exportKnowledge({ project: 'q', diagnoses: [row('a:seen', 3, 0, 5, 4)], now: 'x' });
    assert.deepEqual(pool([thin]), []);
    assert.equal(pool([pack])[0].n, 10);
});

test('fitness: test files are outside the layers; cycles are found among the files of the rule only', () => {
    const graph = { files: ['src/ui/a.js', 'src/lib/b.js', 'test/b.test.js', 'src/x.js', 'src/y.js'], imports: new Map([['src/lib/b.js', ['src/ui/a.js']], ['test/b.test.js', ['src/ui/a.js']], ['src/x.js', ['src/y.js']], ['src/y.js', ['src/x.js']], ['src/ui/a.js', []]]), importers: new Map() };
    const isTest = (f) => f.startsWith('test/');
    assert.equal(checkRule({ id: 'l', kind: 'layers', order: ['src/ui/**', 'src/lib/**', 'test/**'] }, { graph, isTest }).length, 1, 'only lib → ui; the test may reach anywhere');
    assert.deepEqual(checkRule({ id: 'c', kind: 'no-cycle', within: 'src/**' }, { graph, isTest }).map((v) => v.key), ['c|src/x.js+src/y.js']);
    assert.deepEqual(checkRule({ id: 'c', kind: 'no-cycle', within: 'src/ui/**' }, { graph, isTest }), []);
    assert.throws(() => checkRule({ id: 'z', kind: 'nonsense' }, { graph }), /unknown kind/);
});

test('handoff template and keys: a template without a limit has none; a key id is a 16-character digest of the public key', () => {
    assert.deepEqual(parseTemplate('## A\n## B\n'), { maxLines: null, sections: ['A', 'B'] });
    assert.deepEqual(parseTemplate('<!-- max-lines: 12 -->\n## A'), { maxLines: 12, sections: ['A'] });
    const k = newKey();
    assert.equal(k.id, keyId(k.pub));
    assert.match(k.id, /^[0-9a-f]{16}$/);
});
