// Plan 2.6: tools/verify-bundle.mjs gives the verdict facet gives, from one file with no imports from lib/.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { canon as libCanon } from '../lib/canon.mjs';
import { brokenLines } from '../lib/journal.mjs';
import { verifyBundle as full } from '../lib/proof.mjs';
import { brokenAt, canon, verifyBundle as alone } from '../tools/verify-bundle.mjs';
import { cases, honest } from './proof-fixtures.mjs';
import { tmp } from './helpers.mjs';

const TOOL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'verify-bundle.mjs');

test('stand-alone: one file, nothing imported but node:', () => {
    const imports = [...fs.readFileSync(TOOL, 'utf-8').matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    assert.ok(imports.length && imports.every((m) => m.startsWith('node:')), imports.join(', '));
});

test('stand-alone: the same status as facet on every fixture, with and without trust — except where facet recomputes the level', () => {
    const { cases: all, trust } = cases();
    for (const c of all) {
        assert.equal(full(c.bundle).status, c.plain, `facet, ${c.name}`);
        assert.equal(alone(c.bundle).status, c.standalonePlain ?? c.plain, `stand-alone, ${c.name}`);
        assert.equal(full(c.bundle, { trust }).status, c.trusted, `facet with trust, ${c.name}`);
        assert.equal(alone(c.bundle, { trust }).status, c.trusted, `stand-alone with trust, ${c.name}`);
        const a = alone(c.bundle, { trust }).steps.map((s) => [s.name, s.ok]);
        const f = full(c.bundle, { trust }).steps.filter((s) => s.name !== 'verdict').map((s) => [s.name, s.ok]);
        assert.deepEqual(a, f, `the same steps, ${c.name}`);
    }
});

test('stand-alone: canonical JSON and the journal chain agree with facet\'s own', () => {
    for (const v of [{ b: 1, a: [true, null, 'é', 1.5e-7, { z: 0, y: ' ' }] }, [], 'x', -0, 1e21]) assert.equal(canon(v), libCanon(v));
    const lines = honest().bundle.segments['ann.jsonl'];
    const variants = [lines, lines.slice(0, -1), lines.slice(1), [lines[0], lines[2], lines[1], ...lines.slice(3)], lines.map((l, i) => (i === 3 ? l.replace('DONE', 'FAIL') : l)), [...lines, '{"torn":'], [...lines, lines.at(-1)]];
    for (const v of variants) assert.equal(brokenAt(v), brokenLines(v));
});

test('stand-alone CLI: exit 0 for a valid bundle, 1 otherwise; --trust names a trust file; a forged key in it is dropped', () => {
    const h = honest();
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify(h.bundle));
    fs.writeFileSync(path.join(dir, 'trust.json'), JSON.stringify(h.trust));
    const run = (...a) => spawnSync(process.execPath, [TOOL, ...a], { cwd: dir, encoding: 'utf-8' });
    const ok = run('b.json', '--trust', 'trust.json');
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /VALID — L1 reproduced as claimed/);
    assert.match(ok.stdout, /reproduced by a trusted witness \(independent\)/);
    assert.match(run('b.json').stdout, /no --trust/);
    const forged = { keys: h.trust.keys.map((k) => ({ ...k, id: k.name === 'ann' ? 'f'.repeat(16) : k.id })) };
    fs.writeFileSync(path.join(dir, 'forged.json'), JSON.stringify(forged));
    assert.equal(run('b.json', '--trust', 'forged.json').status, 1, 'the author\'s key, listed under another id, is not trusted');
    fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ ...h.bundle, facts: { x: 1 } }));
    const bad = run('b.json', '--json');
    assert.equal(bad.status, 1);
    assert.equal(JSON.parse(bad.stdout).status, 'TAMPERED');
});
