import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

// SECURITY.md states the threat model every guarantee is measured against; a guarantee without it has no meaning.
const doc = fs.readFileSync(new URL('../SECURITY.md', import.meta.url), 'utf-8');

test('security: the threat model names the four sources of harm and what is out of scope', () => {
    assert.match(doc, /^## Threat model$/m);
    for (const source of ['An agent that errs', 'An agent that games the record', 'Foreign content', 'Accidents']) assert.ok(doc.includes(source), source);
    assert.match(doc, /Out of scope: whoever controls the machine or the repository/);
});

test('security: every guarantee says what it rests on and when it does not hold', () => {
    const section = doc.split(/^## What each guarantee rests on$/m)[1]?.split(/^## /m)[0] ?? '';
    const rows = section.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Guarantee') && !l.startsWith('|---'));
    assert.ok(rows.length >= 5, 'guarantee rows');
    for (const r of rows) {
        const cells = r.split('|').slice(1, -1).map((c) => c.trim());
        assert.equal(cells.length, 4, r);
        assert.ok(cells.every(Boolean), `empty cell in: ${r}`);
    }
});
