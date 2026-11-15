import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BENCHMARK_SCHEMA, benchmarkReport, reportProblems, runBenchmark, trend } from '../lib/benchmark.mjs';
import { evaluate } from '../lib/govern.mjs';
import { readJournal, record, verifyJournal } from '../lib/journal.mjs';
import { probe } from '../lib/mutaprobe.mjs';
import { createProof, exportProof, sourceState, verifyBundle } from '../lib/proof.mjs';
import { gitInit, story, tmp, write } from './helpers.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('journal: every event has an id of its own content; a doubled or doctored event and each kind of damage has its own status', () => {
    assert.equal(verifyJournal(path.join(tmp(), 'none')).status, 'empty');
    const dir = path.join(tmp(), 'journal');
    for (let i = 0; i < 3; i++) record(dir, { kind: 'note', text: `n${i}` }, { writer: 'ann' });
    const ev = readJournal(dir);
    assert.equal(new Set(ev.map((e) => e.id)).size, 3);
    assert.match(ev[0].id, /^[0-9a-f]{12}$/);
    assert.equal(verifyJournal(dir).status, 'intact');
    const seg = path.join(dir, 'ann.jsonl');
    const lines = fs.readFileSync(seg, 'utf-8').split('\n').filter(Boolean);
    fs.writeFileSync(seg, `${lines.map((l, i) => (i === 1 ? l.replace('n1', 'nX') : l)).join('\n')}\n`);
    const doctored = verifyJournal(dir);
    assert.equal(doctored.status, 'tampered');
    assert.match(doctored.structure.map((s) => s.problem).join(), /does not match the event/);
    fs.writeFileSync(seg, `${lines.join('\n')}\n{"kind":"no`);
    assert.equal(verifyJournal(dir).status, 'torn');
    const two = path.join(tmp(), 'journal');
    record(two, { kind: 'item.open', item: 'A' }, { writer: 'ann' });
    record(two, { kind: 'item.open', item: 'A' }, { writer: 'bob' });
    assert.equal(verifyJournal(two).status, 'conflict');
    assert.equal(verifyJournal(path.join(ROOT, 'benchmark', 'fixtures', 'journal', 'clean')).status, 'intact', 'events written before ids existed are still accepted');
});

test('journal: the session and the actor are recorded when given, and absent otherwise', () => {
    const dir = path.join(tmp(), 'journal');
    const code = `import { record } from ${JSON.stringify(`file://${path.join(ROOT, 'lib', 'journal.mjs')}`)}; record(${JSON.stringify(dir)}, { kind: 'note' }, { writer: 'ann' });`;
    spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, FACET_SESSION: 'Run 7', FACET_ACTOR: 'inspector' } });
    spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, FACET_SESSION: '', FACET_ACTOR: '' } });
    const [a, b] = readJournal(dir);
    assert.deepEqual([a.s, a.actor, b.s, b.actor], ['run-7', 'inspector', undefined, undefined]);
    assert.equal(verifyJournal(dir).intact, true);
});

function judged({ builderRun, judgeRun }) {
    const s = story();
    s.open('A', [{ id: 'build', agent: 'builder', phase: 'build' }, { id: 'proof', agent: 'inspector', phase: 'proof', verdict: true }]);
    s.say({ kind: 'step.start', item: 'A', step: 'build', agent: 'builder', run: builderRun });
    s.say({ kind: 'step.end', item: 'A', step: 'build', agent: 'builder', status: 'DONE' });
    s.say({ kind: 'step.start', item: 'A', step: 'proof', agent: 'inspector', run: judgeRun });
    s.say({ kind: 'evidence', item: 'A', name: 'scan', ok: true, value: 0, approvals: [] });
    s.say({ kind: 'step.end', item: 'A', step: 'proof', agent: 'inspector', status: 'DONE' });
    s.say({ kind: 'verdict', item: 'A', verdict: 'PASS', fixes: [] });
    return s.events;
}
test('govern: another name is not another mind — one run judging its own work is not independent; with identity required, an unnamed run is unknown', () => {
    const rule = (events, project = {}) => evaluate(events, 'A', { project: { journalIntact: true, ...project } }).results.find((r) => r.id === 'independent');
    assert.equal(rule(judged({ builderRun: 'r1', judgeRun: 'r2' })).pass, true);
    assert.equal(rule(judged({ builderRun: 'r1', judgeRun: 'r1' })).pass, false, 'the same session played both roles');
    assert.equal(rule(judged({})).pass, true, 'without run ids the old rule holds: a different agent');
    const strict = rule(judged({}), { identity: 'required' });
    assert.deepEqual([strict.pass, strict.unknown], [false, true]);
    assert.equal(rule(judged({ builderRun: 'r1', judgeRun: 'r2' }), { identity: 'required' }).pass, true);
});

