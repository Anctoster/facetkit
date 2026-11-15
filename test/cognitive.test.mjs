import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { COGNITION, confidence, curriculum, faded, lessonFrom, recallLessons } from '../lib/cognition.mjs';
import { allocate, hire, priceFacets, reworkCost } from '../lib/economy.mjs';
import { followUp, overrides, plan, weaknesses } from '../lib/heal.mjs';
import { judge, newHypothesis } from '../lib/hypothesis.mjs';
import { analyseDesign, armFor, newDesign, stratumOf, unitsSoFar } from '../lib/intelligence.mjs';
import { buildTrustGraph, trustOf, wilsonLow } from '../lib/trustgraph.mjs';
import { gitInit, story, tmp, write } from './helpers.mjs';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');
const FACET = 'falsifiable-tests:independent-oracle';
const STEPS = [{ id: 'red', agent: 'specifier', phase: 'red' }, { id: 'proof', agent: 'inspector', phase: 'proof', verdict: true }];
const lcg = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const base = { low: 0.1, normal: 0.3, high: 0.6 };
function play(design, n, fail, { seed = 1, prefix = 'I' } = {}) {
    const s = story();
    const rand = lcg(seed);
    for (let i = 0; i < n; i++) {
        const item = `${prefix}${i}`;
        const difficulty = ['low', 'normal', 'high'][Math.floor(rand() * 3)];
        const stratum = stratumOf(design, { agent: 'specifier', taskClass: 'feature', difficulty });
        const arm = design.arms.find((a) => a.id === armFor(design, stratum, unitsSoFar(s.events, design, stratum)));
        s.open(item, STEPS);
        s.say({ kind: 'step.start', item, step: 'red', agent: 'specifier', model: 'sonnet', facets: arm.facet === 'off' ? [] : [FACET], experiments: [{ id: design.id, arm: arm.id, stratum }] });
        s.say({ kind: 'step.end', item, step: 'red', agent: 'specifier', status: 'DONE', tokens: 1000 }, 4);
        s.run(item, 'proof', 'inspector');
        if (fail(arm, difficulty, rand)) {
            s.say({ kind: 'verdict', item, verdict: 'REWORK', fixes: [{ agent: 'specifier', mode: 'false-green' }] });
            s.run(item, 'red', 'specifier');
            s.run(item, 'proof', 'inspector');
        }
        s.say({ kind: 'verdict', item, verdict: 'PASS', fixes: [] });
        s.say({ kind: 'item.close', item });
    }
    return s.events;
}
/** A plain history: `rows` of { item, agent, model, blamed, escape, evidence: [{ name, ok, src }], lessons, judgeModel }. */
function history(rows) {
    const s = story();
    for (const r of rows) {
        s.open(r.item, STEPS);
        s.say({ kind: 'step.start', item: r.item, step: 'red', agent: r.agent ?? 'specifier', model: r.model ?? 'haiku', facets: r.facets ?? [], lessons: r.lessons });
        s.say({ kind: 'step.end', item: r.item, step: 'red', agent: r.agent ?? 'specifier', status: 'DONE', tokens: 1000 });
        s.say({ kind: 'step.start', item: r.item, step: 'proof', agent: 'inspector', model: r.judgeModel ?? 'sonnet' });
        for (const e of r.evidence ?? [{ name: 'unit', ok: true }]) s.say({ kind: 'evidence', item: r.item, ...e });
        s.say({ kind: 'step.end', item: r.item, step: 'proof', agent: 'inspector', status: 'DONE', tokens: 500 });
        if (r.blamed) {
            s.say({ kind: 'verdict', item: r.item, verdict: 'REWORK', fixes: [{ agent: r.agent ?? 'specifier', mode: r.mode ?? 'false-green' }] });
            s.say({ kind: 'step.start', item: r.item, step: 'red', agent: r.agent ?? 'specifier', model: r.model ?? 'haiku' });
            s.say({ kind: 'step.end', item: r.item, step: 'red', agent: r.agent ?? 'specifier', status: 'DONE', tokens: 3000 });
        }
        s.say({ kind: 'verdict', item: r.item, verdict: 'PASS', fixes: [] });
        s.say({ kind: 'item.close', item: r.item });
        if (r.escape) s.say({ kind: 'escape', item: r.item, mode: 'regression', fix: 'x' });
    }
    return s.events;
}
const many = (n, fn) => Array.from({ length: n }, (_, i) => ({ item: `T${i}`, ...fn(i) }));

