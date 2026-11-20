import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_FLOW, itemState, next, planSteps, resumeCard, verdictBlocker } from '../lib/flow.mjs';
import { brokenAt, readJournal, record } from '../lib/journal.mjs';
import { anomalies, timeline } from '../lib/observe.mjs';
import { STEPS, story, tmp } from './helpers.mjs';

const LOADOUTS = { roles: { mapper: { model: { default: 'haiku' } }, builder: { model: { default: 'sonnet' }, phases: { build: [], rework: [] } }, inspector: { model: { default: 'sonnet' } } } };
const FLOW = { ...DEFAULT_FLOW, tiers: { hard: { mapper: 'sonnet' } } };
const at = (s) => next(itemState(s.events, 'A'), { loadouts: LOADOUTS, flow: FLOW });

test('journal: every line is chained to the one before; an edit is found', () => {
    const file = path.join(tmp(), 'journal.jsonl');
    record(file, { kind: 'item.open', item: 'A', steps: [] });
    record(file, { kind: 'note', item: 'A', text: 'one' });
    record(file, { kind: 'note', item: 'A', text: 'two' });
    assert.equal(brokenAt(file), -1);
    assert.equal(readJournal(file).length, 3);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('"one"', '"ONE"'));
    assert.equal(brokenAt(file), 1, 'the edited line itself: its id no longer matches it (schema 2), not only the line after it');
});

test('plan: optional steps appear only for agents on the route, gates only when there are any', () => {
    const ids = (route, gates) => planSteps(DEFAULT_FLOW, { route, gates }).map((s) => s.id);
    assert.deepEqual(ids([], []), ['open', 'map', 'red', 'build', 'proof', 'green', 'commit', 'close']);
    assert.deepEqual(ids(['spec-falsifier', 'blueprint-architect'], ['code-reviewer']), ['open', 'map', 'design', 'spec', 'red', 'build', 'probe', 'gates', 'proof', 'green', 'commit', 'close']);
});

test('next: one step at a time, in order, with the model of the role', () => {
    const s = story();
    assert.equal(next(itemState(s.events, 'A')).action, 'open');
    s.open('A', STEPS);
    assert.deepEqual([at(s).action, at(s).step, at(s).model], ['call', 'map', 'haiku']);
    s.run('A', 'map', 'mapper');
    assert.deepEqual([at(s).step, at(s).agent, at(s).model], ['build', 'builder', 'sonnet']);
    s.run('A', 'build', 'builder');
    s.run('A', 'proof', 'inspector');
    s.say({ kind: 'verdict', item: 'A', verdict: 'PASS' });
    assert.equal(at(s).action, 'close');
    s.say({ kind: 'item.close', item: 'A' });
    assert.equal(at(s).action, 'complete');
});

test('interruption: a start without an end is resumed from its checkpoints, not restarted', () => {
    const s = story();
    s.open('A', STEPS);
    s.run('A', 'map', 'mapper');
    s.say({ kind: 'step.start', item: 'A', step: 'build', agent: 'builder', model: 'sonnet' });
    s.say({ kind: 'note', item: 'A', step: 'build', text: 'slice 1 done: storage module; next: routes' });
    // the session dies here
    assert.deepEqual([at(s).action, at(s).step], ['resume', 'build']);
    const state = itemState(s.events, 'A');
    const card = resumeCard(state, 'build', { runs: [{ kind: 'run', at: s.events.at(-1).at, cmd: 'npm test', exit: 1 }], changed: ['src/a.ts'] });
    assert.match(card, /slice 1 done: storage module; next: routes/);
    assert.match(card, /Done before this step: map/);
    assert.match(card, /failed: \$ npm test → exit 1/);
    assert.ok(card.split('\n').length <= 12, 'a resume card stays short');
    s.say({ kind: 'step.start', item: 'A', step: 'build', agent: 'builder' }); // started again by mistake
    const again = itemState(s.events, 'A').steps.find((x) => x.id === 'build');
    assert.deepEqual([again.attempts, again.resumes, again.notes.length], [1, 1, 1]);
    assert.ok(anomalies(s.events, 'A').some((a) => a.kind === 'interrupted'));
});

