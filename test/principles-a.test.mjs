// Plan 2.11: A1 a step's criteria measured in the step, A2 asymmetry of the charge, A5 no rating in an agent's context.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ratingFindings } from '../lib/docaudit.mjs';
import { readJournal } from '../lib/journal.mjs';
import { buildTrustGraph } from '../lib/trustgraph.mjs';
import { story, tmp, write } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');

test('A1: a step that owns a measured criterion does not end without its result measured in the step, by its run', () => {
    const root = tmp();
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal', handoffCheck: false, govern: { checks: { unit: 'node -e 0' } } }));
    write(root, 'facet.items.json', '{}');
    const f = (env, ...a) => spawnSync(process.execPath, [CLI, ...a], { cwd: root, encoding: 'utf-8', env: { ...process.env, FACET_WRITER: 'ann', ...env } });
    f({}, 'flow', 'open', 'A', '--route', '', '--force');
    write(root, '.work/A/order.md', `# A\n## Done when\n\`\`\`criteria\n${JSON.stringify([{ id: 'C1', text: 'it works', check: 'unit', by: 'map' }])}\n\`\`\`\n`);
    f({}, 'criteria', 'approve', '--item', 'A', '--by', 'ann');
    f({}, 'flow', 'start', 'open');
    f({}, 'flow', 'end', 'open', '--status', 'DONE', '--force');
    assert.equal(f({}, 'check', 'unit', '--item', 'A').status, 0); // measured before the step: does not count
    f({}, 'flow', 'start', 'map', '--run', 'r-7');
    write(root, '.work/A/echo.json', JSON.stringify({ step: 'map', criteria: [{ id: 'C1', value: 'it works', action: 'a', check: 'unit' }], fixed: [] }));
    f({}, 'echo', 'check', 'map', '--item', 'A');
    write(root, '.work/A/context.md', '# A — context\n- C1: done\n');
    const early = f({}, 'flow', 'end', 'map', '--status', 'DONE');
    assert.match(early.stderr, /A1 C1: no result of unit measured in this step \(run r-7\)/);
    assert.equal(f({ FACET_RUN: 'other' }, 'check', 'unit', '--item', 'A').status, 0);
    assert.match(f({}, 'flow', 'end', 'map', '--status', 'DONE').stderr, /A1 C1: no result of unit measured in this step/, 'another run does not count');
    assert.equal(f({ FACET_RUN: 'r-7' }, 'check', 'unit', '--item', 'A').status, 0);
    assert.doesNotMatch(f({}, 'flow', 'end', 'map', '--status', 'DONE').stderr, /\bA1\b/);
    const end = readJournal(path.join(root, '.facet', 'journal')).filter((e) => e.kind === 'step.end' && e.step === 'map').at(-1);
    assert.deepEqual(end?.criteria ?? null, end ? { C1: 'done' } : null, 'the step\'s own statuses are kept for A2');
});

function returned(claim) {
    const s = story();
    s.open('A', [{ id: 'build', agent: 'builder', phase: 'build' }, { id: 'proof', agent: 'inspector', phase: 'proof', verdict: true }]);
    s.say({ kind: 'step.start', item: 'A', step: 'build', agent: 'builder', model: 'm' });
    s.say({ kind: 'step.end', item: 'A', step: 'build', agent: 'builder', status: 'DONE', criteria: claim ? { C1: claim } : undefined });
    s.say({ kind: 'step.start', item: 'A', step: 'proof', agent: 'inspector', model: 'm' });
    s.say({ kind: 'step.end', item: 'A', step: 'proof', agent: 'inspector', status: 'DONE' });
    s.say({ kind: 'verdict', item: 'A', verdict: 'REWORK', fixes: [{ agent: 'builder' }] });
    s.say({ kind: 'origin', item: 'A', criterion: 'C1', step: 'build', agent: 'builder', method: 'measured', charged: true, foundAt: 'proof' });
    s.say({ kind: 'verdict', item: 'A', verdict: 'PASS', fixes: [] });
    s.say({ kind: 'item.close', item: 'A' });
    return buildTrustGraph(s.events).nodes.get('agent:builder@m');
}

test('A2: blocked or partial with a reason charges nothing; a refuted "done" charges twice a plain return', () => {
    assert.deepEqual([returned(null).bad, returned('blocked: no access to the API').bad, returned('partial: the doors are left').bad, returned('done').bad], [1, 0, 0, 2]);
    assert.equal(returned('blocked').bad, 1, 'blocked without a reason is not the behaviour wanted: a plain return');
});

test('A5: a trust score, a share of trust or a rating in what an agent reads is a finding; commands in backticks are not', () => {
    const f = ratingFindings({
        'agents/a.md': 'You are the builder.\nYour trust score is 0.82.\nRun `facet trust` for the record.\nYou are trusted at 73 % of items.\n',
        'templates/b.md': '## Status\nТвой рейтинг среди агентов: 4.\n',
        'loadouts.json': '{"builder": {"facets": ["x"]}}',
    });
    assert.deepEqual(f.map((x) => x.split(': a rating')[0]), ['agents/a.md:2', 'agents/a.md:4', 'templates/b.md:2']);
});
