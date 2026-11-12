import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { compareModels, interval, judge, matrix, observations, replaySetup, snapshot } from '../lib/evalx.mjs';
import { beliefs, hindsight, proposals, reviewChanges, signals } from '../lib/retro.mjs';
import { calibrate, criticalPath, order, plan, sessionPlan } from '../lib/schedule.mjs';
import { gitInit, story, tmp, write } from './helpers.mjs';

const git = (root, ...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd: root, encoding: 'utf-8' });

test('eval: one observation per agent per closed item; rework counts against the agent it was addressed to', () => {
    const s = story();
    s.item('A', { score: { builder: 9 } });
    s.item('B', { blame: 'builder', score: { builder: 5 } });
    s.open('C', []); // open items are not observations
    const obs = observations(s.events);
    assert.equal(obs.length, 6);
    const b = obs.find((o) => o.item === 'B' && o.agent === 'builder');
    assert.deepEqual([b.firstPass, b.score, b.minutes], [false, 5, 20]);
    assert.equal(obs.find((o) => o.item === 'B' && o.agent === 'mapper').firstPass, true);
    const row = matrix(obs).find((r) => r.agent === 'builder');
    assert.deepEqual([row.n, row.firstPass, row.thin, row.score], [2, 0.5, true, 0.7]);
});

test('eval: intervals are wide for small samples; models are compared only with enough evidence', () => {
    assert.deepEqual(interval(0, 0), { low: 0, high: 1 });
    const wide = interval(2, 2);
    const narrow = interval(20, 20);
    assert.ok(wide.low < narrow.low && narrow.low > 0.9, JSON.stringify([wide, narrow]));
    const s = story();
    for (let i = 0; i < 6; i++) s.item(`H${i}`, { models: { builder: 'haiku' }, blame: i < 5 ? 'builder' : null, tokens: { builder: 2000 } });
    for (let i = 0; i < 6; i++) s.item(`S${i}`, { models: { builder: 'sonnet' }, tokens: { builder: 6000 } });
    for (let i = 0; i < 2; i++) s.item(`O${i}`, { models: { builder: 'opus' } });
    const rows = matrix(observations(s.events));
    const [hs, so] = compareModels(rows, 'builder');
    assert.match(hs.verdict, /haiku is worse/);
    assert.match(so.verdict, /^thin/);
    const same = story();
    for (let i = 0; i < 6; i++) same.item(`H${i}`, { models: { mapper: 'haiku' } });
    for (let i = 0; i < 6; i++) same.item(`S${i}`, { models: { mapper: 'sonnet' } });
    assert.match(compareModels(matrix(observations(same.events)), 'mapper')[0].verdict, /no evidence that sonnet is better/);
});

test('replay: the working tree — untracked files included — is kept as a hidden commit and restored in a worktree', () => {
    const root = tmp();
    write(root, 'src/a.js', 'export const a = 1;\n');
    write(root, '.gitignore', '.work/\n');
    gitInit(root);
    write(root, 'src/a.js', 'export const a = 2;\n');
    write(root, 'src/new.js', 'export const b = 3;\n');
    write(root, '.work/A/context.md', '# context\n');
    const workDir = path.join(root, '.work');
    const before = git(root, 'status', '--short').stdout;
    const snap = snapshot(root, { item: 'A', step: 'build', workDir });
    assert.equal(snap.ok, true, snap.reason);
    assert.equal(git(root, 'status', '--short').stdout, before, 'the index and the tree are untouched');
    assert.deepEqual(snap.handoffs, ['context.md']);
    write(root, 'src/a.js', 'export const a = 99;\n');
    const r = replaySetup(root, { item: 'A', step: 'build', model: 'haiku', workDir });
    assert.equal(r.ok, true, r.reason);
    assert.equal(fs.readFileSync(path.join(r.dir, 'src/a.js'), 'utf-8'), 'export const a = 2;\n');
    assert.ok(fs.existsSync(path.join(r.dir, 'src/new.js')));
    assert.ok(fs.existsSync(path.join(r.dir, '.work/A/context.md')));
    assert.equal(replaySetup(root, { item: 'A', step: 'red', model: 'haiku', workDir }).ok, false);
    const j = judge(r.dir, { has: 'node -e "process.exit(require(\'fs\').existsSync(\'src/new.js\')?0:1)"', fails: 'node -e "process.exit(2)"' });
    assert.deepEqual([j.passed, j.total, j.results.fails.exit], [1, 2, 2]);
});

