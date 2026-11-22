// qa: the tester's side of the same record. A tester answers three questions every release —
// where to look, is this really a bug, may we ship — and each answer here is computed from the
// code, the journal and runs the tester can repeat, not from a feeling.
//
//  where to look  a risk map of what changed: the class of each file (security, api, ops…), how
//                 many modules depend on it, whether any test reaches it, how often it changed,
//                 whether defects were found there before. Each area comes with the kinds of tests
//                 it calls for and the reason in words.
//  is it a bug    a bug report carries its reproduction. With a command, `verify` runs it several
//                 times: fails every time → reproduced; sometimes → flaky (that is a finding of its
//                 own); never → not reproduced. With manual steps, a second person must reproduce it
//                 before it counts — the witness rule of proofs, applied to bugs. After the fix the
//                 same reproduction must pass, and a test that names the bug must exist.
//  may we ship    readiness: open bugs by severity, fixes not verified, items closed below the level
//                 the project requires, risky areas no charter and no test touched, flaky checks.
//                 GO or NO-GO with every reason listed; a person decides, the record says why.
//
// A bug found in work an item had closed is an escape of that item: it is recorded as such, so the
// trust in the team and the diagnosis of its rules learn from what testers find.
import { runCommand } from './shell.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { classify, DEFAULT_PLANNING } from './planner.mjs';
import { MODES } from './skillint.mjs';

export const SEVERITIES = ['blocker', 'critical', 'major', 'minor', 'trivial'];
export const QA = { runs: 3, hotChurn: 5, top: 15 };
const WEIGHT = { security: 6, ops: 3, api: 3, code: 1.5, config: 1, style: 0.5, docs: 0.1, test: 0.2 };

// ---- where to look --------------------------------------------------------------------------
/** What kinds of tests an area calls for, with the reason — in the words a tester uses. */
function suggestions(row) {
    const out = [];
    if (row.tag === 'security') out.push('abuse cases: wrong role, expired session, forged input, rate limits');
    if (row.tag === 'api' && row.dependents) out.push(`contract tests for its ${row.dependents} consumer(s): the same request, old and new code`);
    if (!row.tested) out.push('no test reaches it: start with one test of its main path');
    if (row.churn >= QA.hotChurn) out.push(`changed in ${row.churn} commits: regression tests around the last changes`);
    if (row.escapes) out.push(`${row.escapes} defect(s) were found here after acceptance: re-test those cases first`);
    if (row.tag === 'style' || /\.(tsx|jsx|vue|svelte|html|css)$/.test(row.file)) out.push('visual check in two viewports (facet ui)');
    if (row.tag === 'ops') out.push('rehearse deploy and rollback on a copy');
    return out.length ? out : ['smoke test of the changed behaviour'];
}

/**
 * The risk map of a set of files. `graph` from seams.buildGraph, `churn` a map file → commits,
 * `escapes` a map file → defects found after acceptance. Rows are sorted by risk, highest first.
 */
export function riskMap(files, { graph, churn = {}, escapes = {}, isTest = () => false, planning = DEFAULT_PLANNING } = {}) {
    const rows = [...new Set(files)].filter((f) => !isTest(f)).map((file) => {
        const tag = classify(file, { planning, graph });
        const users = (graph?.importers.get(file) ?? []).filter((u) => !isTest(u));
        const testers = (graph?.importers.get(file) ?? []).filter(isTest);
        const viaUsers = users.flatMap((u) => (graph?.importers.get(u) ?? []).filter(isTest));
        const tested = testers.length + viaUsers.length > 0;
        const row = { file, tag, dependents: users.length, tested, tests: [...new Set([...testers, ...viaUsers])].slice(0, 3), churn: churn[file] ?? 0, escapes: escapes[file] ?? 0 };
        const score = (WEIGHT[tag] ?? 1) * (1 + Math.log2(row.dependents + 1)) * (1 + Math.min(row.churn, 20) / 10) * (tested ? 1 : 2) * (1 + row.escapes);
        return { ...row, score: +score.toFixed(1), level: score >= 12 ? 'high' : score >= 4 ? 'medium' : 'low', check: suggestions(row) };
    });
    return rows.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
}
export function renderRiskMap(rows, { top = QA.top } = {}) {
    if (!rows.length) return 'nothing to test: no source file changed';
    const by = (l) => rows.filter((r) => r.level === l).length;
    return [
        `${rows.length} changed file(s): ${by('high')} high, ${by('medium')} medium, ${by('low')} low risk`,
        ...rows.slice(0, top).map((r) => `  ${r.level.padEnd(6)} ${String(r.score).padStart(5)}  ${r.file}  [${r.tag}${r.dependents ? `, used by ${r.dependents}` : ''}${r.tested ? '' : ', NO TEST'}${r.churn ? `, ${r.churn} commits` : ''}${r.escapes ? `, ${r.escapes} escaped defect(s)` : ''}]\n${r.check.map((c) => `           → ${c}`).join('\n')}`),
        rows.length > top ? `  … ${rows.length - top} more (--top N)` : null,
    ].filter(Boolean).join('\n');
}

