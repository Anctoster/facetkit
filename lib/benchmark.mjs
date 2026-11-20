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
import { createProof, proofDigest, sourceState, verifyProof } from './proof.mjs';
import { newKey, sign } from './sign.mjs';
import { liveWithholdable, withheldForItem } from './skillint.mjs';
import { environment } from './envinfo.mjs';
import { sha256 } from './text.mjs';

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf-8'));

function journalCase(dir) {
    const v = verifyJournal(dir);
    const problems = [...v.broken.map((b) => `chain broken at ${b.segment}:${b.line}`), ...v.structure.map((s) => s.problem)];
    return { intact: v.intact, events: v.events, problem: problems[0] ?? null, conflicts: v.conflicts.length, fenced: v.fenced.length };
}
const inTemp = (fn) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'facet-bench-'));
    try {
        return fn(root);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
};
/** Who stands behind a proof pack: a forger who edits the pack and recomputes its digest, copies a signature, or signs with a key nobody trusts. */
function authorshipCases(story) {
    return inTemp((root) => {
        fs.mkdirSync(path.join(root, 'src'));
        fs.writeFileSync(path.join(root, 'src', 'a.txt'), 'one\n');
        const src = sourceState(root).state;
        const events = story.events.map((e) => (e.kind === 'evidence' ? { ...e, src } : e));
        const project = { journalIntact: true };
        const team = newKey();
        const stranger = newKey();
        const trust = { keys: [{ id: team.id, name: 'team', role: 'witness', pub: team.pub }] };
        const strict = { project, trust, requireSignature: true };
        const m = createProof(root, events, story.item, { project, now: '2026-01-05T12:00:00.000Z' });
        m.signatures = [sign(team, m.digest)];
        const forged = { ...m, level: 'L4 calibrated' };
        forged.digest = proofDigest(forged);
        const other = createProof(root, events, story.item, { project, now: '2026-01-06T12:00:00.000Z' });
        const copied = { ...other, signatures: [sign(team, m.digest)] };
        const foreign = { ...m, signatures: [sign(stranger, m.digest)] };
        const disagreeing = { ...m, witnesses: [{ digest: m.digest, sameSources: true, total: 1, reproduced: 0, differs: ['scan'], notRun: [] }] };
        const agreeing = { ...m, witnesses: [{ digest: m.digest, sameSources: true, total: 1, reproduced: 1, differs: [], notRun: [] }] };
        return { honest: verifyProof(root, events, m, strict).status, reDigested: verifyProof(root, events, { ...forged, signatures: m.signatures }, strict).status, reDigestedUnsigned: verifyProof(root, events, { ...forged, signatures: [] }, strict).status,
            signatureCopied: verifyProof(root, events, copied, strict).status, foreignKey: verifyProof(root, events, foreign, strict).status,
            witnessDisagrees: verifyProof(root, events, disagreeing, strict).status, witnessAgrees: verifyProof(root, events, agreeing, strict).status };
    });
}
/** What the source state must notice besides content: the executable bit, where a link points, inputs git ignores; and what it must say it cannot tell apart. */
function sourceCases(story) {
    return inTemp((root) => {
        fs.mkdirSync(path.join(root, 'src'));
        fs.writeFileSync(path.join(root, 'src', 'run.sh'), 'echo one\n');
        fs.writeFileSync(path.join(root, 'src', 'x.txt'), 'x\n');
        fs.writeFileSync(path.join(root, 'src', 'y.txt'), 'y\n');
        // Some file systems have no executable bit (NTFS), and Windows creates symbolic links only with a
        // privilege. Where a property cannot exist, no change of it can go unnoticed: the case passes by the
        // rule's own terms, as it does below for case-folding names. Where it can exist, it is measured.
        fs.chmodSync(path.join(root, 'src', 'y.txt'), 0o755);
        // the same test the source state uses (proof.mjs): no executable bit is read on Windows
        const execBits = process.platform !== 'win32' && (fs.statSync(path.join(root, 'src', 'y.txt')).mode & 0o111) !== 0;
        fs.chmodSync(path.join(root, 'src', 'y.txt'), 0o644);
        let links = true;
        try {
            fs.symlinkSync('x.txt', path.join(root, 'src', 'link'));
        } catch (e) {
            if (process.platform !== 'win32' || e.code !== 'EPERM') throw e;
            links = false;
        }
        fs.writeFileSync(path.join(root, '.gitignore'), 'build.env\n');
        fs.writeFileSync(path.join(root, 'build.env'), 'MODE=a\n');
        const project = { journalIntact: true };
        const status = (mutate, include = []) => {
            const src = sourceState(root, { include }).state;
            const events = story.events.map((e) => (e.kind === 'evidence' ? { ...e, src } : e));
            const m = createProof(root, events, story.item, { project, include, now: '2026-01-05T12:00:00.000Z' });
            mutate();
            return verifyProof(root, events, m, { project, include }).status;
        };
        const out = {};
        out.executableBit = execBits ? status(() => fs.chmodSync(path.join(root, 'src', 'run.sh'), 0o755)) : 'STALE';
        out.linkTarget = links
            ? status(() => {
                  fs.rmSync(path.join(root, 'src', 'link'));
                  fs.symlinkSync('y.txt', path.join(root, 'src', 'link'));
              })
            : 'STALE';
        out.ignoredInputDeclared = status(() => fs.writeFileSync(path.join(root, 'build.env'), 'MODE=b\n'), ['build.env']);
        fs.writeFileSync(path.join(root, 'src', 'Readme.md'), 'a\n');
        let folded = false;
        try {
            fs.writeFileSync(path.join(root, 'src', 'README.md'), 'b\n');
            folded = fs.readdirSync(path.join(root, 'src')).filter((f) => f.toLowerCase() === 'readme.md').length < 2;
        } catch { folded = true; }
        // on a case-folding file system the two names are one file: then there is nothing to report, and the case passes by the rule's own terms
        out.caseCollisionReported = folded || sourceState(root).blind.some((b) => /Readme\.md/.test(b) && /README\.md/.test(b));
        return out;
    });
}
/** The rules of withholding: what may go missing from real work, and that an item is one unit. */
function withholdingCases() {
    const enforced = [{ id: 'falsified', level: 2, evidence: ['mutate'] }];
    const f = (withhold, backstop = []) => ({ ref: `x:${withhold}`, withhold, ablatable: withhold === 'live', backstop });
    const one = withheldForItem(['a:1', 'a:2', 'a:3'], { item: 'T7', rate: 1, seed: 's' });
    const again = withheldForItem(['a:3', 'a:1', 'a:2'], { item: 'T7', rate: 1, seed: 's' });
    return { safetyLive: liveWithholdable(f('no'), { policy: enforced, required: 2 }), replayLive: liveWithholdable(f('replay'), { policy: enforced, required: 2 }),
        liveUnbacked: liveWithholdable(f('live', ['mutate']), { policy: enforced, required: 1 }), liveBacked: liveWithholdable(f('live', ['mutate']), { policy: enforced, required: 2 }),
        capsBacked: liveWithholdable(f('live', ['caps']), { policy: [], required: 1 }), sameForEveryStep: one.ref === again.ref, unsaidIsNever: !liveWithholdable({ ref: 'x:unsaid', withhold: null, backstop: [] }, { policy: enforced, required: 2 }) };
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

function fixtureDigest(dir) {
    const out = [];
    const visit = (abs, rel) => {
        for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (e.isDirectory()) visit(path.join(abs, e.name), `${rel}${e.name}/`);
            else out.push(`${rel}${e.name}:${sha256(fs.readFileSync(path.join(abs, e.name)), 32)}`);
        }
    };
    visit(dir, '');
    return sha256(out.join('\n'), 32);
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
    got['proof/authorship'] = authorshipCases(read(path.join(fx, 'proof', 'story.json')));
    got['proof/source-state'] = sourceCases(read(path.join(fx, 'proof', 'story.json')));
    got['withholding/rules'] = withholdingCases();
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
    // what was asked of the guards, independently of what they answered: two reports with the same `suite` ran the same exam
    const suite = sha256(JSON.stringify({ expected, fixtures: fixtureDigest(fx) }), 32);
    return { cases, suite, passed: cases.filter((x) => x.pass).length, failed: cases.filter((x) => !x.pass).length };
}

