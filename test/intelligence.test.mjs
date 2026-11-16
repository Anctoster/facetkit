import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { designFor, diagnosePattern, mayAdopt, patterns, propose } from '../lib/evolve.mjs';
import { analyseDesign, armFor, compareArms, fourArms, holm, newDesign, stratumOf, unitsOf, unitsSoFar } from '../lib/intelligence.mjs';
import { gitInit, story, tmp, write } from './helpers.mjs';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');
const FACET = 'falsifiable-tests:independent-oracle';
const STEPS = [{ id: 'red', agent: 'specifier', phase: 'red' }, { id: 'proof', agent: 'inspector', phase: 'proof', verdict: true }];
const lcg = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

/**
 * Plays `n` items through a design exactly as `facet flow start` would: the stratum is fixed before
 * the work, the arm is dealt from the journal so far. `fail(arm, difficulty, rand)` decides a rework.
 */
function play(design, n, fail, { seed = 1, prefix = 'I', tokens = () => 1000, late = () => false, model = 'sonnet', events: into = null } = {}) {
    const s = story();
    if (into) s.events.push(...into);
    const rand = lcg(seed);
    for (let i = 0; i < n; i++) {
        const item = `${prefix}${i}`;
        const difficulty = ['low', 'normal', 'high'][Math.floor(rand() * 3)];
        const stratum = stratumOf(design, { agent: 'specifier', taskClass: 'feature', difficulty });
        const arm = design.arms.find((a) => a.id === armFor(design, stratum, unitsSoFar(s.events, design, stratum)));
        s.open(item, STEPS);
        s.say({ kind: 'step.start', item, step: 'red', agent: 'specifier', model: arm.model ?? model, facets: arm.facet === 'off' ? [] : [FACET], experiments: [{ id: design.id, arm: arm.id, stratum }] });
        s.say({ kind: 'step.end', item, step: 'red', agent: 'specifier', status: 'DONE', tokens: tokens(arm, difficulty, rand) }, 4);
        s.run(item, 'proof', 'inspector');
        if (fail(arm, difficulty, rand)) {
            s.say({ kind: 'verdict', item, verdict: 'REWORK', fixes: [{ agent: 'specifier', mode: 'false-green' }] });
            s.run(item, 'red', 'specifier');
            s.run(item, 'proof', 'inspector');
        }
        s.say({ kind: 'verdict', item, verdict: 'PASS', fixes: [] });
        s.say({ kind: 'item.close', item });
        if (late(arm, difficulty, rand)) s.say({ kind: 'escape', item, mode: 'false-green', agent: 'specifier', fix: 'abc' });
    }
    return s.events;
}
// harder tasks fail more, whatever the arm: the confounder the strata exist for
const base = { low: 0.1, normal: 0.3, high: 0.6 };

test('intelligence: a design is fixed before the data — seed, arms, one primary outcome, a floor nobody can lower to five', () => {
    assert.throws(() => newDesign({ id: 'D', facet: FACET }), /seed/);
    assert.throws(() => newDesign({ id: 'D', facet: FACET, seed: 1, minPerArm: 5 }), /fewer than 10/);
    assert.throws(() => newDesign({ id: 'D', facet: FACET, seed: 1, primary: 'vibes' }), /unknown primary outcome/);
    assert.throws(() => newDesign({ id: 'D', facet: FACET, seed: 1, arms: [{ id: 'A', facet: 'variant' }, { id: 'B', facet: 'on' }] }), /variant/);
    const d = newDesign({ id: 'D', facet: FACET, seed: 1, arms: fourArms('haiku') });
    assert.equal(d.minPerArm, 30);
    assert.deepEqual(d.arms.map((a) => a.id), ['A', 'B', 'C', 'D']);
    assert.deepEqual(d.secondary, ['errors', 'falsePasses', 'retries', 'tokens', 'minutes']);
});

