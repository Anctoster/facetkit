import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readJournal } from '../lib/journal.mjs';
import { closeCharter, confirmByHand, newBug, newCharter, nextStatus, readiness, riskMap, runRepro, testsNaming } from '../lib/qa.mjs';
import { buildGraph, isTest } from '../lib/seams.mjs';
import { gitInit, story, tmp, write } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');

test('risk map: security and widely used modules first; an untested module counts double; each area says what to test and why', () => {
    const root = tmp();
    write(root, 'src/auth/session.js', 'export const s = 1;\n');
    write(root, 'src/price.js', 'export const p = 1;\n');
    write(root, 'src/cart.js', "import { p } from './price.js';\nimport { s } from './auth/session.js';\n");
    write(root, 'src/page.css', 'a{}\n');
    write(root, 'test/cart.test.js', "import '../src/cart.js';\n");
    const graph = buildGraph(root, ['src', 'test']);
    const rows = riskMap(['src/auth/session.js', 'src/price.js', 'src/page.css', 'test/cart.test.js'], { graph, churn: { 'src/price.js': 7 }, escapes: { 'src/price.js': 1 }, isTest });
    assert.deepEqual(rows.map((r) => r.file), ['src/price.js', 'src/auth/session.js', 'src/page.css'], 'tests are not areas to test; a module where a defect escaped before outranks a tested security module');
    const [price, sec, css] = rows;
    assert.deepEqual([sec.tag, sec.level, sec.tested], ['security', 'high', true]);
    assert.ok(sec.check.some((c) => /abuse cases/.test(c)));
    assert.ok(price.check.some((c) => /changed in 7 commits/.test(c)) && price.check.some((c) => /1 defect\(s\) were found here/.test(c)));
    assert.equal(css.level, 'low');
    assert.ok(css.check.some((c) => /two viewports/.test(c)));
    const untested = riskMap(['src/price.js'], { graph: buildGraph(root, ['src']), isTest });
    assert.equal(untested[0].tested, false);
    assert.ok(untested[0].score > riskMap(['src/price.js'], { graph, isTest })[0].score, 'no test reaches it: the risk doubles');
});

test('bug: a report needs a reproduction and an expectation; a command is run several times; flaky is its own finding; a fix needs a test that names the bug', () => {
    const root = tmp();
    assert.throws(() => newBug({ id: 'B1', title: 't', expected: 'x' }), /reproduce/);
    assert.throws(() => newBug({ id: 'B1', title: 't', repro: 'false' }), /expected/);
    assert.throws(() => newBug({ id: 'B1', title: 't', repro: 'false', expected: 'x', severity: 'urgent' }), /severity/);
    let bug = newBug({ id: 'B1', title: 'total ignores quantity', repro: 'node -e "process.exit(require(\'fs\').existsSync(\'fixed\') ? 0 : 1)"', expected: 'total = price × qty', by: 'ann' });
    let r = runRepro(root, bug, { n: 3 });
    assert.deepEqual([r.outcome, r.failed], ['fails', 3]);
    bug = { ...bug, status: nextStatus(bug, r) };
    assert.equal(bug.status, 'reproduced');
    write(root, 'fixed', '');
    r = runRepro(root, bug);
    assert.equal(nextStatus(bug, r), 'fixed', 'passes now, but nothing guards the fix');
    write(root, 'test/total.test.js', '// B1: total ignores quantity\n');
    write(root, 'test/other.test.js', '// nothing\n');
    const tests = testsNaming(root, 'B1', ['test/total.test.js', 'test/other.test.js']);
    assert.deepEqual(tests, ['test/total.test.js']);
    assert.equal(nextStatus(bug, r, { regressionTests: tests }), 'verified');
    assert.equal(nextStatus({ status: 'verified' }, { outcome: 'fails' }), 'reopened');
    // fails the first time, then passes: it leaves a marker behind
    const flaky = runRepro(root, { repro: `node -e "const f = require('fs'); const had = f.existsSync('seen'); f.writeFileSync('seen', ''); process.exit(had ? 0 : 1)"` }, { n: 3 });
    assert.equal(flaky.outcome, 'flaky', 'first run fails, later runs pass');
    assert.equal(nextStatus({ status: 'reported' }, flaky), 'flaky');
});