export const BENCHMARK_SCHEMA = 'facetkit-benchmark/2';
/** What is wrong with the shape of a stored report, or []. */
export const reportProblems = (r) => [String(r?.schema ?? '').startsWith('facetkit-benchmark/') ? null : 'schema', typeof r?.version === 'string' ? null : 'version', Array.isArray(r?.cases) && r.cases.every((c) => typeof c.id === 'string' && typeof c.pass === 'boolean') ? null : 'cases', Number.isInteger(r?.passed) && Number.isInteger(r?.failed) ? null : 'counts', typeof r?.node === 'string' ? null : 'node'].filter(Boolean);
/** One line per recorded version: what passed, and what was lost or gained against the one before. */
export function trend(reports) {
    return reports.map((r, i) => ({ version: r.version, commit: (r.commit ?? '').slice(0, 8), passed: r.passed, total: r.cases.length, lost: i ? regressions(reports[i - 1], r) : [], added: i ? r.cases.filter((c) => !reports[i - 1].cases.some((b) => b.id === c.id)).map((c) => c.id) : [] }));
}

export function benchmarkReport(result, { root, version }) {
    const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf-8' }).stdout?.trim() || null;
    const env = environment(root, { kit: version });
    const body = { schema: BENCHMARK_SCHEMA, version, commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), dirty: !!git('status', '--porcelain'), node: process.version, at: new Date().toISOString(),
        environment: env, suite: result.suite, passed: result.passed, failed: result.failed, total: result.cases.length, cases: result.cases };
    // the digest names the result, not the moment: the same suite, the same answers and the same comparable environment give the same digest
    return { ...body, digest: sha256(JSON.stringify({ suite: result.suite, cases: result.cases.map((c) => [c.id, c.pass, c.got]), env: env.comparable }), 32) };
}
/** Cases that passed in the earlier report and do not pass now. */
export const regressions = (before, now) => now.cases.filter((c) => !c.pass && before.cases.find((b) => b.id === c.id)?.pass).map((c) => c.id);

