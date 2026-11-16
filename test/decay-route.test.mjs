import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FLOW } from '../lib/flow.mjs';
import { evaluate } from '../lib/govern.mjs';
import { classify, discover, planRoute, stepsOf } from '../lib/planner.mjs';
import { decay, fileHashes, importClosure, scopesNow } from '../lib/proof.mjs';
import { buildGraph } from '../lib/seams.mjs';
import { gitInit, story, tmp, write } from './helpers.mjs';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');
function project() {
    const root = tmp();
    write(root, 'src/core.mjs', 'export const core = () => 1;\n');
    write(root, 'src/api.mjs', "import { core } from './core.mjs';\nexport const api = () => core();\n");
    write(root, 'src/ui.mjs', "import { api } from './api.mjs';\nexport const ui = () => api();\n");
    write(root, 'src/auth/login.mjs', "import { api } from '../api.mjs';\nexport const login = () => api();\n");
    write(root, 'src/lonely.mjs', 'export const lonely = 1;\n');
    write(root, 'test/api.test.mjs', "import { api } from '../src/api.mjs';\napi();\n");
    write(root, 'docs/guide.md', '# guide\n');
    write(root, 'styles/site.css', 'a{}\n');
    write(root, 'package.json', JSON.stringify({ name: 'p', version: '1.0.0', facetkit: { dirs: ['src', 'test'], govern: { checks: { unit: { run: 'node test/api.test.mjs', covers: ['test/**'] }, lint: { run: 'node -e 0', covers: ['src/ui.mjs'] } } } } }));
    return root;
}
const scopesOf = (root) => scopesNow(fileHashes(root), { unit: ['test/**'], lint: ['src/ui.mjs'], docs: ['docs/**'], all: ['**'] }, buildGraph(root, ['src', 'test']));

test('decay: a check stands for the files it covers and everything they import — and for nothing else', () => {
    const root = project();
    const graph = buildGraph(root, ['src', 'test']);
    assert.deepEqual([...importClosure(graph, ['test/api.test.mjs'])].sort(), ['src/api.mjs', 'src/core.mjs', 'test/api.test.mjs']);
    const before = scopesOf(root);
    assert.deepEqual(before.unit.list, ['src/api.mjs', 'src/core.mjs', 'test/api.test.mjs']);
    write(root, 'docs/guide.md', '# guide, edited\n');
    let now = scopesOf(root);
    assert.equal(now.unit.digest, before.unit.digest, 'documentation does not touch the unit tests');
    assert.equal(now.lint.digest, before.lint.digest);
    assert.notEqual(now.docs.digest, before.docs.digest);
    assert.notEqual(now.all.digest, before.all.digest, 'a check without a declared scope decays on any change');
    write(root, 'src/core.mjs', 'export const core = () => 2;\n');
    now = scopesOf(root);
    assert.notEqual(now.unit.digest, before.unit.digest, 'a dependency two imports away is inside the scope');
    assert.notEqual(now.lint.digest, before.lint.digest, 'ui imports api imports core');
    write(root, 'src/api.mjs', "import { core } from './core.mjs';\nimport { lonely } from './lonely.mjs';\nexport const api = () => core() + lonely;\n");
    assert.ok(scopesOf(root).unit.list.includes('src/lonely.mjs'), 'a new import widens the scope');
});

test('decay: only the evidence a change reaches goes stale; an uncovered change is named as a blind spot', () => {
    const root = project();
    const h0 = fileHashes(root);
    const s0 = scopesOf(root);
    const snap = Object.fromEntries(h0);
    const s = story();
    s.open('A', [{ id: 'build', agent: 'builder', phase: 'build' }, { id: 'proof', agent: 'inspector', phase: 'proof', verdict: true }]);
    s.run('A', 'build', 'builder');
    for (const name of ['unit', 'lint']) s.say({ kind: 'evidence', item: 'A', name, ok: true, src: 's0', scope: { digest: s0[name].digest, files: s0[name].files } });
    s.say({ kind: 'evidence', item: 'A', name: 'old', ok: true });
    const look = () => {
        const sc = scopesOf(root);
        return { d: decay(s.events, 'A', { hashes: fileHashes(root), scopes: { unit: sc.unit, lint: sc.lint, old: sc.all }, snapshotOf: () => snap }), digests: { unit: sc.unit.digest, lint: sc.lint.digest } };
    };
    assert.deepEqual(look().d.rerun, ['old'], 'evidence recorded without a scope cannot be shown to hold');
    write(root, 'src/ui.mjs', "import { api } from './api.mjs';\nexport const ui = () => api() + 1;\n");
    write(root, 'styles/site.css', 'a{color:red}\n');
    const { d, digests } = look();
    assert.deepEqual(Object.fromEntries(d.rows.map((r) => [r.name, r.state])), { unit: 'fresh', lint: 'decayed', old: 'unbound' });
    assert.deepEqual(d.rows.find((r) => r.name === 'lint').changed, ['src/ui.mjs']);
    assert.deepEqual(d.uncovered, ['styles/site.css']);
    const ev = evaluate(s.events, 'A', { project: { journalIntact: true }, source: 'another-state', scopes: digests }).evidence;
    assert.equal(ev.unit.stale, false, 'the whole tree moved, the scope of the unit tests did not');
    assert.equal(ev.lint.stale, true);
});

