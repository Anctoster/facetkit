// benchmark: the guards are judged by cases they did not write. Every fixture under
// benchmark/fixtures is a deliberately damaged journal, a dishonest story or a doctored proof; what
// each must lead to is stated in benchmark/expected.json, apart from the code under test. A guard
// that lets one through fails the benchmark — there is no partial credit and no "expected failure".
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyse, assertAblatable, assign, newExperiment } from './experiments.mjs';
import { evaluate, gate } from './govern.mjs';
import { verifyJournal } from './journal.mjs';
import { checkOwners } from './ownership.mjs';
import { createProof, sourceState, verifyProof } from './proof.mjs';

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf-8'));

function journalCase(dir) {
    const v = verifyJournal(dir);
    const problems = [...v.broken.map((b) => `chain broken at ${b.segment}:${b.line}`), ...v.structure.map((s) => s.problem)];
    return { intact: v.intact, events: v.events, problem: problems[0] ?? null, conflicts: v.conflicts.length };
}
function governCase(story) {
    const e = evaluate(story.events, story.item, { project: story.project ?? {}, checks: story.checks ?? [] });
    const g = gate(e, { required: story.required ?? 1 });
    return { level: e.level, allow: g.allow, failing: g.failing.map((r) => r.id).sort(), unknown: e.results.filter((r) => r.unknown).map((r) => r.id).sort() };
}
function proofCases(story) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'facet-bench-'));
    try {
        fs.mkdirSync(path.join(root, 'src'));
        fs.writeFileSync(path.join(root, 'src', 'a.txt'), 'one\n');
        const src = sourceState(root).state;
        const events = story.events.map((e) => (e.kind === 'evidence' ? { ...e, src } : e));
        const options = { project: { journalIntact: true } };
        const manifest = createProof(root, events, story.item, { ...options, now: '2026-01-05T12:00:00.000Z' });
        const out = { fresh: verifyProof(root, events, manifest, options).status, level: manifest.level };
        out.tampered = verifyProof(root, events, { ...manifest, level: 'L4 calibrated' }, options).status;
        out.unverifiedJournal = verifyProof(root, events, manifest, {}).status;
        out.rewrittenHistory = verifyProof(root, [...events, { kind: 'waiver', item: story.item, rule: 'scan', reason: 'later', at: '2026-01-06T00:00:00.000Z' }], manifest, options).status;
        fs.writeFileSync(path.join(root, 'src', 'a.txt'), 'two\n');
        out.afterEdit = verifyProof(root, events, manifest, options).status;
        out.evidenceAfterEdit = evaluate(events, story.item, { ...options, source: sourceState(root).state }).results.find((r) => r.id === 'scan').pass;
        return out;
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}
function experimentCases(spec) {
    const m = newExperiment({ ...spec.manifest, now: '2026-01-05T00:00:00.000Z' });
    let refused = false;
    try {
        assertAblatable({ ref: 'x:safety', ablatable: false });
    } catch {
        refused = true;
    }
    return { arms: spec.units.map((u) => assign(m, u)), again: spec.units.map((u) => assign(m, u)).join() === spec.units.map((u) => assign(m, u)).join(), safetyRefused: refused, emptyVerdict: analyse([], m).verdict.startsWith('not enough data'), emptyStage: analyse([], m).stage };
}

/** Runs every fixture; returns { cases: [{ id, expected, got, pass }], passed, failed }. */
export function runBenchmark(dir) {
    const expected = read(path.join(dir, 'expected.json'));
    const fx = path.join(dir, 'fixtures');
    const got = {};
    for (const name of fs.readdirSync(path.join(fx, 'journal')).sort()) got[`journal/${name}`] = journalCase(path.join(fx, 'journal', name));
    for (const file of fs.readdirSync(path.join(fx, 'governance')).sort()) got[`governance/${path.basename(file, '.json')}`] = governCase(read(path.join(fx, 'governance', file)));
    got['proof/lifecycle'] = proofCases(read(path.join(fx, 'proof', 'story.json')));
    got['experiments/replay'] = experimentCases(read(path.join(fx, 'experiments', 'replay.json')));
    const own = read(path.join(fx, 'ownership', 'plan.json'));
    const c = checkOwners(own.files, own.manifest);
    got['ownership/plan'] = { ok: c.ok, unassigned: c.unassigned, conflicts: c.conflicts.map((r) => r.file) };
    const ids = [...new Set([...Object.keys(expected), ...Object.keys(got)])].sort();
    const cases = ids.map((id) => {
        const want = expected[id];
        const have = got[id];
        // a fixture without an expectation, or an expectation without a fixture, is a failure: nothing passes by absence
        const pass = want !== undefined && have !== undefined && Object.entries(want).every(([k, v]) => JSON.stringify(have[k]) === JSON.stringify(v));
        return { id, expected: want ?? null, got: have ?? null, pass };
    });
    return { cases, passed: cases.filter((x) => x.pass).length, failed: cases.filter((x) => !x.pass).length };
}

export function benchmarkReport(result, { root, version }) {
    const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf-8' }).stdout?.trim() || null;
    return { version, commit: git('rev-parse', 'HEAD'), dirty: !!git('status', '--porcelain'), node: process.version, at: new Date().toISOString(), passed: result.passed, failed: result.failed, cases: result.cases };
}
/** Cases that passed in the earlier report and do not pass now. */
export const regressions = (before, now) => now.cases.filter((c) => !c.pass && before.cases.find((b) => b.id === c.id)?.pass).map((c) => c.id);

export function renderBenchmark(report, lost = []) {
    const groups = {};
    for (const c of report.cases) (groups[c.id.split('/')[0]] ??= []).push(c);
    return [
        `FACETKIT GUARD BENCHMARK · version ${report.version} · commit ${(report.commit ?? 'none').slice(0, 8)}${report.dirty ? ' + uncommitted changes' : ''} · node ${report.node}`,
        ...Object.entries(groups).map(([g, list]) => `  ${g.padEnd(12)} ${list.filter((c) => c.pass).length}/${list.length}${list.some((c) => !c.pass) ? `  FAILED: ${list.filter((c) => !c.pass).map((c) => c.id.split('/')[1]).join(', ')}` : ''}`),
        ...report.cases.filter((c) => !c.pass).map((c) => `  ✗ ${c.id}\n      expected ${JSON.stringify(c.expected)}\n      got      ${JSON.stringify(c.got)}`),
        lost.length ? `  regressions since the last recorded version: ${lost.join(', ')}` : null,
        `RESULT: ${report.failed ? 'FAIL' : 'PASS'} — ${report.passed} of ${report.cases.length} cases`,
    ].filter(Boolean).join('\n');
}