// ---- is it a bug ------------------------------------------------------------------------------
export const bugsDir = (root) => path.join(root, '.facet', 'bugs');
const fileOf = (root, id) => path.join(bugsDir(root), `${id}.json`);
export const loadBug = (root, id) => (fs.existsSync(fileOf(root, id)) ? JSON.parse(fs.readFileSync(fileOf(root, id), 'utf-8')) : null);
export const loadBugs = (root) => (fs.existsSync(bugsDir(root)) ? fs.readdirSync(bugsDir(root)).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(bugsDir(root), f), 'utf-8'))) : []);
export function saveBug(root, bug) {
    fs.mkdirSync(bugsDir(root), { recursive: true });
    fs.writeFileSync(fileOf(root, bug.id), `${JSON.stringify(bug, null, 2)}\n`);
    return bug;
}

/** A new bug report. A command makes it repeatable by anyone; steps make it repeatable by a person. */
export function newBug({ id, title, severity = 'major', repro = null, steps = [], expected, actual = null, by = null, item = null, area = [], mode = null, now = new Date().toISOString() }) {
    if (!/^[A-Za-z][\w.-]*$/.test(id ?? '')) throw new Error('a bug needs an id of letters, digits, dots or dashes (BUG-12)');
    if (!title) throw new Error('a bug needs a title');
    if (!SEVERITIES.includes(severity)) throw new Error(`severity is one of ${SEVERITIES.join(', ')}`);
    if (!repro && !steps.length) throw new Error('a bug needs a way to reproduce it: --repro "a command that fails while the bug is there" or --steps "1. …; 2. …"');
    if (!expected) throw new Error('a bug needs the expected behaviour (--expect): without it nobody can tell a fix from a change');
    if (mode && !MODES.includes(mode)) throw new Error(`cause is one of ${MODES.join(', ')}`);
    return { id, title, severity, repro, steps, expected, actual, area, item, mode, found: { at: now, by }, status: 'reported', runs: [], confirmations: [] };
}

/**
 * Runs the reproduction `n` times. While the bug is open, the command must FAIL (exit ≠ 0) every
 * time to be reproduced; after a fix it must PASS every time. Mixed answers are flaky.
 */
export function runRepro(root, bug, { n = QA.runs, timeoutSec = 300, env } = {}) {
    if (!bug.repro) return null;
    const runs = [];
    for (let i = 0; i < n; i++) {
        const started = Date.now();
        const r = runCommand(bug.repro, { cwd: root, timeoutSec, ...(env ? { env } : {}) });
        runs.push({ exit: r.status ?? 124, sec: +((Date.now() - started) / 1000).toFixed(1), tail: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-2).join(' | ').slice(0, 200) });
    }
    const failed = runs.filter((r) => r.exit !== 0).length;
    return { runs, failed, outcome: failed === n ? 'fails' : failed === 0 ? 'passes' : 'flaky' };
}
/** Tests that name the bug (its id in a test file): the regression test a fix must leave behind. */
export function testsNaming(root, id, testFiles) {
    return testFiles.filter((f) => {
        try {
            return fs.readFileSync(path.join(root, f), 'utf-8').includes(id);
        } catch {
            return false;
        }
    });
}
/**
 * The status that follows from a verification. reported → reproduced | not-reproduced | flaky;
 * reproduced → fixed (the reproduction passes) → verified (and a test names the bug).
 */