test('intelligence: arms are dealt in shuffled blocks inside each stratum — balanced everywhere, reproducible, and not a fixed pattern', () => {
    const d = newDesign({ id: 'D1', facet: FACET, seed: 42, arms: fourArms('haiku') });
    for (const stratum of ['agent=a|taskClass=x|difficulty=low', 'agent=b|taskClass=x|difficulty=high']) {
        const dealt = Array.from({ length: 40 }, (_, k) => armFor(d, stratum, k));
        for (const id of 'ABCD') assert.equal(dealt.filter((x) => x === id).length, 10, `${id} in ${stratum}`);
        for (let b = 0; b < 10; b++) assert.equal(new Set(dealt.slice(b * 4, b * 4 + 4)).size, 4, 'every block holds every arm once');
        assert.deepEqual(dealt, Array.from({ length: 40 }, (_, k) => armFor(d, stratum, k)));
        assert.ok(new Set(Array.from({ length: 10 }, (_, b) => dealt.slice(b * 4, b * 4 + 4).join(''))).size > 3, 'the order inside blocks varies');
    }
    assert.notDeepEqual(Array.from({ length: 12 }, (_, k) => armFor(d, 's', k)), Array.from({ length: 12 }, (_, k) => armFor({ ...d, seed: '43' }, 's', k)));
    const events = play(d, 90, () => false);
    const a = analyseDesign(events, d, { rounds: 200 });
    for (const [stratum, counts] of Object.entries(a.balance)) assert.ok(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts)) <= 1, `balanced in ${stratum}`);
});

test('intelligence: like is compared with like — a pooled comparison is fooled by task difficulty, the stratified one is not', () => {
    // the facet arm got mostly easy tasks; inside each difficulty it is WORSE, pooled it looks better
    const rows = [];
    const add = (arm, stratum, n, clean) => { for (let i = 0; i < n; i++) rows.push({ arm, stratum, broken: false, clean: i < clean ? 1 : 0 }); };
    add('B', 'easy', 80, 68); add('A', 'easy', 20, 19);   // 85% vs 95%
    add('B', 'hard', 20, 4); add('A', 'hard', 80, 28);    // 20% vs 35%
    const pooledB = rows.filter((r) => r.arm === 'B').reduce((s, r) => s + r.clean, 0) / 100;
    const pooledA = rows.filter((r) => r.arm === 'A').reduce((s, r) => s + r.clean, 0) / 100;
    assert.ok(pooledB > pooledA, `pooled, the facet looks better (${pooledB} vs ${pooledA})`);
    const c = compareArms(rows, 'clean', 'B', 'A', { seed: 1, rounds: 1000 });
    assert.ok(c.diff < 0, `stratified, it is worse (${c.diff})`);
    assert.equal(c.strata, 2);
    const alone = compareArms([...rows, { arm: 'B', stratum: 'only-b', broken: false, clean: 1 }], 'clean', 'B', 'A', { seed: 1, rounds: 200 });
    assert.equal(alone.lost, 1, 'a unit whose stratum lacks the other arm is not compared with anything');
});

test('intelligence: a real effect is found and called exploratory; an independent repetition confirms it; a flat one confirms nothing', () => {
    const d = newDesign({ id: 'D2', facet: FACET, seed: 7 });
    const helps = (arm, diff, rand) => rand() < base[diff] * (arm.facet === 'on' ? 0.25 : 1);
    const first = analyseDesign(play(d, 240, helps, { seed: 11 }), d, { rounds: 1000 });
    assert.equal(first.arms[0].direction, 'better', first.verdict);
    assert.equal(first.stage, 'exploratory');
    assert.match(first.action, /repeat on an independent sample/);
    assert.ok(first.arms[0].primary.low > 0, 'the interval excludes zero');
    assert.ok(first.arms[0].secondary.find((x) => x.metric === 'errors').diff < 0, 'fewer fixes blamed on the step');
    const again = newDesign({ id: 'D3', facet: FACET, seed: 8, confirms: 'D2' });
    assert.equal(analyseDesign(play(again, 240, helps, { seed: 12, prefix: 'J' }), again, { rounds: 1000, prior: first }).stage, 'confirmed');
    const flat = analyseDesign(play(again, 240, (arm, diff, rand) => rand() < base[diff], { seed: 13, prefix: 'K' }), again, { rounds: 1000, prior: first });
    assert.equal(flat.arms[0].direction, 'none');
    assert.equal(flat.stage, 'confirmatory');
    assert.deepEqual(analyseDesign(play(d, 240, helps, { seed: 11 }), d, { rounds: 1000 }), first, 'the same journal and seed give the same numbers');
});

