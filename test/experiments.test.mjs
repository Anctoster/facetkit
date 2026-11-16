import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { benchmarkReport, regressions, runBenchmark } from '../lib/benchmark.mjs';
import { analyse, assertAblatable, assign, newExperiment, observationsOf } from '../lib/experiments.mjs';
import { checkOwners, resolveOwners } from '../lib/ownership.mjs';
import { story } from './helpers.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FACET = 'thrift-loop:digest-runs';
const STEPS = [{ id: 'build', agent: 'builder', phase: 'build' }, { id: 'proof', agent: 'inspector', phase: 'proof', verdict: true }];
/** n items; `fails(arm, i)` decides whether the item needs a rework. */
function trial(manifest, n, fails, { model = 'sonnet' } = {}) {
    const s = story();
    for (let i = 0; i < n; i++) {
        const item = `I${i}`;
        const arm = assign(manifest, `${item}|build`);
        s.open(item, STEPS);
        s.say({ kind: 'step.start', item, step: 'build', agent: 'builder', model, facets: arm === 'control' ? [FACET] : [], withheld: arm === 'treatment' ? [FACET] : [], experiments: [{ id: manifest.id, facet: FACET, arm }] });
        s.say({ kind: 'step.end', item, step: 'build', agent: 'builder', status: 'DONE' });
        s.run(item, 'proof', 'inspector');
        if (fails(arm, i)) {
            s.say({ kind: 'verdict', item, verdict: 'REWORK', fixes: [{ agent: 'builder' }] });
            s.run(item, 'build', 'builder');
            s.run(item, 'proof', 'inspector');
        }
        s.say({ kind: 'verdict', item, verdict: 'PASS', fixes: [] });
        s.say({ kind: 'item.close', item });
    }
    return s.events;
}

test('experiments: the manifest comes before the data, the arm is a function of the seed, safety rules are never withheld', () => {
    assert.throws(() => newExperiment({ id: 'E', facet: FACET }), /seed/);
    const m = newExperiment({ id: 'EXP-1', facet: FACET, seed: 7 });
    const units = Array.from({ length: 400 }, (_, i) => `I${i}|build`);
    assert.deepEqual(units.map((u) => assign(m, u)), units.map((u) => assign(m, u)), 'the same seed gives the same assignment');
    assert.notDeepEqual(units.map((u) => assign(m, u)), units.map((u) => assign({ ...m, seed: '8' }, u)));
    const share = units.filter((u) => assign(m, u) === 'control').length / units.length;
    assert.ok(share > 0.4 && share < 0.6, `arms are balanced (${share})`);
    assert.throws(() => assertAblatable({ ref: 'thrift-loop:hard-caps', ablatable: false }), /never withheld/);
});

test('experiments: too few units is "not enough data", whatever the rates look like', () => {
    const m = newExperiment({ id: 'EXP-2', facet: FACET, seed: 1, minSamples: 20 });
    const a = analyse(trial(m, 12, (arm) => arm === 'treatment'), m);
    assert.equal(a.enough, false);
    assert.match(a.verdict, /not enough data/);
    assert.equal(a.direction, 'none');
    assert.equal(a.stage, 'exploratory');
    assert.match(a.action, /change nothing/);
});

test('experiments: a real difference is found, called exploratory, and validated only by an independent repetition', () => {
    const m = newExperiment({ id: 'EXP-3', facet: FACET, seed: 3, minSamples: 20 });
    const first = analyse(trial(m, 120, (arm, i) => (arm === 'treatment' ? i % 10 < 7 : i % 10 < 1)), m);
    assert.equal(first.direction, 'helps');
    assert.equal(first.stage, 'exploratory');
    assert.match(first.action, /repeat on an independent sample/);
    const again = newExperiment({ id: 'EXP-4', facet: FACET, seed: 4, minSamples: 20, confirms: 'EXP-3' });
    const second = analyse(trial(again, 120, (arm, i) => (arm === 'treatment' ? i % 10 < 7 : i % 10 < 1)), again, { prior: first });
    assert.equal(second.stage, 'validated');
    assert.match(second.action, /a person decides/);
    const flat = analyse(trial(again, 120, (_, i) => i % 10 < 3), again, { prior: first });
    assert.equal(flat.direction, 'none');
    assert.equal(flat.stage, 'confirmatory', 'a repetition that shows nothing validates nothing');
});

test('experiments: units on another model are left out, and a facet delivered against its arm invalidates the run', () => {
    const m = newExperiment({ id: 'EXP-5', facet: FACET, seed: 5, minSamples: 5, model: 'sonnet' });
    const mixed = [...trial(m, 30, () => false), ...trial(m, 30, () => false, { model: 'haiku' }).map((e) => ({ ...e, item: e.item ? `H${e.item}` : e.item }))];
    const o = observationsOf(mixed, m);
    assert.equal(o.rows.length, 30);
    assert.equal(o.excluded.model, 30);
    const broken = trial(m, 30, () => false).map((e) => (e.kind === 'step.start' && e.experiments ? { ...e, facets: [FACET] } : e));
    assert.match(analyse(broken, m).verdict, /invalid/);
});

test('experiments: reading many facets at once widens each interval', () => {
    const m = newExperiment({ id: 'EXP-6', facet: FACET, seed: 6, minSamples: 20 });
    const events = trial(m, 120, (arm, i) => (arm === 'treatment' ? i % 10 < 4 : i % 10 < 2));
    const alone = analyse(events, m);
    const among = analyse(events, m, { comparisons: 20 });
    assert.ok(among.control.high - among.control.low > alone.control.high - alone.control.low);
});

test('ownership: the most specific pattern owns the file; no owner and two equal claims are both refused', () => {
    const manifest = { owners: { 'src/**': 'builder', 'lib/*.mjs': 'builder', 'lib/govern.mjs': 'architect', 'a*/x.mjs': 'builder', 'ab/*.mjs': 'pilot' }, shared: ['package.json'] };
    const rows = Object.fromEntries(resolveOwners(['src/deep/a.mjs', 'lib/flow.mjs', 'lib/govern.mjs', 'package.json', 'README.md', 'ab/x.mjs'], manifest).map((r) => [r.file, r]));
    assert.equal(rows['src/deep/a.mjs'].owner, 'builder');
    assert.equal(rows['lib/govern.mjs'].owner, 'architect');
    assert.equal(rows['package.json'].shared, true);
    assert.equal(rows['README.md'].unassigned, true);
    assert.deepEqual(rows['ab/x.mjs'].conflict.sort(), ['builder', 'pilot']);
    assert.equal(checkOwners(['src/a.mjs', 'package.json'], manifest).ok, true);
    assert.equal(checkOwners(['README.md'], manifest).ok, false);
    assert.equal(checkOwners(['lib/govern.mjs'], manifest, { agent: 'builder' }).foreign.length, 1);
    assert.equal(checkOwners(['src\\win\\a.mjs'], manifest).rows[0].owner, 'builder', 'Windows separators resolve the same way');
});

test('benchmark: every adversarial case is caught, and a case without an expectation cannot pass', () => {
    const r = runBenchmark(path.join(ROOT, 'benchmark'));
    assert.deepEqual(r.cases.filter((c) => !c.pass).map((c) => c.id), []);
    assert.ok(r.cases.length >= 17);
    const report = benchmarkReport(r, { root: ROOT, version: 'x' });
    const worse = { ...report, cases: report.cases.map((c, i) => (i === 0 ? { ...c, pass: false } : c)) };
    assert.deepEqual(regressions(report, worse), [report.cases[0].id]);
});