export function nextStatus(bug, result, { regressionTests = [] } = {}) {
    if (!result) return bug.status;
    if (result.outcome === 'flaky') return 'flaky';
    if (['reported', 'not-reproduced', 'flaky'].includes(bug.status)) return result.outcome === 'fails' ? 'reproduced' : 'not-reproduced';
    if (bug.status === 'reproduced' || bug.status === 'fixed') return result.outcome === 'passes' ? (regressionTests.length ? 'verified' : 'fixed') : 'reproduced';
    if (bug.status === 'verified') return result.outcome === 'passes' ? 'verified' : 'reopened';
    if (bug.status === 'reopened') return result.outcome === 'passes' ? (regressionTests.length ? 'verified' : 'fixed') : 'reopened';
    return bug.status;
}
/** A bug reproduced by hand: it counts once somebody other than its finder has reproduced it. */
export function confirmByHand(bug, by, { now = new Date().toISOString() } = {}) {
    if (!by) throw new Error('a confirmation needs the name of the person who reproduced the bug');
    if (by === bug.found.by) throw new Error(`${by} found the bug; a second person must reproduce it`);
    const confirmations = [...bug.confirmations.filter((c) => c.by !== by), { by, at: now }];
    return { ...bug, confirmations, status: ['reported', 'not-reproduced'].includes(bug.status) ? 'reproduced' : bug.status };
}
export const OPEN = ['reported', 'reproduced', 'flaky', 'fixed', 'reopened'];

// ---- may we ship ------------------------------------------------------------------------------
/**
 * GO or NO-GO, with every reason. `items` from the journal: { item, level, closed }; `required`
 * the level the project demands; `risk` the risk map; `explored` files a charter or a test
 * covered; `flaky` names of checks that gave both answers on the same sources.
 */
export function readiness({ bugs = [], items = [], required = 1, risk = [], explored = new Set(), flaky = [] }) {
    const stop = [];
    const warn = [];
    const open = bugs.filter((b) => OPEN.includes(b.status));
    for (const b of open.filter((x) => ['blocker', 'critical'].includes(x.severity) && x.status !== 'fixed')) stop.push(`${b.severity} bug ${b.id} is ${b.status}: ${b.title}`);
    for (const b of open.filter((x) => x.status === 'fixed')) warn.push(`${b.id} is fixed but no test names it yet — the fix can come undone unnoticed`);
    for (const b of open.filter((x) => x.status === 'reported' && !['blocker', 'critical'].includes(x.severity))) warn.push(`${b.id} (${b.severity}) has not been reproduced by a second run or a second person`);
    for (const b of open.filter((x) => x.status === 'flaky')) warn.push(`${b.id} reproduces only sometimes: find the condition before release`);
    for (const i of items.filter((x) => x.closed && x.level < required)) stop.push(`${i.item} closed at L${i.level}, the project requires L${required}`);
    for (const i of items.filter((x) => !x.closed)) warn.push(`${i.item} is still in progress`);
    const blind = risk.filter((r) => r.level === 'high' && !r.tested && !explored.has(r.file));
    for (const r of blind) stop.push(`high-risk ${r.file} changed, no test reaches it and no charter explored it`);
    for (const r of risk.filter((x) => x.level === 'medium' && !x.tested && !explored.has(x.file)).slice(0, 5)) warn.push(`medium-risk ${r.file}: no test, not explored`);
    for (const f of flaky) warn.push(`check ${f} gave both answers on the same sources`);
    const counts = Object.fromEntries(SEVERITIES.map((s) => [s, open.filter((b) => b.severity === s).length]));
    return { go: stop.length === 0, stop, warn, counts, open: open.length };
}
export function renderReadiness(r) {
    return [
        `${r.go ? 'GO' : 'NO-GO'} — ${r.stop.length} reason(s) to stop, ${r.warn.length} to look at · open bugs: ${SEVERITIES.map((s) => `${s} ${r.counts[s]}`).join(', ')}`,
        ...r.stop.map((x) => `  ✗ ${x}`),
        ...r.warn.map((x) => `  ! ${x}`),
        'The decision to ship is a person\'s; this lists what the record says, not what nobody has tested.',
    ].join('\n');
}

// ---- exploratory sessions ---------------------------------------------------------------------
export const chartersDir = (root) => path.join(root, '.facet', 'charters');
export function newCharter({ id, mission, areas = [], minutes = 60, by = null, now = new Date().toISOString() }) {
    if (!id || !mission) throw new Error('a charter needs an id and a mission ("explore <area> with <resources> to discover <information>")');
    if (!(minutes > 0 && minutes <= 240)) throw new Error('a session is time-boxed: 1 to 240 minutes');
    return { id, mission, areas, minutes, by, at: now, status: 'open' };
}
export function closeCharter(charter, { minutes, bugs = [], covered = [], notes = null, now = new Date().toISOString() }) {
    return { ...charter, status: 'closed', closedAt: now, spent: Number(minutes ?? charter.minutes), bugs, covered: covered.length ? covered : charter.areas, notes, overrun: Number(minutes ?? 0) > charter.minutes * 1.5 };
}