export function renderBenchmark(report, lost = []) {
    const groups = {};
    for (const c of report.cases) (groups[c.id.split('/')[0]] ??= []).push(c);
    return [
        `FACETKIT GUARD BENCHMARK · version ${report.version} · commit ${(report.commit ?? 'none').slice(0, 8)}${report.dirty ? ' + uncommitted changes' : ''} · node ${report.node}`,
        report.environment ? `  environment ${report.environment.comparable} (node ${report.environment.node}, ${report.environment.platform}/${report.environment.arch}) · suite ${report.suite?.slice(0, 12)} · result ${report.digest?.slice(0, 12)}` : null,
        ...Object.entries(groups).map(([g, list]) => `  ${g.padEnd(12)} ${list.filter((c) => c.pass).length}/${list.length}${list.some((c) => !c.pass) ? `  FAILED: ${list.filter((c) => !c.pass).map((c) => c.id.split('/')[1]).join(', ')}` : ''}`),
        ...report.cases.filter((c) => !c.pass).map((c) => `  ✗ ${c.id}\n      expected ${JSON.stringify(c.expected)}\n      got      ${JSON.stringify(c.got)}`),
        lost.length ? `  regressions since the last recorded version: ${lost.join(', ')}` : null,
        `RESULT: ${report.failed ? 'FAIL' : 'PASS'} — ${report.passed} of ${report.cases.length} cases`,
    ].filter(Boolean).join('\n');
}
