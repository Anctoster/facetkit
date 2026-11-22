// The changelog in fragments: parallel pull requests never edit the same lines (owner's decision, 22.11).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { changeProblems, fragmentProblems, holdsAll, parseFragment, readFragments, release } from '../scripts/changelog.mjs';
import { tmp, write } from './helpers.mjs';

const base = '# Changelog\n\nIntro.\n\n## [Unreleased]\n\n### Changed\n- an older entry\n\n## [0.7.1] — 2026-11-22\n\n- old\n';

test('fragment: sections of Keep a Changelog with bullets, or an explicit skip; anything else is named', () => {
    assert.deepEqual(parseFragment('### Added\n- a\n  continued\n- b\n### Fixed\n- c').entries, { Added: ['- a\n  continued', '- b'], Fixed: ['- c'] });
    assert.equal(parseFragment('skip: tests only').skip, 'tests only');
    const why = (t) => parseFragment(t).problems.join(' | ');
    assert.match(why(''), /empty/);
    assert.match(why('### Stuff\n- a'), /"### Stuff" is not a section/);
    assert.match(why('### Added\n'), /has no bullet/);
    assert.match(why('- a'), /bullet before any ### section/);
    assert.match(why('## [0.8.0]\n### Added\n- a'), /version heading is written at release/);
    assert.match(why('just words'), /neither a ### section nor a bullet/);
});

test('fragments: a bad name, one id twice, the same entry twice are refused', () => {
    const root = tmp();
    write(root, 'changelog.d/README.md', '# not a fragment');
    write(root, 'changelog.d/12-a.md', '### Added\n- one');
    write(root, 'changelog.d/12-b.md', '### Added\n- two');
    write(root, 'changelog.d/13-c.md', '### Added\n-  One');
    write(root, 'changelog.d/Bad Name.md', '### Added\n- x');
    const p = fragmentProblems(readFragments(root)).join('\n');
    assert.match(p, /the id 12 is used by 12-a\.md and 12-b\.md/);
    assert.match(p, /13-c\.md: the same entry is already in 12-a\.md/);
    assert.match(p, /Bad Name\.md: the name is <id>-<slug>\.md/);
    assert.equal(readFragments(root).length, 4, 'README.md is not a fragment');
});

test('pull request: no edit of CHANGELOG.md, one fragment added (or a skip); a release pull request may write it', () => {
    assert.deepEqual(changeProblems([{ status: 'M', file: 'lib/a.mjs' }, { status: 'A', file: 'changelog.d/70-x.md' }]), []);
    assert.match(changeProblems([{ status: 'M', file: 'CHANGELOG.md' }, { status: 'A', file: 'changelog.d/70-x.md' }])[0], /written at release only/);
    assert.match(changeProblems([{ status: 'M', file: 'lib/a.mjs' }])[0], /no fragment added/);
    assert.match(changeProblems([{ status: 'M', file: 'changelog.d/70-x.md' }])[0], /no fragment added/, 'editing an older fragment is not adding one');
    assert.deepEqual(changeProblems([{ status: 'M', file: 'CHANGELOG.md' }], { release: true }), []);
});

test('release: the Unreleased entries and the fragments become the dated section; again, nothing changes', () => {
    const fragments = [
        { file: '70-a.md', entries: { Added: ['- new thing'] } },
        { file: '71-b.md', entries: { Fixed: ['- a fix'], Changed: ['- a change'] } },
        { file: '72-c.md', skip: 'tests only', entries: {} },
    ];
    const once = release(base, fragments, '0.8.0', '2026-12-21');
    assert.match(once, /## \[Unreleased\]\n\n## \[0\.8\.0\] — 2026-12-21\n\n### Added\n- new thing\n\n### Changed\n- an older entry\n- a change\n\n### Fixed\n- a fix\n\n## \[0\.7\.1\]/);
    assert.equal(release(once, fragments, '0.8.0', '2026-12-21'), once, 'run again with the same fragments: no entry twice');
    assert.equal(release(once, [], '0.8.0', '2026-12-21'), once, 'run again after the fragments were removed: unchanged');
    assert.ok(holdsAll(once, fragments, '0.8.0'));
    assert.equal(holdsAll(base, fragments, '0.8.0'), false, 'before writing, the fragments are not in it: they must not be removed');
    assert.throws(() => release('# no sections\n', fragments, '0.8.0', '2026-12-21'), /no "## \[Unreleased\]"/);
});

test('release: the fragments are removed only once CHANGELOG.md holds them; this repository\'s fragments are well formed', async () => {
    assert.deepEqual(fragmentProblems(readFragments()), []);
    const root = tmp();
    write(root, 'CHANGELOG.md', base);
    write(root, 'changelog.d/70-a.md', '### Added\n- new thing');
    const text = release(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf-8'), readFragments(root), '0.8.0', '2026-12-21');
    assert.ok(holdsAll(text, readFragments(root), '0.8.0'));
});