test('hypothesis: the verdict is a function of the prediction and the data — and "no effect" needs a stated margin', () => {
    assert.throws(() => newHypothesis({ id: 'H', claim: 'c', margin: 0 }), /smallest effect/);
    const h = newHypothesis({ id: 'H1', claim: 'an independent oracle gives more clean closes', facet: FACET, margin: 0.05, design: 'D1' });
    assert.equal(judge(h, null).verdict, 'untested');
    const d = newDesign({ id: 'D1', facet: FACET, seed: 7 });
    const helps = (arm, diff, rand) => rand() < base[diff] * (arm.facet === 'on' ? 0.25 : 1);
    const flat = (arm, diff, rand) => rand() < base[diff];
    assert.equal(judge(h, analyseDesign(play(d, 24, helps), d, { rounds: 200 })).verdict, 'testing');
    const first = analyseDesign(play(d, 240, helps, { seed: 11 }), d, { rounds: 800 });
    assert.equal(judge(h, first).verdict, 'promising', 'found once is not yet supported');
    const d2 = newDesign({ id: 'D2', facet: FACET, seed: 8, confirms: 'D1' });
    assert.equal(judge(h, analyseDesign(play(d2, 240, helps, { seed: 12, prefix: 'J' }), d2, { rounds: 800, prior: first })).verdict, 'supported');
    const harmful = newHypothesis({ id: 'H2', claim: 'the facet makes things worse', facet: FACET, direction: 'worse', design: 'D1' });
    assert.equal(judge(harmful, first).verdict, 'contradicted');
    const none = analyseDesign(play(d, 240, flat, { seed: 13 }), d, { rounds: 800 });
    assert.equal(judge(h, none).verdict, 'inconclusive', '120 per arm cannot rule out a 5-point effect');
    assert.equal(judge(newHypothesis({ id: 'H3', claim: 'a big gain', facet: FACET, margin: 0.3 }), none).verdict, 'no-effect', 'but it does rule out a 30-point one');
});

test('cognition: a lesson is earned by a verdict, strengthened or weakened by later work, and fades when it is not used', () => {
    const h = newHypothesis({ id: 'H1', claim: 'an independent oracle gives more clean closes', facet: FACET });
    assert.equal(lessonFrom(h, { verdict: 'testing' }), null);
    assert.equal(lessonFrom(h, { verdict: 'inconclusive' }), null);
    const l = lessonFrom(h, { verdict: 'supported', why: 'w' }, { when: { agent: 'specifier', difficulty: null }, at: 0, model: 'sonnet' });
    assert.deepEqual([l.kind, l.facet, l.when, l.because], ['use-facet', FACET, { agent: 'specifier' }, ['H1']]);
    assert.equal(lessonFrom(h, { verdict: 'refuted', why: 'the opposite was found' }).kind, 'avoid-facet');
    assert.equal(confidence(l, []).value, 0.9);
    assert.equal(confidence(lessonFrom(h, { verdict: 'promising', why: 'w' }), []).value, 0.6);
    const applied = (bad) => history(many(20, (i) => ({ lessons: ['L-H1'], blamed: i < bad })));
    assert.ok(confidence(l, applied(0)).value > 0.95);
    const hurt = confidence(l, applied(16));
    assert.ok(hurt.value < COGNITION.floor, `sixteen bad applications of twenty: ${hurt.value}`);
    assert.deepEqual(faded([l], applied(16)).map((r) => r.lesson.id), ['L-H1']);
    const idle = confidence(l, history(many(120, () => ({}))));
    assert.ok(idle.value < 0.3 && idle.fade <= 0.25, 'two half-lives without a single application');
    assert.equal(confidence(l, [], { modelNow: 'haiku' }).value, 0.45, 'learned on another model: half as sure');
    assert.equal(confidence({ ...l, status: 'retired' }, []).value, 0);
});

test('cognition: recall is by situation, most trusted first, within a budget — and it changes what the agent is given', () => {
    const mk = (id, over) => ({ id, kind: 'use-facet', facet: `s:${id}`, when: {}, do: 'apply the rule in question here please', because: ['H'], basis: 'supported', learnedAt: 0, status: 'active', ...over });
    const lessons = [mk('a', { when: { agent: 'specifier' } }), mk('b', { when: { agent: 'builder' } }), mk('c', { kind: 'avoid-facet', basis: 'promising' }), mk('d', { kind: 'practice', facet: null, do: 'check the units before comparing numbers' }),
        mk('e', { kind: 'avoid-facet', facet: 's:a', basis: 'promising' })];
    const r = recallLessons(lessons, [], { agent: 'specifier', difficulty: 'high' });
    assert.deepEqual(r.used.map((x) => x.lesson.id), ['a', 'd', 'c']);
    assert.match(r.dropped.find((x) => x.lesson.id === 'e').why, /contradicted by a/, 'use and avoid of one facet: the more trusted wins');
    assert.deepEqual(curriculum(r), { add: ['s:a'], drop: ['s:c'], notes: ['check the units before comparing numbers'], ids: ['a', 'd', 'c'] });
    assert.deepEqual(recallLessons(lessons, [], { agent: 'specifier' }, { budgetWords: 8 }).used.map((x) => x.lesson.id), ['a']);
    assert.deepEqual(recallLessons(lessons, [], { agent: 'builder' }).used.map((x) => x.lesson.id).sort(), ['b', 'c', 'd', 'e'].sort());
});

