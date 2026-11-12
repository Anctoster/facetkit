import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { audit, loadPrior, renderAudit } from '../lib/audit.mjs';
import { loadSkills } from '../lib/facets.mjs';
import { addReceipt, checkReceipt, installedVersion, listReceipts } from '../lib/receipts.mjs';
import { facet, skillIndex, tmp, write } from './helpers.mjs';

const DAY = 86_400_000;
const body = (text) => `Do: ${text}\nCheck: \`facet run -- npm test\` exits 0 afterwards.\nStop: after 3 attempts report BLOCKED.\nWhy: keeps the work honest.`;
const A = 'write the failing assertion for the price rounding rule before touching the calculator module';
const B = 'seal every code reference in the handoff with a content hash so the receiver can detect drift';
const C = 'fetch the release notes of the installed library version and record three facts you rely on';

function collection({ second = B, extra = '' } = {}) {
    const root = tmp();
    write(root, 'alpha/SKILL.md', skillIndex('alpha', ['one', 'two']) + extra);
    write(root, 'alpha/facets/one.md', facet('one', { body: body(A) }));
    write(root, 'alpha/facets/two.md', facet('two', { body: body(second) }));
    write(root, 'beta/SKILL.md', skillIndex('beta', ['three']));
    write(root, 'beta/facets/three.md', facet('three', { body: body(C) }));
    return root;
}
const CONFIG = { budgetWords: 400, roles: { tester: { always: ['alpha:one'], phases: { red: ['alpha:two'], probe: ['beta:three'] } } } };

test('a sound collection passes and reports its statistics', () => {
    const r = audit(loadSkills([collection()]), CONFIG);
    assert.deepEqual(r.errors, []);
    assert.equal(r.stats.facets, 3);
    assert.equal(r.loadouts.length, 2);
    assert.match(renderAudit(r), /## Result: PASSED/);
});

test('two facets that say the same thing are reported as duplicates', () => {
    const reworded = 'before touching the calculator module write the failing assertion for the price rounding rule';
    const r = audit(loadSkills([collection({ second: reworded })]), CONFIG);
    assert.ok(r.errors.some((e) => /duplicate: alpha:one and alpha:two/.test(e)), r.errors.join('\n'));
});

test('a facet close to prior art is rejected, and prior skill names are reserved', () => {
    const prior = tmp();
    write(prior, 'other/skills/alpha/SKILL.md', `---\nname: alpha\ndescription: x\n---\n# Title\n\nDo: ${B}\nCheck: \`facet run -- npm test\` exits 0 afterwards.\nStop: after 3 attempts report BLOCKED.\nWhy: keeps the work honest.\n`);
    const r = audit(loadSkills([collection()]), CONFIG, { prior: loadPrior([path.join(prior, 'other')]) });
    assert.ok(r.errors.some((e) => /not original: alpha:two/.test(e)), r.errors.join('\n'));
    assert.ok(r.errors.some((e) => /a skill with this name exists in the prior art/.test(e)));
    assert.ok(r.stats.priorChunks > 0);
    assert.match(renderAudit(r, { priorDirs: ['x'] }), /Nearest prior art per facet/);
});

test('structure problems are named precisely', () => {
    const root = collection();
    write(root, 'alpha/facets/one.md', facet('one', { body: `Do: ${A}\nCheck: looks fine\nStop: when tired.\nWhy: reasons.` }));
    write(root, 'beta/facets/three.md', facet('three', { body: body(`${C} ${'and then some more words '.repeat(40)}`) }));
    write(root, 'beta/SKILL.md', '---\nname: beta\ndescription: Helps with docs.\n---\n# beta\n\n- `three`\n');
    const errors = audit(loadSkills([root]), CONFIG).errors.join('\n');
    assert.match(errors, /one\.md: Stop has no number/);
    assert.match(errors, /one\.md: Check is too vague/);
    assert.match(errors, /three\.md: \d+ words \(limit 170\)/);
    assert.match(errors, /beta\/SKILL\.md: description must start with "Use when"/);
    assert.match(errors, /beta\/SKILL\.md: needs at least 2 numbered trials/);
});

test('loadouts: dead weight, over-budget and unknown picks are errors', () => {
    const skills = loadSkills([collection()]);
    const unused = audit(skills, { roles: { tester: { phases: { red: ['alpha:one'] } } } }).errors.join('\n');
    assert.match(unused, /dead weight: alpha:two/);
    assert.match(unused, /dead weight: beta:three/);
    const tight = audit(skills, { budgetWords: 30, roles: { tester: { phases: { red: ['alpha:one', 'alpha:two', 'beta:three'] } } } }).errors.join('\n');
    assert.match(tight, /dropped — over the 30-word budget/);
    assert.match(audit(skills, { roles: { tester: { phases: { red: ['alpha:nope'] } } } }).errors.join('\n'), /unknown pick "alpha:nope"/);
});

test('receipts: add, fresh, stale, version mismatch, missing', () => {
    const dir = path.join(tmp(), 'receipts');
    const now = Date.parse('2026-11-11T10:00:00Z');
    assert.throws(() => addReceipt(dir, { topic: 'x', url: 'https://example.com', facts: [] }), /at least one --fact/);
    assert.throws(() => addReceipt(dir, { topic: 'x', url: 'notes.txt', facts: ['a'] }), /http/);
    addReceipt(dir, { topic: 'three KTX2Loader', url: 'https://threejs.org/docs/', version: '0.185.1', facts: ['needs a transcoder path'], ttlDays: 30, now });
    assert.equal(checkReceipt(dir, 'three KTX2Loader', { now: now + 5 * DAY }).state, 'fresh');
    assert.equal(checkReceipt(dir, 'Three  ktx2loader', { now }).state, 'fresh', 'topics are matched loosely');
    assert.equal(checkReceipt(dir, 'three KTX2Loader', { now: now + 31 * DAY }).state, 'stale');
    assert.equal(checkReceipt(dir, 'three KTX2Loader', { now, installed: '0.190.0' }).state, 'version-mismatch');
    assert.equal(checkReceipt(dir, 'vite prerender', { now }).state, 'missing');
    assert.equal(listReceipts(dir, now)[0].state, 'fresh');
});

test('installed version is read from node_modules, then from the lock file', () => {
    const root = tmp();
    assert.equal(installedVersion(root, 'three'), null);
    write(root, 'package-lock.json', JSON.stringify({ packages: { 'node_modules/three': { version: '0.185.1' } } }));
    assert.equal(installedVersion(root, 'three'), '0.185.1');
    write(root, 'node_modules/three/package.json', JSON.stringify({ version: '0.186.0' }));
    assert.equal(installedVersion(root, 'three'), '0.186.0');
});
