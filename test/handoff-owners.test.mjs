import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filesForStep, listedFiles, workingChanges } from '../lib/handoff.mjs';
import { gitInit, tmp, write } from './helpers.mjs';
import { ownersFromTerritories, resolveOwners } from '../lib/ownership.mjs';

const manifest = { owners: { 'src/**': 'slice-builder', 'tests/unit/**': 'spec-falsifier', '.claude/commands/**': 'release-pilot', 'acceptance/**': 'red-first-specifier' }, shared: ['package.json'] };

test('handoff: a step accounts only for its own changed files — not what another handoff lists, not another agent\'s territory', () => {
    const changed = ['src/a.ts', 'tests/unit/a.test.ts', '.claude/commands/release.md', 'acceptance/x.feature', 'package.json', 'docs/notes.md'];
    const owners = resolveOwners(changed, manifest);
    const claimedElsewhere = listedFiles('# x — red\n## Files changed\n- acceptance/x.feature\n');
    assert.deepEqual(claimedElsewhere, ['acceptance/x.feature']);
    // the builder lists its own file, the shared one and the unassigned one; the rest belong to others
    assert.deepEqual(filesForStep(changed, { claimedElsewhere, owners, agent: 'slice-builder' }), ['src/a.ts', 'package.json', 'docs/notes.md']);
    // without a manifest, only what another handoff already lists is left out (the behaviour before)
    assert.deepEqual(filesForStep(changed, { claimedElsewhere, agent: 'slice-builder' }), changed.filter((f) => f !== 'acceptance/x.feature'));
    // nothing is dropped silently: a file nobody lists and nobody owns stays with the step that changed it
    assert.deepEqual(filesForStep(['docs/notes.md'], { owners: resolveOwners(['docs/notes.md'], manifest), agent: 'release-pilot' }), ['docs/notes.md']);
});

test('ownership: a territories file (agent → paths) reads as an ownership manifest', () => {
    const m = ownersFromTerritories({ 'slice-builder': { paths: ['src/**', 'tools/**'] }, 'spec-falsifier': { paths: ['tests/unit/**'] }, 'proof-inspector': { paths: [] }, forbidden: ['.env'] });
    assert.deepEqual(m, { owners: { 'src/**': 'slice-builder', 'tools/**': 'slice-builder', 'tests/unit/**': 'spec-falsifier' } });
    assert.deepEqual(resolveOwners(['tools/x.py'], m).map((o) => o.owner), ['slice-builder']);
});

test('govern: a step ended DONE with --force is no failed rule, but assure and trust always show it', async () => {
    const { evaluate, renderEvaluation, trust, renderTrust } = await import('../lib/govern.mjs');
    const { story } = await import('./helpers.mjs');
    const s = story();
    s.open('A', [{ id: 'build', agent: 'builder', phase: 'build' }, { id: 'proof', agent: 'inspector', phase: 'proof', verdict: true }]);
    s.say({ kind: 'step.start', item: 'A', step: 'build', agent: 'builder' });
    s.say({ kind: 'step.end', item: 'A', step: 'build', agent: 'builder', status: 'DONE', forced: true, reason: 'checks disagree on files of other agents' });
    const e = evaluate(s.events, 'A');
    assert.equal(e.results.find((r) => r.id === 'no-forced-steps').pass, true);
    assert.match(renderEvaluation(e), /1 step\(s\) ended DONE with --force .*build \(checks disagree on files of other agents\)/);
    assert.equal(trust(s.events).forcedEnds, 1);
    assert.match(renderTrust(trust(s.events)), /steps ended with --force: 1/);
});

test('handoff: files of a new untracked folder are reported one by one, so a handoff can list them', () => {
    const root = tmp();
    gitInit(root);
    write(root, 'tests/integration/a.test.ts', '// a\n');
    write(root, 'tests/integration/deep/b.test.ts', '// b\n');
    assert.deepEqual(workingChanges(root).sort(), ['tests/integration/a.test.ts', 'tests/integration/deep/b.test.ts']);
});

test('handoff: a dotfile is a path — `.gitignore` and "- .gitignore" are listed', () => {
    assert.deepEqual(listedFiles('# x\n## Files changed\n- .gitignore\n- `.env.example`\n- `src/a.ts:12`\n- see the notes\n'), ['.gitignore', '.env.example', 'src/a.ts']);
});
