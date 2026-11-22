// Plan 2.7, guard part: a policy can ask for a minimum isolation at a level.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_POLICY, evaluate, isolationRank } from '../lib/govern.mjs';
import { story } from './helpers.mjs';

const item = (...isolations) => {
    const s = story();
    s.open('A', [{ id: 'build', agent: 'builder', phase: 'build' }, { id: 'proof', agent: 'inspector', phase: 'proof', verdict: true }]);
    s.say({ kind: 'step.start', item: 'A', step: 'build', agent: 'builder' });
    s.say({ kind: 'step.end', item: 'A', step: 'build', agent: 'builder', status: 'DONE' });
    s.say({ kind: 'step.start', item: 'A', step: 'proof', agent: 'inspector' });
    isolations.forEach((isolation, i) => s.say({ kind: 'evidence', item: 'A', name: i ? `check${i}` : 'scan', ok: true, value: 0, approvals: [], ...(isolation === undefined ? {} : { isolation }) }));
    s.say({ kind: 'step.end', item: 'A', step: 'proof', agent: 'inspector', status: 'DONE' });
    s.say({ kind: 'verdict', item: 'A', verdict: 'PASS', fixes: [] });
    return s.events;
};
const rule = { id: 'isolated', level: 1, fact: 'isolation', atLeast: 'container', why: 'measured in a container or in CI' };
const judge = (events, r = rule) => evaluate(events, 'A', { policy: [...DEFAULT_POLICY, r], project: { journalIntact: true } }).results.find((x) => x.id === r.id);

test('isolation ranks: none < declared < container < ci; a declared sandbox ranks as declared', () => {
    assert.deepEqual(['none', 'declared:claude-code', 'container', 'ci', 'other', null].map(isolationRank), [0, 1, 2, 3, -1, -1]);
});

test('policy: the weakest isolation of current evidence must reach the minimum', () => {
    assert.deepEqual([judge(item('ci', 'container')).pass, judge(item('ci', 'container')).got], [true, 'container']);
    assert.deepEqual([judge(item('ci', 'declared:claude-code')).pass, judge(item('ci', 'declared:claude-code')).got], [false, 'declared:claude-code']);
    assert.equal(judge(item('none')).pass, false);
    assert.equal(judge(item('ci'), { ...rule, atLeast: 'ci' }).pass, true);
    assert.equal(judge(item('declared:sandbox'), { ...rule, atLeast: 'declared' }).pass, true);
});

test('policy: evidence that does not say how it was isolated is unknown, and unknown does not pass; an unknown minimum passes nothing', () => {
    const r = judge(item('ci', undefined));
    assert.deepEqual([r.pass, r.unknown, r.got], [false, true, 'unknown']);
    assert.equal(judge(item('ci'), { ...rule, atLeast: 'vm' }).pass, false);
});

test('policy: without such a rule nothing changes — the default policy does not ask for isolation', () => {
    const plain = evaluate(item('none'), 'A', { project: { journalIntact: true } });
    assert.ok(!plain.results.some((x) => x.id === 'isolated'));
    assert.equal(plain.facts.isolation, 'none');
});

test('proof pack: names the isolation it was made in, and says when it was only declared', async () => {
    const { createProof, renderProof } = await import('../lib/proof.mjs');
    const { tmp, write } = await import('./helpers.mjs');
    const root = tmp();
    write(root, 'a.txt', 'a\n');
    const env = { digest: 'd', comparable: 'c', node: '22', platform: 'linux', arch: 'x64', facetkit: '0.8.0', tools: null, locks: {} };
    const declared = createProof(root, item('ci'), 'A', { project: { journalIntact: true }, environment: { ...env, isolation: 'declared:claude-code' } });
    assert.equal(declared.environment.isolation, 'declared:claude-code');
    assert.match(renderProof(declared), /made in isolation declared:claude-code \(declared by the project, not observed\)/);
    const ci = createProof(root, item('ci'), 'A', { project: { journalIntact: true }, environment: { ...env, isolation: 'ci' } });
    assert.match(renderProof(ci), /made in isolation ci$/m);
});