test('retro: evidence of different strength moves a belief; old evidence fades', () => {
    const s = story();
    for (let i = 0; i < 6; i++) s.item(`A${i}`, { blame: 'builder', score: { builder: 4, inspector: 9 } });
    const sigs = signals(s.events);
    const bs = beliefs(sigs);
    const b = bs.find((x) => x.agent === 'builder' && x.dim === 'first-pass');
    assert.ok(b.high < 0.6 && b.evidence >= 4, JSON.stringify(b));
    assert.ok(bs.find((x) => x.agent === 'builder' && x.dim === 'quality').mean > b.mean, 'a score of 4/10 is partial evidence, not a zero');
    for (let i = 0; i < 12; i++) s.item(`B${i}`, { score: { builder: 9, inspector: 9 } });
    const later = beliefs(signals(s.events)).find((x) => x.agent === 'builder' && x.dim === 'first-pass');
    assert.ok(later.mean > 0.75, `recent clean items outweigh old rework: ${later.mean}`);
});

test('retro: an agent is compared with its own usual cost, per tier', () => {
    const s = story();
    for (let i = 0; i < 4; i++) s.item(`A${i}`, { tokens: { builder: 5000 } });
    s.item('A4', { tokens: { builder: 20000 } });
    const thrift = signals(s.events).filter((x) => x.agent === 'builder' && x.dim === 'thrift');
    assert.deepEqual(thrift.map((x) => x.value), [1, 0]);
    assert.match(thrift.at(-1).why, /4\.0× its own median/);
});

test('retro: proposals need one-sided evidence; a strong agent is offered a cheaper model by replay', () => {
    const loadouts = { roles: { builder: { model: { default: 'sonnet' }, phases: { build: ['spec-trace:verification-first', 'falsifiable-tests:right-reason-red', 'slice-seams:neighbour-run'] } }, inspector: { model: { default: 'sonnet' }, phases: {} }, mapper: { model: { default: 'haiku' }, phases: {} } } };
    const few = story();
    few.item('A0', { blame: 'builder' });
    assert.deepEqual(proposals(beliefs(signals(few.events)), { loadouts }), [], 'one bad item is not a pattern');
    const s = story();
    for (let i = 0; i < 10; i++) s.item(`A${i}`, { blame: 'builder', score: { inspector: 10, builder: 3 } });
    const ps = proposals(beliefs(signals(s.events)), { loadouts });
    const weak = ps.find((p) => p.id === 'builder:first-pass:reword-or-escalate');
    assert.ok(weak, JSON.stringify(ps.map((p) => p.id)));
    assert.match(weak.action, /one step up \(opus\)/);
    assert.ok(ps.some((p) => p.id === 'builder:quality:add-facet'));
    assert.ok(ps.some((p) => p.id === 'inspector:model:demote-trial'));
    assert.ok(!ps.some((p) => p.agent === 'mapper'), 'the cheapest model cannot be demoted');
});

test('retro: an adopted change is kept only if the belief moved', () => {
    const s = story();
    for (let i = 0; i < 6; i++) s.item(`A${i}`, { blame: 'builder' });
    s.say({ kind: 'change', proposal: 'builder:first-pass:add-facet', agent: 'builder', dim: 'first-pass' });
    s.item('B0');
    assert.match(reviewChanges(s.events, signals(s.events))[0].verdict, /too early: 1 of 5/);
    for (let i = 1; i < 5; i++) s.item(`B${i}`);
    assert.match(reviewChanges(s.events, signals(s.events))[0].verdict, /^keep/);
    const flat = story();
    for (let i = 0; i < 6; i++) flat.item(`A${i}`, { blame: 'builder' });
    flat.say({ kind: 'change', proposal: 'builder:first-pass:add-facet', agent: 'builder', dim: 'first-pass' });
    for (let i = 0; i < 5; i++) flat.item(`B${i}`, { blame: 'builder' });
    assert.match(reviewChanges(flat.events, signals(flat.events))[0].verdict, /^revert/);
});