test('intelligence: below the floor the answer is "not enough data", however large the difference looks', () => {
    const d = newDesign({ id: 'D4', facet: FACET, seed: 3 });
    const a = analyseDesign(play(d, 24, (arm) => arm.facet === 'off', { seed: 5 }), d, { rounds: 300 });
    assert.equal(a.arms[0].enough, false);
    assert.equal(a.arms[0].direction, 'none');
    assert.match(a.verdict, /not enough data: 30 comparable units/);
    assert.match(a.action, /change nothing/);
});

test('intelligence: when the facet does nothing, it is rarely declared to do something (false alarms stay near the stated 5%)', () => {
    let alarms = 0;
    const runs = 40;
    for (let r = 0; r < runs; r++) {
        const d = newDesign({ id: `N${r}`, facet: FACET, seed: r });
        if (analyseDesign(play(d, 150, (arm, diff, rand) => rand() < base[diff], { seed: 100 + r }), d, { rounds: 300 }).arms[0].direction !== 'none') alarms++;
    }
    assert.ok(alarms <= 6, `${alarms} of ${runs} null experiments raised an alarm`);
});

test('intelligence: four arms answer four questions — presence, a smaller model, position — with thresholds adjusted for reading them together', () => {
    const d = newDesign({ id: 'D5', facet: FACET, seed: 9, arms: fourArms('haiku'), minPerArm: 30 });
    // the facet helps on the usual model, not on the smaller one; position makes no difference; the smaller model is cheaper
    const fail = (arm, diff, rand) => rand() < base[diff] * (arm.facet === 'off' || arm.model ? 1 : 0.2);
    const a = analyseDesign(play(d, 520, fail, { seed: 21, tokens: (arm) => (arm.model ? 400 : 1000) }), d, { rounds: 600 });
    const by = Object.fromEntries(a.arms.map((x) => [x.arm, x]));
    assert.equal(by.B.direction, 'better');
    assert.equal(by.D.direction, 'better', 'the last position works as well');
    assert.equal(by.C.direction, 'none', 'on the smaller model the facet shows no effect');
    assert.ok(by.C.secondary.find((x) => x.metric === 'tokens').diff < -400);
    assert.equal(a.broken, 0);
    assert.deepEqual(holm([0.001, 0.04, 0.03], 0.05), [true, false, false]);
    assert.deepEqual(holm([0.001, 0.02, 0.012], 0.05), [true, true, true]);
});

test('intelligence: a unit that did not receive what its arm prescribes is not an observation; too many of them void the design', () => {
    const d = newDesign({ id: 'D6', facet: FACET, seed: 4 });
    const events = play(d, 80, () => false).map((e) => (e.kind === 'step.start' && e.experiments && e.item.endsWith('3') ? { ...e, facets: [FACET] } : e));
    const a = analyseDesign(events, d, { rounds: 100 });
    assert.ok(a.broken > 0);
    assert.equal(unitsOf(events, d).rows.filter((r) => r.broken).every((r) => r.arm === 'A'), true, 'only the control arm was given what it should not have');
    const all = play(d, 80, () => false).map((e) => (e.kind === 'step.start' && e.experiments ? { ...e, facets: [FACET] } : e));
    assert.match(analyseDesign(all, d, { rounds: 100 }).verdict, /invalid/);
});

