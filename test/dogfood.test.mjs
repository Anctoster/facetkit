// Tests added because `facet mutate`, run on facetkit itself, found breakages nothing noticed.
// Each one names the survivor it answers. See docs/dogfood.md.
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_POLICY, evaluate, gate } from '../lib/govern.mjs';
import { readJournal, record } from '../lib/journal.mjs';
import { DEFAULT_ROUTING, route } from '../lib/router.mjs';
import { changedSince, scanSecrets } from '../lib/secscan.mjs';
import { parseClauses } from '../lib/trace.mjs';
import { gitInit, story, tmp, write } from './helpers.mjs';

test('govern: the first level consists of exactly the rules that make a result reproduced', () => {
    assert.deepEqual(DEFAULT_POLICY.filter((r) => r.level === 1).map((r) => r.id), ['verdict', 'independent', 'no-forced-steps', 'journal-intact', 'scan', 'approvals']);
    const s = story();
    s.open('A', [{ id: 'build', agent: 'builder' }, { id: 'proof', agent: 'inspector', verdict: true }]);
    s.run('A', 'build', 'builder');
    const open = gate(evaluate(s.events, 'A'), { required: 1 });
    assert.deepEqual(open.failing.map((r) => r.id), ['verdict', 'scan'], 'no verdict yet: level 1 is not reached');
});

test('govern: evidence measured during the proof is fresh; evidence measured in the middle of the build is stale', () => {
    const s = story();
    s.open('A', [{ id: 'build', agent: 'builder' }, { id: 'gates', gates: true, agents: ['reviewer'] }, { id: 'proof', agent: 'inspector', verdict: true }, { id: 'close', agent: 'conductor', bookkeeping: true }]);
    s.say({ kind: 'step.start', item: 'A', step: 'build', agent: 'builder' });
    s.say({ kind: 'evidence', item: 'A', name: 'early', ok: true });
    s.say({ kind: 'step.end', item: 'A', step: 'build', agent: 'builder', status: 'DONE' });
    s.run('A', 'gates', undefined);
    s.say({ kind: 'step.start', item: 'A', step: 'proof', agent: 'inspector' });
    s.say({ kind: 'evidence', item: 'A', name: 'accept', ok: true });
    s.say({ kind: 'step.end', item: 'A', step: 'proof', agent: 'inspector', status: 'DONE' });
    s.say({ kind: 'verdict', item: 'A', verdict: 'PASS' });
    s.run('A', 'close', 'conductor');
    const e = evaluate(s.events, 'A');
    assert.deepEqual([e.evidence.early.stale, e.evidence.accept.stale], [true, false], 'the inspector, the gates and bookkeeping do not change the product');
    assert.equal(e.results.find((r) => r.id === 'specified').pass, true);
});

test('journal: a missing journal is empty, and events without a clock keep the order of their time', () => {
    assert.deepEqual(readJournal(path.join(tmp(), 'nowhere')), []);
    assert.deepEqual(readJournal(undefined), []);
    const dir = path.join(tmp(), 'journal');
    record(dir, { kind: 'note', text: 'second', at: '2026-01-02T00:00:00.000Z' }, { writer: 'b' });
    record(dir, { kind: 'note', text: 'first', at: '2026-01-01T00:00:00.000Z' }, { writer: 'a' });
    assert.deepEqual(readJournal(dir).map((e) => e.text), ['second', 'first'], 'the logical clock outranks wall time');
    assert.equal(/^[a-z0-9-]+$/.test(readJournal(dir)[0].w), true);
});

test('router: an unknown model is left alone; four observations are not enough; five are', () => {
    assert.deepEqual(route({ agent: 'x', base: 'custom-model' }), { model: 'custom-model', reason: 'configured' });
    assert.deepEqual(route({ agent: 'x', base: undefined }), { model: null, reason: 'configured' });
    assert.equal(DEFAULT_ROUTING.minN, 5);
    const row = (n) => [{ agent: 'x', model: 'haiku', n, low: 0.9, high: 1 }];
    assert.equal(route({ agent: 'x', base: 'opus', rows: row(4) }).model, 'opus');
    assert.equal(route({ agent: 'x', base: 'opus', rows: row(5) }).model, 'haiku');
    const two = [{ agent: 'x', model: 'sonnet', n: 9, low: 0.9, high: 1 }, { agent: 'x', model: 'haiku', n: 9, low: 0.9, high: 1 }];
    assert.equal(route({ agent: 'x', base: 'opus', rows: two }).model, 'haiku', 'the cheapest proven model wins');
});

test('secscan: key formats are matched at their real length; the added lines of a hunk are numbered correctly', () => {
    const aws = ['AK', 'IA', 'ABCDEFGHIJKLMNOP'].join('');
    assert.equal(scanSecrets(`key = ${aws}`, 'f').length, 1);
    assert.equal(scanSecrets(`key = ${aws.slice(0, -1)}`, 'f').length, 0, 'one character short is not an access key id');
    const gh = ['gh', 'p_', 'a'.repeat(36)].join('');
    assert.equal(scanSecrets(`t = ${gh}`, 'f').length, 1);
    assert.equal(scanSecrets(`t = ${gh.slice(0, -1)}`, 'f').length, 0);
    const root = tmp();
    write(root, 'a.txt', 'one\ntwo\nthree\n');
    gitInit(root);
    write(root, 'a.txt', 'one\nNEW 1\nNEW 2\nNEW 3\ntwo\nthree\n');
    assert.deepEqual([...changedSince(root).get('a.txt')], [2, 3, 4]);
});

test('trace: a clause remembers its line; a repeated id is read once', () => {
    const c = parseClauses('# Spec\n\n- R1: first\n- R2: second (verify: test)\n- R1: again\n');
    assert.deepEqual(c.map((x) => [x.id, x.line, x.text]), [['R1', 3, 'first'], ['R2', 4, 'second']]);
});