test('trust graph: trust is earned by observations — unknown is the lowest trust, and a result is as strong as its weakest support', () => {
    assert.equal(wilsonLow(0, 0), 0);
    assert.ok(wilsonLow(3, 3) < 0.6 && wilsonLow(30, 30) > 0.9, 'three clean items are not thirty');
    const g = buildTrustGraph(history([
        ...many(20, (i) => ({ item: `G${i}`, agent: 'builder', model: 'sonnet' })),
        ...many(10, (i) => ({ item: `W${i}`, agent: 'specifier', model: 'haiku', blamed: i < 6 })),
        { item: 'E1', agent: 'builder', model: 'sonnet', escape: true }, { item: 'E2', agent: 'builder', model: 'sonnet', escape: true, evidence: [{ name: 'lint', ok: true }] },
        { item: 'F1', agent: 'builder', model: 'sonnet', evidence: [{ name: 'e2e', ok: false, src: 's1' }, { name: 'e2e', ok: true, src: 's1' }] },
        { item: 'N1', agent: 'builder', model: 'sonnet', evidence: [] },
    ]));
    assert.ok(trustOf(g, 'agent:builder@sonnet') > 0.75);
    assert.ok(trustOf(g, 'agent:specifier@haiku') < 0.3);
    assert.equal(trustOf(g, 'agent:nobody@opus'), 0);
    assert.equal(g.nodes.get('judge:inspector@sonnet').bad, 2, 'two passes were contradicted later');
    assert.equal(g.nodes.get('tool:unit').bad, 1);
    assert.equal(g.nodes.get('tool:lint').bad, 1, 'a check that passed an item which later failed');
    assert.equal(g.nodes.get('tool:e2e').bad, 1, 'the same sources, both answers');
    assert.equal(g.nodes.get('result:E1').trust, 0);
    assert.match(g.nodes.get('result:N1').weakest, /nothing checked it/);
    const r = g.nodes.get('result:W9');
    assert.match(r.weakest, /agent:specifier@haiku/);
    assert.equal(r.trust, trustOf(g, 'agent:specifier@haiku'));
});

test('heal: weak points are found in the record, safe ones are repaired once, and the repair is judged afterwards', () => {
    const weak = history([...many(10, (i) => ({ agent: 'specifier', model: 'haiku', blamed: i < 7 })), ...many(3, (i) => ({ item: `X${i}`, agent: 'builder', model: 'sonnet', escape: true, evidence: [{ name: 'lint', ok: true }] }))]);
    const ctx = (events, extra = {}) => ({ events, graph: buildTrustGraph(events), ...extra });
    const found = weaknesses(ctx(weak, { fadedLessons: [{ lesson: { id: 'L-1' }, c: { value: 0.2, why: 'w' } }], openPatterns: [{ mode: 'false-green', agent: 'specifier', items: ['a', 'b', 'c'] }], decay: { uncovered: ['styles/site.css'] } }));
    const kinds = Object.fromEntries(found.map((w) => [w.kind, w]));
    assert.deepEqual([kinds['weak-agent'].remedy.action, kinds['weak-agent'].remedy.to], ['raise-model', 'sonnet']);
    assert.equal(kinds['unreliable-check'].remedy.action, 'suspect-check');
    assert.equal(kinds['faded-lesson'].remedy.class, 'auto');
    assert.equal(kinds['unaddressed-mistake'].remedy.action, 'file-proposal');
    assert.equal(kinds['blind-spot'].remedy.class, 'person');
    const top = weaknesses(ctx(history(many(10, (i) => ({ agent: 'specifier', model: 'opus', blamed: i < 7 })))));
    assert.equal(top.find((w) => w.kind === 'weak-agent').remedy.class, 'person', 'nothing above the largest model: a person decides');
    assert.ok(weaknesses(ctx(history(many(14, () => ({}))))).some((w) => w.kind === 'never-fails'));
    assert.deepEqual(weaknesses(ctx(history(many(3, () => ({ blamed: true }))))), [], 'three items are not a record');
    const p = plan(found, weak);
    assert.equal(p.auto.length, 4);
    const applied = [...weak, { kind: 'heal', key: kinds['weak-agent'].key, action: 'raise-model', agent: 'specifier', to: 'sonnet', closedThen: 13 }, { kind: 'heal', key: kinds['unreliable-check'].key, action: 'suspect-check', check: 'lint', closedThen: 13 }];
    assert.deepEqual(overrides(applied), { models: { specifier: 'sonnet' }, suspect: ['lint'] });
    assert.equal(plan(found, applied).auto.length, 2, 'a remedy is not applied twice to the same weakness');
    assert.deepEqual(followUp(found, applied).map((f) => f.state), ['on probation', 'on probation']);
    const later = [...applied, ...history(many(8, (i) => ({ item: `P${i}`, agent: 'specifier', model: 'sonnet' }))).map((e) => e)];
    assert.deepEqual(followUp(found, later).map((f) => f.state), ['FAILED', 'FAILED'], 'still on the list after probation: it goes to a person');
    assert.deepEqual(followUp([], later).map((f) => f.state), ['healed', 'healed']);
    assert.deepEqual(overrides([...applied, { kind: 'heal.undo', key: 'k', agent: 'specifier' }]).models, {});
});