test('facet check --stale runs only what the change touches; facet proof names DECAYED and what to run', () => {
    const root = project();
    gitInit(root);
    const facet = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf-8' });
    assert.equal(facet('flow', 'open', 'P1').status, 0);
    assert.equal(facet('check').status, 0);
    assert.equal(facet('proof', 'create', '--item', 'P1').status, 0);
    assert.match(facet('check', '--stale').stdout, /nothing to run/);
    write(root, 'docs/guide.md', '# guide, edited\n');
    assert.match(facet('check', '--stale').stdout, /nothing to run/, 'documentation is in no scope');
    const still = facet('proof', 'verify', '--item', 'P1');
    assert.equal(still.status, 0, still.stdout);
    assert.match(still.stdout, /no check covers what changed/);
    assert.match(facet('proof', 'decay', '--item', 'P1').stdout, /docs\/guide\.md changed and no check covers it/);
    write(root, 'src/ui.mjs', "import { api } from './api.mjs';\nexport const ui = () => api() + 2;\n");
    const decayed = facet('proof', 'verify', '--item', 'P1');
    assert.equal(decayed.status, 1);
    assert.match(decayed.stdout, /DECAYED[\s\S]*run again: lint/);
    const rerun = facet('check', '--stale');
    assert.match(rerun.stdout, /running only what changed sources touch: lint\n/);
    assert.doesNotMatch(rerun.stdout, /unit/);
    assert.match(facet('proof', 'decay', '--item', 'P1').stdout, /trust 100%/);
});

// ---- routing --------------------------------------------------------------------------------
const OWNERS = { owners: { 'src/**': 'slice-builder', 'src/auth/**': 'security-owner', 'test/**': 'spec-falsifier', 'docs/**': 'release-pilot', 'styles/**': 'slice-builder' }, shared: ['package.json'] };
// what each kind of task needs, as the team's rules state it — written down before the planner is asked
const SCENARIOS = [
    { name: 'documentation only', files: ['docs/guide.md'], must: [], mustNot: ['blueprint-architect', 'spec-falsifier', 'release-pilot', 'security-auditor'] },
    { name: 'style only', files: ['styles/site.css'], must: [], mustNot: ['spec-falsifier', 'blueprint-architect', 'security-auditor'] },
    { name: 'authorisation', files: ['src/auth/login.mjs'], must: ['security-auditor', 'spec-falsifier'], mustNot: [] },
    { name: 'public module others depend on', files: ['src/core.mjs'], must: ['spec-falsifier'], mustNot: ['security-auditor'] },
    { name: 'leaf module nobody imports', files: ['src/lonely.mjs'], must: [], mustNot: ['blueprint-architect', 'security-auditor', 'release-pilot'] },
    { name: 'docs and auth together', files: ['docs/guide.md', 'src/auth/login.mjs'], must: ['security-auditor'], mustNot: [] },
    { name: 'tests only', files: ['test/api.test.mjs'], must: [], mustNot: ['blueprint-architect', 'security-auditor'] },
];
const agentsOf = (plan) => new Set(stepsOf(DEFAULT_FLOW, plan).flatMap((s) => (s.gates ? s.agents : s.agent ? [s.agent] : [])));
const calls = (plan) => stepsOf(DEFAULT_FLOW, plan).reduce((n, s) => n + (s.gates ? s.agents.length : s.agent ? 1 : 0), 0);

test('route: three strategies on the same scenarios — only the adaptive one misses nothing and wastes least', () => {
    const root = project();
    const graph = buildGraph(root, ['src', 'test']);
    const score = (strategy) => {
        let missed = 0;
        let unwanted = 0;
        let total = 0;
        for (const sc of SCENARIOS) {
            const plan = planRoute(sc.files, { graph, owners: OWNERS, flow: DEFAULT_FLOW, strategy });
            const on = agentsOf(plan);
            missed += sc.must.filter((a) => !on.has(a)).length;
            unwanted += sc.mustNot.filter((a) => on.has(a)).length;
            total += calls(plan);
        }
        return { missed, unwanted, total };
    };
    const fixed = score('fixed');
    const byClass = score('by-class');
    const adaptive = score('adaptive');
    assert.equal(adaptive.missed, 0, 'no required agent is left out');
    assert.equal(adaptive.unwanted, 0, 'no agent the scenario rules out is called');
    assert.ok(byClass.missed > 0, 'without the dependency graph a widely used module looks like any other file');
    assert.ok(fixed.unwanted > 0 && fixed.total > adaptive.total, `the fixed route calls more (${fixed.total} vs ${adaptive.total})`);
    assert.ok(adaptive.total <= byClass.total + 2, 'the saving is not bought with longer routes elsewhere');
});