test('hindsight: a fix is traced to the item that wrote the broken lines, and its agents are debited late', () => {
    const root = tmp();
    write(root, 'src/price.js', 'export const base = 1;\n');
    gitInit(root);
    write(root, 'src/price.js', 'export const base = 1;\nexport const total = (p, q) => p + q;\n');
    git(root, 'commit', '-qam', 'feat(price): totals (P07)');
    write(root, 'src/other.js', 'export const x = 1;\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'feat(other): unrelated (P08)');
    write(root, 'src/price.js', 'export const base = 1;\nexport const total = (p, q) => p * q;\n');
    write(root, 'tests/price.test.js', '// new test\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'fix(price): multiply');
    const origins = hindsight(root, 'HEAD', { itemOf: (sha, subject) => /\bP\d\d\b/.exec(subject)?.[0] ?? null });
    assert.deepEqual(origins.map((o) => [o.item, o.lines, o.files]), [['P07', 1, ['src/price.js']]]);
    const s = story();
    s.item('P07', { score: { builder: 9, inspector: 9 } });
    const before = beliefs(signals(s.events, { guards: ['inspector'], builder: 'builder' })).find((b) => b.agent === 'inspector' && b.dim === 'quality').mean;
    s.say({ kind: 'escape', item: 'P07', fix: 'abc12345' });
    const after = beliefs(signals(s.events, { guards: ['inspector'], builder: 'builder' }));
    assert.ok(after.find((b) => b.agent === 'inspector' && b.dim === 'quality').mean < before);
    assert.ok(after.find((b) => b.agent === 'builder' && b.dim === 'first-pass').mean < 0.5);
});

const ITEMS = {
    P1: { version: 'v1', deps: [], tier: 'normal' },
    P2: { version: 'v1', deps: ['P1'], tier: 'hard' },
    P3: { version: 'v1', deps: [], tier: 'normal' },
    P4: { version: 'v2', deps: ['P2'], tier: 'normal' },
    P5: { version: 'v2', deps: ['P9'], tier: 'normal' },
};

test('schedule: dependencies are respected, unknown ones are reported, the critical chain is the longest', () => {
    const { order: seq, stuck } = order(ITEMS);
    assert.deepEqual(seq, ['P1', 'P2', 'P3', 'P4']);
    assert.deepEqual(stuck, ['P5']);
    const minutes = (id) => (ITEMS[id].tier === 'hard' ? 90 : 40);
    assert.deepEqual(criticalPath(ITEMS, new Set(), minutes).path, ['P1', 'P2', 'P4']);
    assert.deepEqual(criticalPath(ITEMS, new Set(['P1']), minutes).path, ['P2', 'P4']);
});

test('schedule: priors are replaced by the team\'s own medians after three items', () => {
    const s = story();
    assert.equal(calibrate(s.events).source.normal, 'prior');
    for (let i = 0; i < 3; i++) s.item(`X${i}`, { minutes: 20 });
    const c = calibrate(s.events);
    assert.deepEqual([c.tiers.normal, c.source.normal, c.tiers.hard, c.source.hard], [60, 'median of 3 items', 90, 'prior']);
});

test('schedule: a forecast is a likely and a safe date; the same journal gives the same plan', () => {
    const s = story();
    s.item('P1');
    const opts = { capacity: 100, perWeek: 2, start: '2026-03-02', milestones: { v1: '2026-03-04', v2: '2026-12-31' } };
    const p = plan(ITEMS, s.events, opts);
    assert.equal(p.done, 1);
    assert.deepEqual(p.sessions.map((x) => x.items), [['P2', 'P3'], ['P3', 'P4']]);
    assert.equal(p.sessions[1].date, '2026-03-06');
    const [v1, v2] = p.forecast;
    assert.ok(v1.p80 >= v1.p50 && v2.p50 >= v1.p50);
    assert.ok(v1.slackDays < 0 && v2.slackDays > 0, JSON.stringify(p.forecast));
    assert.deepEqual(plan(ITEMS, s.events, opts).forecast, p.forecast);
    const lines = sessionPlan(p, ITEMS).join('\n');
    assert.match(lines, /then: P2, P3/);
    assert.match(lines, /AT RISK v1/);
    assert.match(lines, /cannot be scheduled.*P5/);
    s.open('P2', [{ id: 'map', agent: 'mapper' }]);
    s.run('P2', 'map', 'mapper', { status: 'NEEDS-USER' });
    assert.match(sessionPlan(plan(ITEMS, s.events, opts), ITEMS)[0], /waiting for you: P2/);
});
