import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { counts, FILES, fill } from '../scripts/counts.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('readme: the numbers the READMEs state are the numbers the sources give (npm run counts writes them)', () => {
    const values = counts(ROOT);
    assert.ok(values.tests > 0 && values.benchmark > 0 && values.hypotheses >= values.untested);
    for (const f of FILES) {
        const text = fs.readFileSync(path.join(ROOT, f), 'utf-8');
        const { stale } = fill(text, values);
        assert.deepEqual(stale, [], `${f} is out of date — run: npm run counts`);
        for (const name of ['tests', 'benchmark', 'untested']) assert.match(text, new RegExp(`<!-- count:${name} -->`), `${f} marks ${name}`);
    }
});

test('readme: a stale or unknown count is named, never passed over', () => {
    const { text, stale } = fill('a <!-- count:tests -->185<!-- /count --> b', { tests: 244 });
    assert.equal(text, 'a <!-- count:tests -->244<!-- /count --> b');
    assert.deepEqual(stale, [{ name: 'tests', was: 185, now: 244 }]);
    assert.throws(() => fill('<!-- count:typo -->1<!-- /count -->', { tests: 1 }), /unknown count "typo"/);
});