test('blocked: the agent named in the block is called once; a second block goes to the user', () => {
    const s = story();
    s.open('A', STEPS);
    s.run('A', 'map', 'mapper');
    s.run('A', 'build', 'builder', { status: 'BLOCKED', for: 'mapper' });
    let n = at(s);
    assert.deepEqual([n.action, n.step, n.assist], ['call', 'map', 'build']);
    s.say({ kind: 'step.start', item: 'A', step: 'map', agent: 'mapper', assist: 'build' });
    s.say({ kind: 'step.end', item: 'A', step: 'map', agent: 'mapper', status: 'DONE' });
    n = at(s);
    assert.deepEqual([n.action, n.step, n.attempt], ['call', 'build', 2]);
    assert.equal(itemState(s.events, 'A').steps.find((x) => x.id === 'map').attempts, 1, 'an assist is not a new attempt of the helper');
    s.run('A', 'build', 'builder', { status: 'BLOCKED', for: 'mapper' });
    assert.equal(at(s).action, 'ask');
});

test('assist after a rework: helping does not finish the helper\'s own step, and no verdict is taken until the round is done', () => {
    const s = story();
    s.open('A', STEPS);
    s.run('A', 'map', 'mapper');
    s.run('A', 'build', 'builder');
    s.run('A', 'proof', 'inspector');
    assert.equal(verdictBlocker(itemState(s.events, 'A')), null);
    s.say({ kind: 'verdict', item: 'A', verdict: 'REWORK', fixes: [{ agent: 'builder' }] });
    s.run('A', 'build', 'builder', { status: 'BLOCKED', for: 'inspector' });
    assert.deepEqual([at(s).step, at(s).assist], ['proof', 'build']);
    s.say({ kind: 'step.start', item: 'A', step: 'proof', agent: 'inspector', assist: 'build' });
    s.say({ kind: 'step.end', item: 'A', step: 'proof', agent: 'inspector', status: 'DONE' });
    const state = itemState(s.events, 'A');
    assert.equal(state.steps.find((x) => x.id === 'proof').status, 'pending', 'the proof of this round has not been run');
    assert.match(verdictBlocker(state), /build \(pending\), proof \(pending\)/);
    assert.deepEqual([at(s).step, at(s).attempt], ['build', 3]);
    s.run('A', 'build', 'builder');
    assert.match(verdictBlocker(itemState(s.events, 'A')), /proof \(pending\)/, 'the builder is done, the proof is not');
    s.run('A', 'proof', 'inspector');
    assert.equal(verdictBlocker(itemState(s.events, 'A')), null);
});

test('resume of the gates names the gate agents, not an agent of its own', () => {
    const s = story();
    s.open('A', [{ id: 'gates', gates: true, agents: ['code-reviewer', 'security-auditor'] }, ...STEPS]);
    s.say({ kind: 'step.start', item: 'A', step: 'gates' });
    const n = at(s);
    assert.deepEqual([n.action, n.step, n.agent, n.agents], ['resume', 'gates', undefined, ['code-reviewer', 'security-auditor']]);
    s.say({ kind: 'step.end', item: 'A', step: 'gates', status: 'BLOCKED' });
    assert.match(at(s).question, /^the gates \(code-reviewer, security-auditor\) are blocked/);
});

test('needs-user: the flow waits for an answer and then repeats the step', () => {
    const s = story();
    s.open('A', STEPS);
    s.run('A', 'map', 'mapper', { status: 'NEEDS-USER', question: 'which legal text?' });
    assert.deepEqual([at(s).action, at(s).question], ['ask', 'which legal text?']);
    s.say({ kind: 'answer', item: 'A', step: 'map' });
    assert.deepEqual([at(s).action, at(s).step], ['call', 'map']);
});

test('rework: the blamed agent and the proof run again; the third cycle is the user\'s', () => {
    const s = story();
    s.open('A', STEPS);
    s.run('A', 'map', 'mapper');
    s.run('A', 'build', 'builder');
    s.run('A', 'proof', 'inspector');
    for (let cycle = 1; cycle <= 2; cycle++) {
        s.say({ kind: 'verdict', item: 'A', verdict: 'REWORK', fixes: [{ agent: 'builder' }] });
        const n = at(s);
        assert.deepEqual([n.step, n.mode, n.phase], ['build', 'REWORK', 'rework']);
        s.run('A', 'build', 'builder');
        assert.equal(at(s).step, 'proof');
        s.run('A', 'proof', 'inspector');
    }
    assert.equal(itemState(s.events, 'A').steps.find((x) => x.id === 'map').status, 'done', 'agents that were not blamed are not re-run');
    s.say({ kind: 'verdict', item: 'A', verdict: 'REWORK', fixes: [{ agent: 'builder' }] });
    assert.equal(at(s).action, 'ask');
    assert.ok(anomalies(s.events, 'A').some((a) => a.kind === 'rework'));
});

