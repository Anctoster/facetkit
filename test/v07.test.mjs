// 0.7: authorship, independent witnesses, environment, the handoff check, adaptive routes, fitness
// rules, explanations, counterfactual pairs, knowledge across projects, the item as the unit.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { adapt, applyAdaptations } from '../lib/adapt.mjs';
import { cfReport, signTest } from '../lib/counterfactual.mjs';
import { exportKnowledge, importLessons, pool } from '../lib/crosslearn.mjs';
import { environment, environmentDiff } from '../lib/envinfo.mjs';
import { explain, explainHtml } from '../lib/explain.mjs';
import { checkFitness } from '../lib/fitness.mjs';
import { DEFAULT_FLOW, itemState } from '../lib/flow.mjs';
import { checkHandoff } from '../lib/handoff.mjs';
import { armOfUnit, clusterByItem, newDesign } from '../lib/intelligence.mjs';
import { readJournal } from '../lib/journal.mjs';
import { planRoute } from '../lib/planner.mjs';
import { buildGraph } from '../lib/seams.mjs';
import { addTrust, judgeSignatures, loadTrust, newKey, sign, verify } from '../lib/sign.mjs';
import { gitInit, story, tmp, write } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');
const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('sign: a signature belongs to one key and one digest; a project trusts keys by role; a forged id is dropped', () => {
    const a = newKey();
    const b = newKey();
    const s = sign(a, 'digest-1');
    assert.equal(verify(a.pub, 'digest-1', s.sig), true);
    assert.equal(verify(a.pub, 'digest-2', s.sig), false, 'the signature does not travel to another digest');
    assert.equal(verify(b.pub, 'digest-1', s.sig), false);
    const root = tmp();
    addTrust(root, { pub: a.pub, name: 'ann', role: 'witness' });
    const file = path.join(root, '.facet', 'trust.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    data.keys.push({ ...data.keys[0], name: 'mallory', pub: b.pub }); // claims ann's id for another key
    fs.writeFileSync(file, JSON.stringify(data));
    const t = loadTrust(root);
    assert.deepEqual([t.keys.length, t.forged], [1, [a.id]]);
    assert.deepEqual(judgeSignatures('digest-1', [s], t), { rows: [{ key: a.id, state: 'trusted', name: 'ann', role: 'witness' }], trusted: 1, bad: 0, authentic: true, by: ['ann (witness)'] });
    assert.equal(judgeSignatures('digest-1', [s], t, { roles: ['releaser'] }).authentic, false, 'a key is trusted for a role');
    assert.equal(judgeSignatures('digest-9', [s], t).bad, 1);
});

test('environment: recorded without secrets; comparable across machines that run the same tools on the same dependencies', () => {
    process.env.FACET_KEY = '/secret/path/key.pem';
    const e = environment(KIT, { tools: false, kit: '0.7.0' });
    delete process.env.FACET_KEY;
    assert.ok(e.variablesSet.includes('FACET_KEY') && !JSON.stringify(e).includes('/secret/path'), 'names of variables, never values');
    assert.ok(e.locks['package-lock.json'] === undefined || typeof e.locks['package-lock.json'] === 'string');
    const other = { ...e, memoryGb: e.memoryGb + 64, cpus: e.cpus * 2 };
    assert.deepEqual(environmentDiff(e, other), [], 'more memory does not make a result incomparable');
    assert.deepEqual(environmentDiff(e, { ...e, node: '18.0.0', locks: { 'package-lock.json': 'x' } }), [`node: ${e.node.split('.')[0]} → 18`, `dependencies (package-lock.json): ${e.locks['package-lock.json'] ?? 'none'} → x`]);
});

test('proof: signed by a trusted key; an edited and re-digested pack is TAMPERED; unsigned packs are refused where signatures are required; a witness that disagrees makes it a MISMATCH', () => {
    const root = tmp();
    const keys = path.join(tmp(), 'keys');
    const env = { ...process.env, FACET_KEYS: keys, FACET_WRITER: 'ann' };
    const cfg = (extra = {}) => write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal', govern: { checks: { truth: 'test ! -f flag' }, ...extra } }));
    cfg();
    write(root, '.gitignore', 'flag\n');
    write(root, 'facet.items.json', '{}');
    write(root, 'src/a.txt', 'one\n');
    gitInit(root);
    const f = (...args) => spawnSync('node', [CLI, ...args], { cwd: root, encoding: 'utf-8', env });
    assert.match(f('key', 'new').stdout, /key \w+ written/);
    assert.match(f('key', 'trust', '--name', 'ann', '--role', 'witness').stdout, /trusted: \w+ as ann \(witness\)/);
    f('flow', 'open', 'A', '--route', '', '--force');
    for (const step of ['open', 'map', 'red', 'build', 'proof']) {
        f('flow', 'start', step);
        f('flow', 'end', step, '--status', 'DONE', '--force');
    }
    assert.equal(f('check', 'truth').status, 0);
    assert.equal(f('proof', 'create').status, 0);
    const file = path.join(root, '.work', 'A', 'proof', 'manifest.json');
    const m = JSON.parse(fs.readFileSync(file, 'utf-8'));
    assert.equal(m.signatures.length, 1);
    assert.ok(m.environment?.comparable && m.environment.node === process.versions.node);
    assert.match(f('proof', 'verify').stdout, /signed by ann \(witness\)/);
    // a forger edits the claim and recomputes the digest: the signature no longer matches
    const forged = { ...m, level: 'L4 calibrated' };
    import('../lib/proof.mjs').then(() => undefined);
    fs.writeFileSync(file, JSON.stringify({ ...forged, digest: undefined }));
    return import('../lib/proof.mjs').then(({ proofDigest }) => {
        fs.writeFileSync(file, JSON.stringify({ ...forged, digest: proofDigest(forged) }));
        const out = f('proof', 'verify');
        assert.equal(out.status, 1);
        assert.match(out.stdout, /TAMPERED/);
        fs.writeFileSync(file, JSON.stringify({ ...forged, digest: proofDigest(forged), signatures: [] }));
        cfg({ requireSignature: true });
        assert.match(f('proof', 'verify').stdout, /UNSIGNED/);
        // an honest pack, witnessed: the second run agrees; then something the check reads, and the sources do not hold, changes
        cfg();
        fs.writeFileSync(file, JSON.stringify(m));
        assert.match(f('proof', 'witness').stdout, /witness: 1\/1 checks gave the recorded answer/);
        assert.match(f('proof', 'verify').stdout, /reproduced by a second run on the same sources/);
        write(root, 'flag', 'set\n');
        const w = f('proof', 'witness');
        assert.match(w.stdout, /differs: truth/);
        assert.match(w.stdout, /MISMATCH/);
    });
});

test('handoff: missing section, empty section, evidence without an exit code, a changed file not listed, an anchor that drifted', () => {
    const root = tmp();
    write(root, 'src/a.js', 'one\ntwo\nthree\n');
    const tpl = fs.readFileSync(path.join(KIT, 'templates', 'build.md'), 'utf-8');
    const good = ['# T1 — build report', '## Slices', '| 1 | done | tests green |', '## Numbers', 'none', '## Outside the map', 'none', '## Not verified', 'none', '## Commit message', 'feat: x', '## Evidence', '$ npm test → exit 0', '## Files changed', '- src/a.js'].join('\n');
    assert.deepEqual(checkHandoff(good, tpl, { root, changed: ['src/a.js'] }), []);
    const bad = good.replace('## Numbers\nnone\n', '').replace('$ npm test → exit 0', 'tests pass').replace('## Not verified\nnone', '## Not verified\n…') + '\nSee `src/a.js:1-2#deadbeef`.';
    const kinds = checkHandoff(bad, tpl, { root, changed: ['src/a.js', 'src/b.js'] }).map((p) => p.kind);
    assert.deepEqual(kinds, ['missing-section', 'unlisted-file', 'stale-anchor', 'no-evidence', 'empty-section']);
});

test('cli: a step whose handoff is not whole does not end DONE; the problems go back to its author at once', () => {
    const root = tmp();
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal' }));
    write(root, 'facet.items.json', JSON.stringify({ items: { A: { deps: [], route: [], gates: [] } } }));
    write(root, 'src/a.js', 'x\n');
    gitInit(root);
    const f = (...args) => spawnSync('node', [CLI, ...args], { cwd: root, encoding: 'utf-8', env: { ...process.env, FACET_WRITER: 'ann' } });
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal', routing: 'facet.items.json' }));
    f('flow', 'open', 'A');
    f('flow', 'start', 'open');
    write(root, '.work/A/order.md', '# A — work order\n## Inputs\n- request: issue 1\n');
    const refused = f('flow', 'end', 'open', '--status', 'DONE');
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /missing-section +## Done when/);
    assert.match(refused.stderr, /not DONE until its handoff is whole/);
    write(root, '.work/A/order.md', '# A — work order\n## Inputs\n- request: issue 1\n## Done when\n- a\n## Stop conditions\n- none\n## Budget\n- caps.json\n## Evidence\n$ git status → exit 0\n## Files changed\n- none\n');
    assert.equal(f('flow', 'end', 'open', '--status', 'DONE', '--tokens', '10').status, 0);
    const ev = readJournal(path.join(root, '.facet', 'journal')).filter((e) => e.kind === 'evidence' && e.name === 'handoff');
    assert.deepEqual(ev.map((e) => e.ok), [false, true]);
});

test('adapt: a security file in the change grows the route and locks its gate; a recurring cause reinforces the next agent; a weak record escalates its model; nothing is ever removed', () => {
    const root = tmp();
    write(root, 'src/auth/session.js', 'export const s = 1;\n');
    write(root, 'src/a.js', "import { s } from './auth/session.js';\n");
    const graph = buildGraph(root, ['src']);
    const plan = planRoute(['src/auth/session.js'], { graph, flow: DEFAULT_FLOW });
    const s = story();
    const steps = [{ id: 'open', agent: 'route-conductor', phase: 'open' }, { id: 'map', agent: 'context-cartographer', phase: 'map' }, { id: 'red', agent: 'red-first-specifier', phase: 'red' }, { id: 'build', agent: 'slice-builder', phase: 'build' }, { id: 'gates', gates: true, agents: ['code-reviewer'] }, { id: 'proof', agent: 'proof-inspector', phase: 'proof', verdict: true }];
    for (const i of ['P1', 'P2', 'P3', 'P4', 'P5']) { // slice-builder on haiku, sent back for the same cause again and again
        s.open(i, steps);
        s.run(i, 'build', 'slice-builder', { model: 'haiku' });
        s.say({ kind: 'verdict', item: i, verdict: 'REWORK', fixes: [{ agent: 'slice-builder', mode: 'stale-handoff' }] });
        s.say({ kind: 'verdict', item: i, verdict: 'PASS', fixes: [] });
        s.say({ kind: 'item.close', item: i });
    }
    s.open('A', steps);
    s.run('A', 'open', 'route-conductor');
    s.run('A', 'map', 'context-cartographer');
    s.run('A', 'red', 'red-first-specifier');
    let state = itemState(s.events, 'A');
    state.steps.find((x) => x.id === 'build').model = 'haiku';
    const facets = [{ ref: 'anchored-handoff:verify-on-read', guards: ['stale-handoff'] }, { ref: 'x:other', guards: ['spec-gap'] }];
    const found = adapt({ state, flow: DEFAULT_FLOW, plan, events: s.events, facets, loadoutOf: () => [] });
    const ops = found.map((a) => `${a.op}:${a.step}${a.agents ? `:${a.agents}` : ''}${a.facets ? `:${a.facets}` : ''}${a.model ? `:${a.model}` : ''}`);
    assert.ok(ops.includes('insert:design') && ops.includes('insert:spec'), ops.join(' '));
    assert.ok(ops.includes('gates:gates:security-auditor'));
    assert.ok(ops.includes('reinforce:build:anchored-handoff:verify-on-read'));
    assert.ok(ops.includes('model:build:sonnet'));
    for (const a of found) s.say({ kind: 'route.adapt', item: 'A', ...a });
    state = itemState(s.events, 'A');
    assert.deepEqual(state.steps.map((x) => x.id), ['open', 'map', 'red', 'design', 'spec', 'build', 'gates', 'proof'], 'new steps go before the first step that is not done yet');
    assert.deepEqual(state.steps.find((x) => x.id === 'gates').agents, ['code-reviewer', 'security-auditor']);
    assert.ok(state.steps.length >= steps.length, 'adapting never removes a step');
    assert.deepEqual(adapt({ state, flow: DEFAULT_FLOW, plan, events: s.events, facets, loadoutOf: () => [] }), [], 'each adaptation is made once');
    assert.equal(applyAdaptations(steps, [{ op: 'insert', step: 'map', before: 'red', def: {} }]).length, steps.length, 'a step that exists is not inserted again');
});

test('fitness: forbidden imports, layers, cycles, size and untested modules — as a ratchet', () => {
    const root = tmp();
    write(root, 'src/ui/page.js', "import { db } from '../server/db.js';\nimport { f } from '../lib/f.js';\n");
    write(root, 'src/lib/f.js', "import { p } from '../ui/page.js';\nexport const f = 1;\n");
    write(root, 'src/server/db.js', 'export const db = 1;\n'.repeat(12));
    write(root, 'test/f.test.js', "import { f } from '../src/lib/f.js';\n");
    const graph = buildGraph(root, ['src', 'test']);
    const rules = [{ id: 'ui-no-server', kind: 'no-import', from: 'src/ui/**', to: 'src/server/**' }, { id: 'layers', kind: 'layers', order: ['src/ui/**', 'src/lib/**'] }, { id: 'acyclic', kind: 'no-cycle', within: 'src/**' }, { id: 'small', kind: 'max-lines', files: 'src/**', max: 10 }, { id: 'tested', kind: 'tested', files: 'src/server/**' }];
    const isTest = (f) => f.startsWith('test/');
    const r = checkFitness(rules, { graph, root, isTest });
    assert.deepEqual(r.rows.map((x) => [x.id, x.violations]), [['ui-no-server', 1], ['layers', 1], ['acyclic', 1], ['small', 1], ['tested', 1]]);
    const again = checkFitness(rules, { graph, root, isTest, baseline: r.keys });
    assert.deepEqual([again.fresh.length, again.held.length], [0, 5], 'yesterday’s violations do not fail today');
    write(root, 'src/lib/g.js', "import { db } from '../server/db.js';\nimport { f } from './f.js';\nimport { g } from './g.js';\n");
    const worse = checkFitness([...rules, { id: 'lib-no-server', kind: 'no-import', from: 'src/lib/**', to: 'src/server/**' }], { graph: buildGraph(root, ['src', 'test']), root, isTest, baseline: r.keys });
    assert.deepEqual(worse.fresh.map((v) => v.rule), ['lib-no-server', 'tested'].filter((x) => worse.fresh.some((v) => v.rule === x)));
    assert.ok(worse.fresh.length >= 1);
});

test('explain: one record, four readers — the client gets words, the lead gets causes, the auditor gets rules, the developer gets the next command', () => {
    const s = story();
    s.item('A', { blame: 'builder' });
    s.events.at(-3).fixes = [{ agent: 'builder', mode: 'stale-handoff' }];
    const e = s.events.find((x) => x.kind === 'verdict' && x.verdict === 'REWORK');
    e.fixes = [{ agent: 'builder', mode: 'stale-handoff' }];
    s.say({ kind: 'evidence', item: 'A', name: 'scan', ok: true });
    s.open('B', [{ id: 'map', agent: 'mapper' }]);
    const titles = { A: 'Faster first paint', B: 'SEO metadata' };
    const client = explain(s.events, 'client', { titles, project: { journalIntact: true } }).text;
    assert.match(client, /\*\*A — Faster first paint\*\*: done\. How sure we are: checked again by someone who did not do the work/);
    assert.match(client, /\*\*B — SEO metadata\*\*: in progress/);
    assert.doesNotMatch(client, /L[0-4] |facet |journal/i, 'no jargon for the client');
    assert.match(explain(s.events, 'lead', { titles }).text, /- stale-handoff: 1/);
    assert.match(explain(s.events, 'client', { titles, lang: 'pl' }).text, /^# Stan prac\n\nUkończone: 1, w toku: 1\./);
    assert.match(explain(s.events, 'client', { titles, lang: 'ru' }).text, /\*\*B — SEO metadata\*\*: в работе/);
    assert.match(explainHtml('# x', { lang: 'pl' }), /<html lang="pl">/);
    assert.match(explain(s.events, 'auditor', { titles, project: { journalIntact: true } }).text, /Journal intact: yes/);
    assert.match(explain(s.events, 'dev', { titles, next: 'CALL mapper' }).text, /CALL mapper/);
    const html = explainHtml(client, { title: 'x' });
    assert.ok(html.startsWith('<!doctype html>') && html.includes('<li><b>A — Faster first paint</b>') && !/<script/.test(html));
});

test('counterfactual: paired replays of one snapshot — with and without the rule — decided by a sign test', () => {
    assert.equal(signTest(8, 0), 0.0078);
    assert.equal(signTest(4, 4), 1);
    const s = story();
    for (let i = 0; i < 7; i++) {
        s.say({ kind: 'cf', facet: 'x:rule', item: `P${i}`, step: 'build', model: 'sonnet', arm: 'with', passed: 5, total: 5 });
        s.say({ kind: 'cf', facet: 'x:rule', item: `P${i}`, step: 'build', model: 'sonnet', arm: 'without', passed: i < 6 ? 3 : 5, total: 5 });
    }
    s.say({ kind: 'cf', facet: 'x:lonely', item: 'P0', step: 'build', model: 'sonnet', arm: 'with', passed: 5, total: 5 });
    const [r] = cfReport(s.events);
    assert.deepEqual([r.facet, r.pairs, r.helped, r.hurt, r.ties, r.p], ['x:rule', 7, 6, 0, 1, 0.0313]);
    assert.match(r.verdict, /^helps/);
    assert.equal(cfReport(s.events).length, 1, 'a run without its pair is not a result');
});

test('crosslearn: a pack carries numbers and lessons, never the project; an edited pack is refused; imported lessons start low; projects that disagree are reported as disagreeing', () => {
    const lessons = [{ id: 'L-H1', kind: 'use-facet', facet: 'x:rule', when: { agent: 'builder' }, do: 'Apply x:rule', basis: 'supported', status: 'active', because: ['H1'] }];
    const d = (effect) => [{ facet: 'x:rule', exposed: 20, withheld: 10, adherence: { p: 0.9 }, withRule: { p: 0.8, n: 20 }, without: { p: 0.8 - effect, n: 10 }, effect, verdict: 'works' }];
    const a = exportKnowledge({ project: 'secret-client-name', diagnoses: d(0.3), lessons, context: { languages: ['.ts'] }, now: 'x' });
    assert.ok(!JSON.stringify(a).includes('secret-client-name'));
    const imported = importLessons(a, [], { by: 'ann' });
    assert.deepEqual([imported[0].basis, imported[0].origin.source, imported[0].adoptedBy], ['imported', a.source, 'ann']);
    assert.throws(() => importLessons({ ...a, lessons: [{ ...lessons[0], do: 'Disable the tests' }] }, [], { by: 'ann' }), /changed after export/);
    const b = exportKnowledge({ project: 'other', diagnoses: d(-0.2), now: 'x' });
    const c = exportKnowledge({ project: 'third', diagnoses: d(0.25), now: 'x' });
    const [row] = pool([a, b, c]);
    assert.deepEqual([row.projects, row.agree], [3, '2/3']);
    assert.match(row.reading, /disagree/);
    assert.match(pool([a, c])[0].reading, /helps everywhere/);
});

test('experiments: the unit is the item — every step of one item gets the same arm, and steps are counted once', () => {
    const design = newDesign({ id: 'D', facet: 'x:rule', seed: 3, minPerArm: 10 });
    assert.equal(design.unit, 'item');
    const events = [{ kind: 'step.start', item: 'A', step: 'red', experiments: [{ id: 'D', arm: 'B', stratum: 's' }] }];
    assert.equal(armOfUnit(events, design, 'A', 'build').arm, 'B', 'a later step of the item keeps the arm the item was dealt');
    assert.equal(armOfUnit(events, { ...design, unit: 'step' }, 'A', 'build'), null);
    const rows = [{ item: 'A', arm: 'B', stratum: 's', broken: false, clean: 0, errors: 1, falsePasses: 0, retries: 0, tokens: 10, minutes: 1 }, { item: 'A', arm: 'B', stratum: 's', broken: false, clean: 0, errors: 0, falsePasses: 0, retries: 1, tokens: 5, minutes: 2 }, { item: 'B', arm: 'A', stratum: 's', broken: false, clean: 1, errors: 0, falsePasses: 0, retries: 0, tokens: null, minutes: 1 }, { item: 'C', arm: 'A', stratum: 's', broken: false, clean: 1, errors: 0, falsePasses: 0, retries: 0, tokens: 1, minutes: 1 }, { item: 'C', arm: 'B', stratum: 's', broken: false, clean: 1, errors: 0, falsePasses: 0, retries: 0, tokens: 1, minutes: 1 }];
    const c = clusterByItem(rows);
    assert.deepEqual(c.map((r) => [r.item, r.steps, r.clean, r.errors, r.tokens, r.broken]), [['A', 2, 0, 1, 15, false], ['B', 1, 1, 0, null, false], ['C', 2, 1, 0, 2, true]]);
});

test('journal: events signed by a trusted key; an event rewritten with a fresh id and chain is caught by its signature', async () => {
    const { record, setSigner, verifyJournal, readJournal: read } = await import('../lib/journal.mjs');
    const { eventSigner, eventVerifiers } = await import('../lib/sign.mjs');
    const { sha } = await import('../lib/text.mjs');
    const k = newKey();
    const keys = eventVerifiers({ keys: [{ id: k.id, pub: k.pub }] });
    const file = path.join(tmp(), 'j.jsonl');
    setSigner(eventSigner(k));
    try {
        record(file, { kind: 'note', text: 'one' });
        record(file, { kind: 'note', text: 'two' });
    } finally {
        setSigner(null);
    }
    assert.deepEqual([verifyJournal(file, { keys }).intact, verifyJournal(file, { keys }).signatures.signed], [true, 2]);
    // the forger edits the second event and recomputes its id and the chain — everything but the signature
    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
    const e = JSON.parse(lines[1]);
    const { id: _id, sg, ...rest } = e;
    const edited = { ...rest, text: 'two (edited)' };
    const fresh = { ...edited, id: sha(JSON.stringify(edited), 12), sg };
    fs.writeFileSync(file, `${lines[0]}\n${JSON.stringify({ ...fresh, prev: sha(lines[0]) })}\n`);
    const v = verifyJournal(file, { keys });
    assert.deepEqual([v.signatures.bad, v.intact, v.status], [1, false, 'tampered']);
    assert.equal(read(file)[1].text, 'two (edited)', 'the edit is readable — and reported');
});

test('two-arm experiments: new manifests deal one arm per item; manifests from before 0.7 keep the step', async () => {
    const { assign, newExperiment, unitOf } = await import('../lib/experiments.mjs');
    const m = newExperiment({ id: 'E', facet: 'x:rule', seed: 1, now: 'x' });
    assert.equal(m.unit, 'item');
    assert.equal(unitOf('P1', 'red', m), unitOf('P1', 'build', m));
    assert.equal(assign(m, unitOf('P1', 'red', m)), assign(m, unitOf('P1', 'build', m)));
    const old = { ...m, unit: undefined };
    assert.equal(unitOf('P1', 'red', old), 'P1|red');
});