test('route: a security gate is locked — no route, gate or skip option removes it; the judge and the build are never skipped', () => {
    const root = project();
    const plan = planRoute(['src/auth/login.mjs'], { graph: buildGraph(root, ['src', 'test']), owners: OWNERS, flow: DEFAULT_FLOW });
    assert.equal(plan.risk.level, 'high');
    assert.deepEqual(plan.locked.map((g) => g.agent), ['security-auditor']);
    const bare = stepsOf(DEFAULT_FLOW, plan, { route: [], gates: [], skip: ['gates', 'proof', 'build', 'red', 'open', 'close'] });
    assert.deepEqual(bare.find((s) => s.gates).agents, ['security-auditor']);
    for (const id of ['open', 'build', 'proof', 'close']) assert.ok(bare.some((s) => s.id === id), `${id} cannot be skipped`);
    assert.ok(!bare.some((s) => s.id === 'red'));
    assert.equal(classify('src/Auth/Session.ts'), 'security');
    assert.equal(classify('docs/notes.md'), 'docs');
    assert.equal(classify('docs/site.css'), 'style');
});

test('route: responsibility is settled first — unowned files and double claims stop the plan; owners work in dependency order', () => {
    const root = project();
    const graph = buildGraph(root, ['src', 'test']);
    const noOwner = planRoute(['src/core.mjs', 'styles/site.css', 'README.md'], { graph, owners: { owners: { 'src/**': 'slice-builder' } }, flow: DEFAULT_FLOW });
    assert.equal(noOwner.ok, false);
    assert.deepEqual(noOwner.blockers, ['no owner: README.md', 'no owner: styles/site.css']);
    const clash = planRoute(['ab/x.mjs'], { graph, owners: { owners: { 'a*/x.mjs': 'one', 'ab/*.mjs': 'two' } }, flow: DEFAULT_FLOW });
    assert.match(clash.blockers[0], /claimed by one and two/);
    const two = planRoute(['src/auth/login.mjs', 'src/api.mjs'], { graph, owners: OWNERS, flow: DEFAULT_FLOW });
    assert.equal(two.ok, true);
    assert.deepEqual(two.owners.order, ['slice-builder', 'security-owner'], 'the owner of the imported module works before the owner of its consumer');
    assert.ok(two.route.includes('blueprint-architect'), 'two owners: the order of work is designed');
    assert.ok(two.dependents.includes('src/ui.mjs'));
    assert.deepEqual(planRoute(['src/core.mjs'], { graph, owners: OWNERS, flow: DEFAULT_FLOW }).neighbourTests, ['test/api.test.mjs']);
});

test('route: a task is turned into files only when it names them; otherwise candidates are offered, not assumed', () => {
    const files = ['src/core.mjs', 'src/auth/login.mjs', 'docs/guide.md', 'a/README.md', 'b/README.md'];
    assert.deepEqual(discover('fix the rounding in src/core.mjs', files).named, ['src/core.mjs']);
    assert.deepEqual(discover('fix the rounding in core.mjs.', files).named, ['src/core.mjs']);
    assert.deepEqual(discover('update README.md', files).named, [], 'a name that fits two files names neither');
    const vague = discover('users cannot login after the update', files);
    assert.equal(vague.certain, false);
    assert.equal(vague.candidates[0].file, 'src/auth/login.mjs');
});

test('facet route --apply: the plan becomes the route of the item, and flow open keeps the locked gate', () => {
    const root = project();
    write(root, 'owners.json', JSON.stringify(OWNERS));
    gitInit(root);
    const facet = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf-8' });
    const docs = facet('route', 'docs/guide.md', '--item', 'D1', '--apply');
    assert.equal(docs.status, 0, docs.stdout + docs.stderr);
    assert.match(docs.stdout, /without steps map, red, green/);
    assert.match(facet('flow', 'open', 'D1').stdout, /opened with 5 steps: open → build → proof → commit → close/);
    const auth = facet('route', 'src/auth/login.mjs', '--item', 'S1', '--apply');
    assert.match(auth.stdout, /locked gate security-auditor/);
    const routing = JSON.parse(fs.readFileSync(path.join(root, 'routing.json'), 'utf-8')).items;
    assert.deepEqual(routing.S1.locked, ['security-auditor']);
    assert.equal(routing.S1.difficulty, 'high');
    const opened = facet('flow', 'open', 'S1', '--gates', '', '--force');
    assert.match(opened.stdout, /security-auditor are locked by the route plan/);
    assert.match(opened.stdout, /gates → proof/);
    assert.equal(facet('route', 'README.md').status, 1, 'a file without an owner stops the plan');
});
