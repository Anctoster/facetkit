import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cell, FILES, fill, status, table } from '../scripts/research.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = JSON.parse(fs.readFileSync(path.join(ROOT, 'trials', 'results.json'), 'utf-8'));

test('research: RESULTS pages match trials/results.json (run npm run research after adding a trial)', () => {
    for (const [f, lang] of Object.entries(FILES)) {
        const text = fs.readFileSync(path.join(ROOT, f), 'utf-8');
        assert.match(text, /<!-- research:table -->/, `${f} marks the table`);
        assert.deepEqual(fill(text, results, lang, ROOT).stale, [], `${f} is out of date: npm run research`);
    }
});

test('research: a cell shows both scores, a full control is a ceiling, the status counts confirmed models', () => {
    const r = (verdict, without, withRule, note = '') => ({ facet: 'x:y', model: 'M (self-reported), web', runs: 3, verdict, without: `${without} passed`, with: `${withRule} passed`, note });
    assert.equal(cell(r('confirmed', '0/3', '2/3'), 'en'), '**confirmed** 0/3 → 2/3');
    assert.equal(cell(r('no difference', '3/3', '3/3'), 'en'), 'ceiling 3/3 → 3/3');
    assert.equal(cell(r('no difference', '0/3', '0/3', 'compliance theatre'), 'pl'), 'no difference 0/3 → 0/3 (teatr)');
    assert.equal(status([r('confirmed', '0/3', '3/3'), r('confirmed', '0/3', '2/3')], 'en'), '`SUPPORTED` — confirmed on 2 of 2 models');
    assert.equal(status([r('no difference', '0/3', '0/3')], 'en'), '`NOT_SUPPORTED` — confirmed on 0 of 1 models');
    assert.equal(status([r('confirmed', '0/3', '3/3'), r('no difference', '3/3', '3/3')], 'en'), '`MIXED` — confirmed on 1 of 2 models');
    assert.match(table([r('confirmed', '0/3', '3/3')], 'en'), /\| `x:y` \| \*\*confirmed\*\* 0\/3 → 3\/3 \|/);
    assert.throws(() => fill('<!-- research:typo -->1<!-- /research -->', results, 'en', ROOT), /unknown research block "typo"/);
});