test('proof bundle: verified with nothing but the file — valid, stale on other sources, tampered when anything in it was touched', () => {
    const root = tmp();
    write(root, 'src/a.mjs', 'export const a = 1;\n');
    gitInit(root);
    const dir = path.join(root, '.work', 'journal');
    const src = sourceState(root).state;
    for (const e of judged({ builderRun: 'r1', judgeRun: 'r2' })) record(dir, { ...e, ...(e.kind === 'evidence' ? { src } : {}) }, { writer: 'ann' });
    const events = readJournal(dir);
    const manifest = createProof(root, events, 'A', { project: { journalIntact: true } });
    const segments = { 'ann.jsonl': fs.readFileSync(path.join(dir, 'ann.jsonl'), 'utf-8').split('\n').filter(Boolean) };
    const bundle = JSON.parse(JSON.stringify(exportProof(manifest, events, { segments })));
    const v = verifyBundle(bundle, { root });
    assert.equal(v.status, 'VALID', JSON.stringify(v.steps));
    assert.equal(v.level, 'L1 reproduced');
    assert.equal(verifyBundle(bundle).sourcesChecked, false);
    const clone = tmp();
    write(clone, 'src/a.mjs', 'export const a = 1;\n');
    assert.equal(verifyBundle(bundle, { root: clone }).status, 'VALID', 'another copy of the same sources');
    write(clone, 'src/a.mjs', 'export const a = 2;\n');
    assert.equal(verifyBundle(bundle, { root: clone }).status, 'STALE');
    const forge = (fn) => {
        const b = JSON.parse(JSON.stringify(bundle));
        fn(b);
        return verifyBundle(b);
    };
    assert.equal(forge((b) => (b.manifest.level = 'L4 calibrated')).status, 'TAMPERED');
    assert.equal(forge((b) => b.events.push({ kind: 'waiver', item: 'A', rule: 'scan', reason: 'x' })).status, 'TAMPERED');
    assert.equal(forge((b) => (b.segments['ann.jsonl'][2] = b.segments['ann.jsonl'][2].replace('builder', 'someone'))).status, 'TAMPERED');
    assert.equal(forge((b) => (b.facts = { journalIntact: true, guardCatchLow: 1 })).status, 'TAMPERED', 'the exporter cannot vouch for facts after the fact');
    assert.equal(verifyBundle({ schema: 'something-else' }).status, 'MISMATCH');
});

test('mutation probe: five outcomes that are never merged — a mutant that does not load is invalid, not detected', () => {
    const root = tmp();
    write(root, 'package.json', '{"type":"module"}\n');
    write(root, 'calc.mjs', 'export const big = (n) => n > 10;\nexport const sum = (a, b) => a + b;\nexport const label = (n) => (n === 0 ? "none" : "some");\n');
    write(root, 'check.mjs', "import assert from 'node:assert/strict';\nimport { big, sum } from './calc.mjs';\nassert.equal(big(11), true); assert.equal(big(10), false); assert.equal(sum(2, 3), 5);\n");
    const all = probe({ cwd: root, files: ['calc.mjs'], test: 'node check.mjs', max: 20 });
    assert.equal(all.baseline, 'green');
    const o = all.outcomes;
    assert.equal(o.detected + o.survived + o.equivalent + o.invalid + o.notExecuted, all.planned);
    assert.ok(o.detected > 0 && o.survived > 0, JSON.stringify(o));
    const s = all.survived[0];
    const again = probe({ cwd: root, files: ['calc.mjs'], test: 'node check.mjs', max: 20, equivalents: [{ file: s.file, line: s.line, op: s.op }] });
    assert.equal(again.outcomes.equivalent, 1);
    assert.equal(again.outcomes.survived, o.survived - 1);
    assert.equal(fs.readFileSync(path.join(root, 'calc.mjs'), 'utf-8').includes('n > 10'), true, 'the file is restored');
});

test('benchmark: a report has a schema, and versions line up into a trend that names what was lost', () => {
    const report = benchmarkReport(runBenchmark(path.join(ROOT, 'benchmark')), { root: ROOT, version: '9.9.9' });
    assert.equal(report.schema, BENCHMARK_SCHEMA);
    assert.deepEqual(reportProblems(report), []);
    assert.deepEqual(reportProblems({ version: 1, cases: [{ id: 'x' }] }), ['schema', 'version', 'cases', 'counts', 'node']);
    const older = { ...report, version: '9.9.8', cases: report.cases.slice(1) };
    const worse = { ...report, version: '10.0.0', cases: report.cases.map((c, i) => (i === 2 ? { ...c, pass: false } : c)), passed: report.passed - 1 };
    const t = trend([older, report, worse]);
    assert.deepEqual([t[1].added.length, t[1].lost.length, t[2].lost], [1, 0, [report.cases[2].id]]);
});

test('demo: the five-minute proof scenario runs from start to finish', () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'demo-proof.mjs'), '--quiet'], { encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').at(-1)), { valid: true, stale: true, tampered: true, level: 'L1 reproduced' });
});

test('guards: the files that carry the guarantees are listed, exist, and have an owner rule', () => {
    const owners = fs.readFileSync(path.join(ROOT, '.github', 'CODEOWNERS'), 'utf-8');
    for (const f of ['lib/journal.mjs', 'lib/govern.mjs', 'lib/proof.mjs', 'benchmark/expected.json', 'lib/benchmark.mjs']) {
        assert.ok(fs.existsSync(path.join(ROOT, f)), f);
        assert.ok(owners.includes(`/${f}`), `${f} is a guard file and must be in CODEOWNERS`);
    }
});