test('intelligence: a defect found after acceptance counts against the arm that let it through', () => {
    const d = newDesign({ id: 'D7', facet: FACET, seed: 5, primary: 'falsePasses' });
    const a = analyseDesign(play(d, 240, () => false, { seed: 31, late: (arm, diff, rand) => rand() < (arm.facet === 'off' ? 0.4 : 0.05) }), d, { rounds: 600 });
    assert.equal(a.arms[0].direction, 'better', 'fewer false passes is better');
    assert.ok(a.arms[0].primary.diff < 0);
});

// ---- evolution --------------------------------------------------------------------------------
const facetOf = (over = {}) => ({ ref: FACET, guards: ['false-green'], footprint: ['evidence:oracle'], check: 'New tests contain no snapshot assertions', ablatable: true, ...over });
function mistakes(n, { delivered = true, followed = false, mode = 'false-green' } = {}) {
    const s = story();
    for (let i = 0; i < n; i++) {
        const item = `M${i}`;
        s.open(item, STEPS);
        s.say({ kind: 'step.start', item, step: 'red', agent: 'specifier', model: 'sonnet', facets: delivered ? [FACET] : [] });
        if (followed) s.say({ kind: 'evidence', item, step: 'red', name: 'oracle', ok: true });
        s.say({ kind: 'step.end', item, step: 'red', agent: 'specifier', status: 'DONE' });
        s.run(item, 'proof', 'inspector');
        s.say({ kind: 'verdict', item, verdict: 'REWORK', fixes: [{ agent: 'specifier', mode }] });
        s.run(item, 'red', 'specifier');
        s.run(item, 'proof', 'inspector');
        s.say({ kind: 'verdict', item, verdict: 'PASS', fixes: [] });
        s.say({ kind: 'item.close', item });
    }
    return s.events;
}

test('evolve: a mistake is a pattern only when it recurs across items; one bad item is not a trend', () => {
    assert.deepEqual(patterns(mistakes(2)), []);
    const found = patterns(mistakes(4));
    assert.equal(found.length, 1);
    assert.deepEqual([found[0].mode, found[0].agent, found[0].items.length], ['false-green', 'specifier', 4]);
    const twice = mistakes(1);
    twice.push({ ...twice.find((e) => e.kind === 'verdict' && e.verdict === 'REWORK'), at: '2026-01-09T00:00:00.000Z' }, { ...twice.find((e) => e.kind === 'verdict' && e.verdict === 'REWORK'), at: '2026-01-09T00:01:00.000Z' });
    assert.deepEqual(patterns(twice), [], 'three complaints about one item are one item');
});

test('evolve: the diagnosis follows the evidence — no rule, not delivered, unmeasurable, ignored, or followed and still failing', () => {
    const kind = (events, facets) => diagnosePattern(patterns(events)[0], events, facets)[0];
    assert.equal(kind(mistakes(4), []).kind, 'create');
    assert.equal(kind(mistakes(4, { delivered: false }), [facetOf()]).kind, 'load');
    assert.equal(kind(mistakes(4), [facetOf({ footprint: [] })]).kind, 'instrument');
    const ignored = kind(mistakes(4), [facetOf()]);
    assert.equal(ignored.kind, 'reword');
    assert.deepEqual([ignored.delivered, ignored.followed], [4, 0]);
    assert.equal(kind(mistakes(4, { followed: true }), [facetOf()]).kind, 'change');
    assert.equal(kind(mistakes(4, { followed: true }), [facetOf({ check: 'Run `facet probe` and read the survivors' })]).kind, 'to-tool', 'a Check that names a command can become a gate');
    assert.equal(kind(mistakes(4), [facetOf({ guards: ['doc-drift'] })]).kind, 'create', 'a rule against something else does not count');
});