test('economy: rules are paid for per delivery and valued by what they measurably prevent; a budget buys core, proven and a share of unknowns', () => {
    const events = history(many(10, (i) => ({ blamed: i < 4, facets: ['s:proven', 's:core'] })));
    assert.equal(reworkCost(events), 3000);
    assert.equal(reworkCost(history(many(3, () => ({})))), null);
    const body = (n) => Array.from({ length: n }, () => 'word').join(' ');
    const facets = [{ ref: 's:core', ablatable: false, body: body(50) }, { ref: 's:proven', ablatable: true, body: body(40) }, { ref: 's:small', ablatable: true, body: body(40) },
        { ref: 's:useless', ablatable: true, body: body(40) }, { ref: 's:new1', ablatable: true, body: body(30) }, { ref: 's:new2', ablatable: true, body: body(30) }, { ref: 's:new3', ablatable: true, body: body(30) }];
    const j = (ref, verdict, effect) => ({ h: { facet: ref }, v: { verdict }, effect });
    const prices = priceFacets(facets, events, { judged: [j('s:proven', 'supported', 0.2), j('s:small', 'supported', 0.01), j('s:useless', 'no-effect', 0.0), j('s:new1', 'promising', 0.3)] });
    const by = Object.fromEntries(prices.map((p) => [p.ref, p]));
    assert.deepEqual([by['s:proven'].cost, by['s:proven'].value, by['s:proven'].delivered], [56, 600, 10]);
    assert.equal(by['s:new1'].value, null, 'found once is not a price');
    assert.ok(by['s:small'].net < 0, 'a real but tiny gain can cost more than it returns');
    const a = allocate(prices, { budgetWords: 150 });
    assert.deepEqual(a.core, ['s:core']);
    assert.deepEqual(a.proven, ['s:proven']);
    assert.equal(a.explore.length, 2, 'what is left after proven rules goes to pricing the unknown');
    assert.deepEqual(a.out.map((o) => o.ref).sort(), ['s:new3', 's:small', 's:useless'].sort());
    assert.equal(allocate(prices, { budgetWords: 40 }).overBudget, true);
    const g = buildTrustGraph(history([...many(40, (i) => ({ item: `H${i}`, agent: 'builder', model: 'haiku', blamed: i < 10 })), ...many(40, (i) => ({ item: `S${i}`, agent: 'builder', model: 'sonnet' }))]));
    assert.equal(hire(g, 'builder', { risk: 'low' }).model, 'haiku', 'good enough where a mistake is cheap');
    assert.equal(hire(g, 'builder', { risk: 'high' }).model, 'sonnet');
    assert.deepEqual([hire(g, 'newcomer', { risk: 'high' }).model, hire(g, 'newcomer', { risk: 'low' }).trial], ['opus', true]);
});

test('facet hypo / learn / heal / trustgraph / economy — through the command line', () => {
    const root = tmp();
    write(root, 'package.json', '{"name":"p","version":"1.0.0"}\n');
    gitInit(root);
    const facet = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf-8' });
    assert.match(facet('hypo', 'new', 'H1', '--claim', 'an oracle helps', '--margin', '0').stderr, /smallest effect/);
    assert.equal(facet('hypo', 'new', 'H1', '--claim', 'an independent oracle gives more clean closes', '--facet', FACET).status, 0);
    assert.match(facet('hypo', 'new', 'H1', '--claim', 'again').stderr, /written once/);
    assert.match(facet('hypo').stdout, /H1\s+untested/);
    assert.match(facet('learn', 'apply').stderr, /person's decision/);
    assert.match(facet('learn', 'apply', '--by', 'someone').stdout, /nothing new to learn/);
    assert.match(facet('heal').stdout, /0 to repair automatically/);
    assert.match(facet('trustgraph').stdout, /results: 0 closed/);
    assert.match(facet('economy', '--role', 'slice-builder', '--phase', 'build', '--risk', 'high').stdout, /labour: run slice-builder on opus[\s\S]*no model has earned/);
});
