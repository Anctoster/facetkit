import assert from 'node:assert/strict';
import test from 'node:test';
import { compose, loadSkills, loadoutPicks, renderLoadout, resolvePicks } from '../lib/facets.mjs';
import { cosine, jaccard, parseFrontmatter, shingles, similarity } from '../lib/text.mjs';
import { facet, skillIndex, tmp, write } from './helpers.mjs';

function fixture() {
    const root = tmp();
    write(root, 'alpha/SKILL.md', skillIndex('alpha', ['one', 'two']));
    write(root, 'alpha/facets/one.md', facet('one', { meta: 'needs: [run]\nbounds: attempts=3, minutes=10\nphase: [red]\n' }));
    write(root, 'alpha/facets/two.md', facet('two', { meta: 'bounds: attempts=2\n' }));
    write(root, 'beta/SKILL.md', skillIndex('beta', ['three']));
    write(root, 'beta/facets/three.md', facet('three', { meta: 'conflicts: [alpha:two]\nbounds: minutes=5\n' }));
    return root;
}

test('frontmatter parses lists and bounds', () => {
    const { meta, body } = parseFrontmatter('---\nid: x\nneeds: [run, read]\nbounds: attempts=3, minutes=10\n---\nbody');
    assert.deepEqual(meta.needs, ['run', 'read']);
    assert.deepEqual(meta.bounds, { attempts: 3, minutes: 10 });
    assert.equal(body, 'body');
});

test('similarity is high for a rewording and low for unrelated text', () => {
    const a = 'Run the failing test first and read the assertion message before writing production code';
    const b = 'First run the failing test and read its assertion message before you write production code';
    const c = 'Mount the shared volume and let the proxy serve static files with cache headers';
    assert.ok(similarity(a, b) > 0.35, `reworded: ${similarity(a, b)}`);
    assert.ok(similarity(a, c) < 0.1, `unrelated: ${similarity(a, c)}`);
    assert.equal(jaccard(shingles(''), shingles(a)), 0);
    assert.equal(cosine('', a), 0);
});

test('skills load with facets, sections and word counts', () => {
    const [alpha, beta] = loadSkills([fixture()]);
    assert.equal(alpha.name, 'alpha');
    assert.equal(alpha.facets.length, 2);
    assert.equal(alpha.facets[0].ref, 'alpha:one');
    assert.match(alpha.facets[0].do, /perform the one step/);
    assert.match(alpha.facets[0].stop, /3 attempts/);
    assert.ok(alpha.facets[0].words > 10);
    assert.equal(beta.facets[0].conflicts[0], 'alpha:two');
});

test('a skill defined in two directories is an error', () => {
    const root = fixture();
    assert.throws(() => loadSkills([root, root]), /defined twice/);
});

test('picks: whole skill, single facet, unknown', () => {
    const skills = loadSkills([fixture()]);
    const r = resolvePicks(skills, ['beta:three', 'alpha', 'alpha:one', 'nope:x']);
    assert.deepEqual(r.facets.map((f) => f.ref), ['beta:three', 'alpha:one', 'alpha:two']);
    assert.deepEqual(r.unknown, ['nope:x']);
});

test('compose drops the lower-priority side of a conflict and merges bounds to the strictest', () => {
    const skills = loadSkills([fixture()]);
    const { facets } = resolvePicks(skills, ['alpha:one', 'alpha:two', 'beta:three']);
    const r = compose(facets, { budget: 900 });
    assert.deepEqual(r.used.map((f) => f.ref), ['alpha:one', 'alpha:two']);
    assert.match(r.dropped[0].reason, /conflicts with alpha:two/);
    assert.deepEqual(r.bounds, { attempts: 2, minutes: 10 });
    const other = compose(resolvePicks(skills, ['beta:three', 'alpha:one']).facets);
    assert.deepEqual(other.bounds, { minutes: 5, attempts: 3 });
});

test('compose respects the word budget by dropping from the end', () => {
    const skills = loadSkills([fixture()]);
    const { facets } = resolvePicks(skills, ['alpha:one', 'alpha:two']);
    const r = compose(facets, { budget: facets[0].words + 1 });
    assert.deepEqual(r.used.map((f) => f.ref), ['alpha:one']);
    assert.match(r.dropped[0].reason, /budget/);
    const text = renderLoadout(r, { role: 'tester', phase: 'red' });
    assert.match(text, /# Loadout — tester \/ red \(1 facets/);
    assert.match(text, /Bounds .*attempts ≤ 3/);
    assert.match(text, /Not loaded: alpha:two/);
    assert.ok(!text.includes('perform the two step'));
});

test('loadout picks put "always" first and reject unknown roles and phases', () => {
    const config = { budgetWords: 500, roles: { tester: { always: ['alpha:one'], phases: { red: ['beta:three'], probe: ['alpha:two'] }, model: { default: 'sonnet', probe: 'haiku' } } } };
    assert.deepEqual(loadoutPicks(config, 'tester', 'red').picks, ['alpha:one', 'beta:three']);
    assert.equal(loadoutPicks(config, 'tester', 'red').budget, 500);
    assert.throws(() => loadoutPicks(config, 'nobody', 'red'), /no loadout/);
    assert.throws(() => loadoutPicks(config, 'tester', 'green'), /no phase/);
});