test('model ladder: a tier may raise a role; repeated failure raises one step, once', () => {
    const s = story();
    s.open('A', STEPS, { tier: 'hard' });
    assert.equal(at(s).model, 'sonnet');
    s.run('A', 'map', 'mapper');
    s.run('A', 'build', 'builder', { status: 'INTERRUPTED' });
    assert.deepEqual([at(s).model, at(s).escalated], ['sonnet', false]);
    s.run('A', 'build', 'builder', { status: 'INTERRUPTED' });
    assert.deepEqual([at(s).model, at(s).escalated, at(s).attempt], ['opus', true, 3]);
});

test('observe: the timeline is one line per event; loops and silent steps are flagged', () => {
    const s = story();
    s.open('A', STEPS);
    s.run('A', 'map', 'mapper');
    const from = s.events.at(-2).at;
    s.say({ kind: 'step.start', item: 'A', step: 'build', agent: 'builder' });
    const runs = [1, 2, 3].map((i) => ({ kind: 'run', at: new Date(new Date(s.events.at(-1).at).getTime() + i * 1000).toISOString(), cmd: 'npm test', exit: 1 }));
    s.say({ kind: 'step.end', item: 'A', step: 'build', agent: 'builder', status: 'DONE' }, 5);
    const odd = anomalies(s.events, 'A', runs);
    assert.ok(odd.some((a) => a.kind === 'loop' && a.step === 'build'));
    assert.ok(odd.some((a) => a.kind === 'silent' && a.step === 'map'), JSON.stringify(odd));
    const lines = timeline(s.events, 'A', runs);
    assert.equal(lines.length, 5);
    assert.match(lines.at(-1), /end +build → DONE · 5 min · 3 commands \(3 failed\)/);
    assert.ok(from);
});

test('cli: steps cannot be skipped, a verdict needs a finished proof, the loop ends in close', async () => {
    const { spawnSync } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');
    const root = tmp();
    fs.writeFileSync(path.join(root, 'routing.json'), JSON.stringify({ items: { A: { deps: [], route: [], gates: [], tier: 'normal' }, B: { deps: ['A'], route: [], gates: [] }, C: { deps: [], route: [], gates: [] } } }));
    const f = (...args) => spawnSync('node', [cli, ...args], { cwd: root, encoding: 'utf-8' });
    assert.equal(f('flow', 'open', 'B').status, 1, 'an item with an open dependency is refused');
    assert.equal(f('flow', 'open', 'A').status, 0);
    assert.equal(f('flow', 'open', 'C').status, 1, 'one item at a time');
    assert.equal(f('flow', 'start', 'build').status, 1);
    assert.equal(f('flow', 'verdict', 'PASS').status, 1);
    for (const step of ['open', 'map', 'red', 'build', 'proof']) {
        assert.match(f('flow', 'next').stdout, new RegExp(`/ ${step}`));
        assert.equal(f('flow', 'start', step).status, 0);
        if (step === 'build') assert.equal(f('note', 'done: slice 1; next: slice 2').status, 0);
        assert.equal(f('flow', 'end', step, '--status', 'DONE', '--tokens', '100').status, 0);
    }
    assert.equal(f('flow', 'verdict', 'REWORK').status, 1, 'a rework needs an owner');
    assert.equal(f('flow', 'verdict', 'PASS', '--score', 'slice-builder=9').status, 0);
    assert.equal(f('flow', 'close').status, 1, 'green and commit are still pending');
    for (const step of ['green', 'commit', 'close']) {
        f('flow', 'start', step);
        f('flow', 'end', step, '--status', 'DONE');
    }
    assert.match(f('flow', 'next').stdout, /^CLOSE A/);
    assert.equal(f('flow', 'close').status, 0);
    assert.match(f('journal').stdout, /journal intact: \d+ events, 0 open, 1 closed/);
    assert.match(f('eval', 'matrix').stdout, /slice-builder +sonnet +1/);
    assert.match(f('timeline', '--item', 'A').stdout, /done: slice 1; next: slice 2/);
    assert.equal(f('flow', 'open', 'B').status, 0, 'the dependency is closed now');
});