test('bug by hand: steps count once a second person reproduced them, never on the finder\'s word', () => {
    const bug = newBug({ id: 'B2', title: 'map freezes on zoom', steps: ['open the map', 'zoom twice'], expected: 'smooth zoom', by: 'ann' });
    assert.throws(() => confirmByHand(bug, 'ann'), /second person/);
    assert.throws(() => confirmByHand(bug, null), /name/);
    assert.equal(confirmByHand(bug, 'bob').status, 'reproduced');
});

test('readiness: blockers, items below the level and untested high risk stop the release; the rest is listed to look at', () => {
    const bugs = [newBug({ id: 'B1', title: 'a', repro: 'x', expected: 'y', severity: 'critical' }), { ...newBug({ id: 'B2', title: 'b', repro: 'x', expected: 'y', severity: 'minor' }), status: 'fixed' }, { ...newBug({ id: 'B3', title: 'c', repro: 'x', expected: 'y', severity: 'blocker' }), status: 'verified' }];
    const risk = [{ file: 'src/auth.js', level: 'high', tested: false }, { file: 'src/x.js', level: 'high', tested: false }, { file: 'src/y.js', level: 'medium', tested: false }];
    const r = readiness({ bugs, items: [{ item: 'P1', closed: true, level: 1 }, { item: 'P2', closed: false, level: 0 }], required: 2, risk, explored: new Set(['src/x.js']), flaky: ['lint'] });
    assert.equal(r.go, false);
    assert.deepEqual(r.stop, ['critical bug B1 is reported: a', 'P1 closed at L1, the project requires L2', 'high-risk src/auth.js changed, no test reaches it and no charter explored it']);
    assert.equal(r.warn.length, 4);
    assert.deepEqual(r.counts, { blocker: 0, critical: 1, major: 0, minor: 1, trivial: 0 });
    assert.equal(readiness({ bugs: [bugs[2]], items: [{ item: 'P1', closed: true, level: 2 }], required: 2 }).go, true);
});

test('charter: a time box with a mission; closing it records what was covered and whether it overran', () => {
    assert.throws(() => newCharter({ id: 'C1', mission: 'x', minutes: 600 }), /time-boxed/);
    const c = newCharter({ id: 'C1', mission: 'explore the cart with rounding prices to discover wrong totals', areas: ['src/price.js'], minutes: 60 });
    const done = closeCharter(c, { minutes: 100, bugs: ['B1'] });
    assert.deepEqual([done.status, done.covered, done.overrun], ['closed', ['src/price.js'], true]);
});

