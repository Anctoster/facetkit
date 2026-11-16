import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filesForStep, listedFiles } from '../lib/handoff.mjs';
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
