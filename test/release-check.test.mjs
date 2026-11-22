import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { changelogSection, releaseProblems } from '../scripts/release-check.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const changelog = '# Changelog\n\n## [Unreleased]\n\n- next\n\n## [0.8.0] — 2026-12-21\n\n### Added\n- a\n\n## [0.7.1] — 2026-11-22\n\n- b\n';

test('release check: the tag, package.json and a dated changelog section must agree', () => {
    assert.deepEqual(releaseProblems({ tag: 'v0.8.0', pkg: { version: '0.8.0' }, changelog }), []);
    assert.match(releaseProblems({ tag: 'v0.8.0', pkg: { version: '0.7.1' }, changelog })[0], /the tag says 0\.8\.0, package\.json says 0\.7\.1/);
    assert.match(releaseProblems({ tag: 'v0.9.0', pkg: { version: '0.9.0' }, changelog })[0], /no section/);
    assert.match(releaseProblems({ tag: 'v0.8.0', pkg: { version: '0.8.0' }, changelog: changelog.replace(' — 2026-12-21', '') })[0], /has no date/);
    assert.match(releaseProblems({ tag: 'latest', pkg: { version: '0.8.0' }, changelog })[0], /not v<major>/);
});

test('release check: the notes are the section of that version and nothing else', () => {
    assert.equal(changelogSection(changelog, '0.8.0').body, '### Added\n- a');
    assert.equal(changelogSection(changelog, '0.7.1').body, '- b');
    assert.equal(changelogSection(changelog, '0.8'), null);
});

test('release check: this repository\'s own release is consistent', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    const text = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    assert.deepEqual(releaseProblems({ tag: `v${pkg.version}`, pkg, changelog: text }), []);
});