test('cli: a bug found in closed work is an escape of its item — trust and the skill report learn from what testers find', () => {
    const root = tmp();
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal', dirs: ['src', 'test'], govern: { required: 0 } }));
    write(root, 'src/price.js', 'export const total = (p, q) => p;\n');
    gitInit(root);
    const s = story();
    s.item('P1');
    fs.mkdirSync(path.join(root, '.facet', 'journal'), { recursive: true });
    fs.writeFileSync(path.join(root, '.facet', 'journal', 'old.jsonl'), '');
    const f = (...args) => spawnSync('node', [CLI, ...args], { cwd: root, encoding: 'utf-8', env: { ...process.env, FACET_WRITER: 'ann' } });
    // close an item through the journal so the bug can name it
    for (const e of s.events) spawnSync('node', ['-e', `import(${JSON.stringify(pathToFileURL(path.join(path.dirname(CLI), '..', 'lib', 'journal.mjs')).href)}).then(m=>m.record(${JSON.stringify(path.join(root, '.facet', 'journal'))}, ${JSON.stringify(e)}, { writer: 'ann' }))`], { encoding: 'utf-8' });
    const out = f('qa', 'bug', 'new', 'BUG-1', '--title', 'total ignores quantity', '--repro', "node -e \"import('./src/price.js').then(m=>process.exit(m.total(2,3)===6?0:1))\"", '--expect', 'price times quantity', '--severity', 'critical', '--item', 'P1', '--area', 'src/price.js', '--mode', 'spec-gap');
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /BUG-1 reported \(critical\) as an escape of P1/);
    const ev = readJournal(path.join(root, '.facet', 'journal'));
    assert.deepEqual(ev.filter((e) => e.kind === 'escape').map((e) => [e.item, e.bug, e.mode]), [['P1', 'BUG-1', 'spec-gap']]);
    assert.match(f('trust').stdout, /defects found after closing: 1 of 1/);
    assert.match(f('qa', 'bug', 'verify', 'BUG-1').stdout, /fails 3\/3 times → reproduced/);
    assert.match(f('qa', 'plan', 'src/price.js').stdout, /1 escaped defect/);
    const ready = f('qa', 'readiness');
    assert.equal(ready.status, 1);
    assert.match(ready.stdout, /NO-GO.*\n.*critical bug BUG-1 is reproduced/);
    write(root, 'src/price.js', 'export const total = (p, q) => p * q;\n');
    assert.match(f('qa', 'bug', 'verify', 'BUG-1').stdout, /passes 3\/3 times → fixed \(a test that names the bug is still missing\)/);
    write(root, 'test/price.test.js', "// BUG-1\nimport '../src/price.js';\n");
    assert.match(f('qa', 'bug', 'verify', 'BUG-1').stdout, /→ verified · regression test: test\/price\.test\.js/);
    assert.match(f('qa', 'bug', 'list').stdout, /no open bugs/);
    assert.match(f('qa', 'readiness', '--html', 'ready.html').stdout, /^written: ready\.html\nGO/);
});

test('decide: an architecture decision carries the measures that must keep holding; a failed measure sends it to review', () => {
    const root = tmp();
    write(root, 'facet.json', JSON.stringify({ dirs: ['src'], fitness: [{ id: 'ui-not-server', kind: 'no-import', from: 'src/ui/**', to: 'src/server/**' }] }));
    write(root, 'src/ui/a.js', 'export const a = 1;\n');
    write(root, 'src/server/db.js', 'export const db = 1;\n');
    write(root, 'size.sh', 'echo 120 kB\n');
    gitInit(root);
    const f = (...args) => spawnSync('node', [CLI, ...args], { cwd: root, encoding: 'utf-8' });
    assert.match(f('decide', 'new', 'ADR-1', '--title', 'UI never talks to the database', '--decision', 'all data goes through the API').stderr, /at least one measure/);
    assert.equal(f('decide', 'new', 'ADR-1', '--title', 'UI never talks to the database', '--decision', 'all data goes through the API', '--fitness', 'ui-not-server', '--rejected', 'direct queries from the UI').status, 0);
    assert.equal(f('decide', 'new', 'ADR-2', '--title', 'Small first load', '--decision', 'three.js loads lazily', '--measure', 'sh size.sh', '--max', '150').status, 0);
    assert.ok(fs.readFileSync(path.join(root, 'docs', 'decisions', 'ADR-1.md'), 'utf-8').includes('fitness rule `ui-not-server` stays clean'));
    let out = f('decide', 'check');
    assert.equal(out.status, 0, out.stdout);
    assert.match(out.stdout, /ADR-1 HOLDING.*\n.*✓ fitness ui-not-server — clean\nADR-2 HOLDING.*\n.*✓ sh size.sh — 120 \(max 150\)/);
    write(root, 'src/ui/a.js', "import { db } from '../server/db.js';\n");
    write(root, 'size.sh', 'echo 180 kB\n');
    out = f('decide', 'check');
    assert.equal(out.status, 1);
    assert.match(out.stdout, /ADR-1 REVIEW .*\n.*✗ fitness ui-not-server — 1 new violation/);
    assert.match(out.stdout, /✗ sh size.sh — 180 \(max 150\)/);
});
