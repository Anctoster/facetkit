import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { counts, FILES, fill } from '../scripts/counts.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('readme: every README marks the numbers that npm run counts writes at release', () => {
    const values = counts(ROOT);
    assert.ok(values.tests > 0 && values.benchmark > 0 && values.hypotheses >= values.untested);
    for (const f of FILES) {
        const text = fs.readFileSync(path.join(ROOT, f), 'utf-8');
        fill(text, values); // every marked name is known; whether the numbers are current is checked at release (scripts/release-check.mjs)
        for (const name of ['tests', 'benchmark', 'untested']) assert.match(text, new RegExp(`<!-- count:${name} -->`), `${f} marks ${name}`);
    }
});

test('readme: a stale or unknown count is named, never passed over', () => {
    const { text, stale } = fill('a <!-- count:tests -->185<!-- /count --> b', { tests: 244 });
    assert.equal(text, 'a <!-- count:tests -->244<!-- /count --> b');
    assert.deepEqual(stale, [{ name: 'tests', was: 185, now: 244 }]);
    assert.throws(() => fill('<!-- count:typo -->1<!-- /count -->', { tests: 1 }), /unknown count "typo"/);
});