test('evolve: a proposal is not a change — it becomes an experiment, and is adopted only when an independent repetition confirms it', () => {
    const events = mistakes(4);
    const [p] = propose(diagnosePattern(patterns(events)[0], events, [facetOf()]));
    assert.deepEqual([p.id, p.kind, p.status], ['EVO-001', 'reword', 'proposed']);
    assert.deepEqual(propose(diagnosePattern(patterns(events)[0], events, [facetOf()]), [p]), [], 'the same finding is not proposed twice');
    assert.throws(() => designFor(p, { id: 'X1', seed: 1 }), /candidate wording/);
    const d = designFor(p, { id: 'X1', seed: 1, variant: 'trials/variants/oracle-v2.md' });
    assert.deepEqual(d.arms.map((a) => `${a.id}:${a.facet}`), ['A:on', 'B:variant', 'C:off'], 'the candidate is tried against the current wording and against no rule');
    assert.equal(d.proposal, 'EVO-001');
    assert.equal(mayAdopt(p, null).ok, false);
    const better = (arm, diff, rand) => rand() < base[diff] * (arm.facet === 'variant' ? 0.2 : 1);
    const first = analyseDesign(play(d, 360, better, { seed: 41 }), d, { rounds: 600 });
    assert.equal(first.arms.find((x) => x.arm === 'B').direction, 'better');
    const early = mayAdopt(p, first);
    assert.equal(early.ok, false, 'one favourable experiment is not enough');
    assert.match(early.why, /independent repetition/);
    const d2 = { ...designFor(p, { id: 'X2', seed: 2, variant: 'trials/variants/oracle-v2.md' }), confirms: 'X1' };
    const second = analyseDesign(play(d2, 360, better, { seed: 42, prefix: 'R' }), d2, { rounds: 600, prior: first });
    assert.equal(mayAdopt(p, second).ok, true);
    const worse = analyseDesign(play(d2, 360, (arm, diff, rand) => rand() < base[diff], { seed: 43, prefix: 'S' }), d2, { rounds: 600, prior: first });
    assert.equal(mayAdopt(p, worse).ok, false, 'a repetition that shows nothing adopts nothing');
    const [load] = propose(diagnosePattern(patterns(mistakes(4, { delivered: false }))[0], mistakes(4, { delivered: false }), [facetOf()]));
    assert.throws(() => designFor(load, { id: 'X3', seed: 1 }), /configuration change/);
    assert.equal(mayAdopt(load, null).ok, true);
});

test('facet intel / evolve: a design deals arms as steps start, and adoption without evidence is refused — through the command line', () => {
    const root = tmp();
    write(root, 'package.json', '{"name":"p","version":"1.0.0"}\n');
    gitInit(root);
    const facet = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf-8' });
    assert.match(facet('intel', 'design', 'T1', '--facet', FACET).stderr, /seed/);
    const made = facet('intel', 'design', 'T1', '--facet', FACET, '--seed', '5', '--arms', 'four', '--other-model', 'haiku');
    assert.equal(made.status, 0, made.stdout + made.stderr);
    assert.match(facet('intel', 'design', 'T1', '--facet', FACET, '--seed', '6').stderr, /written once/);
    assert.match(facet('intel', 'design', 'T2', '--facet', 'thrift-loop:hard-caps', '--seed', '1').stderr, /never withheld/);
    assert.equal(facet('intel', 'start', 'T1').status, 0);
    const report = facet('intel', 'report', 'T1').stdout;
    assert.match(report, /not enough data: 30 comparable units/);
    assert.match(report, /arm C \(facet delivered, on haiku\)/);
    fs.mkdirSync(path.join(root, 'trials', 'proposals'), { recursive: true });
    fs.writeFileSync(path.join(root, 'trials', 'proposals', 'EVO-001.json'), JSON.stringify({ id: 'EVO-001', key: 'k', status: 'proposed', kind: 'reword', mode: 'false-green', agent: 'specifier', facet: FACET, items: ['a', 'b', 'c'], why: 'w', change: 'c' }));
    const refused = facet('evolve', 'adopt', 'EVO-001', '--by', 'someone');
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /not adopted — no experiment has been run/);
    assert.match(facet('evolve', 'adopt', 'EVO-001').stderr, /person's decision/);
    assert.match(facet('evolve', 'scan').stdout, /0 recurring cause/);
});
