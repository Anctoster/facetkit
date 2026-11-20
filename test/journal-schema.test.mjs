import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { canon } from '../lib/canon.mjs';
import { SCHEMA, brokenLines, chain, eventId, readJournal, record, verifyJournal } from '../lib/journal.mjs';
import { sha } from '../lib/text.mjs';
import { tmp } from './helpers.mjs';

test('canon: one text for one value, whatever the order of its keys; what JSON cannot carry is refused', () => {
    assert.equal(canon({ b: 1, a: [true, null, 'x', { d: 2, c: 1.5 }] }), '{"a":[true,null,"x",{"c":1.5,"d":2}],"b":1}');
    assert.equal(canon({ b: 1, a: 2 }), canon({ a: 2, b: 1 }));
    assert.equal(canon({ a: undefined, b: 'é"\n' }), '{"b":"é\\"\\n"}', 'an absent value is an absent key; strings are escaped as JSON escapes them');
    assert.equal(canon({ 'é': 1, z: 2, A: 3 }), '{"A":3,"z":2,"é":1}', 'keys by code point');
    for (const bad of [NaN, Infinity, () => 1, Symbol('s'), 1n]) assert.throws(() => canon({ x: bad }), TypeError);
});

test('schema 2: an id is the full SHA-256 of the canonical event, and each event points at the id before it', () => {
    const file = path.join(tmp(), 'journal.jsonl');
    record(file, { kind: 'note', text: 'one' });
    record(file, { kind: 'note', text: 'two' });
    const [a, b] = readJournal(file);
    assert.equal(a.v, SCHEMA);
    assert.match(a.id, /^[0-9a-f]{64}$/);
    assert.equal(a.id, eventId(a));
    assert.equal(b.prev, a.id, 'the link is the id: a signature over the id covers the place in the chain');
    // the same event with its keys in another order has the same id
    const reordered = Object.fromEntries(Object.entries(a).reverse());
    assert.equal(eventId(reordered), a.id);
    assert.equal(verifyJournal(file).status, 'intact');
});

test('schema 2: an edited event breaks the chain by itself — also where only the chain is checked, as in a bundle', () => {
    const file = path.join(tmp(), 'journal.jsonl');
    for (const t of ['one', 'two', 'three']) record(file, { kind: 'note', text: t });
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
    const edited = lines.map((l, i) => (i === 1 ? l.replace('"two"', '"TWO"') : l));
    assert.equal(brokenLines(lines), -1);
    assert.equal(brokenLines(edited), 1);
    // an editor who recomputes the id of the edited event still breaks the link to it
    const e = JSON.parse(edited[1]);
    const forged = JSON.stringify({ ...e, id: eventId(e) });
    assert.equal(brokenLines([lines[0], forged, lines[2]]), 2);
});

test('schema 2: after a schema-2 event an older-format event breaks the chain, so a 32-bit link cannot come back', () => {
    const file = path.join(tmp(), 'journal.jsonl');
    record(file, { kind: 'note', text: 'one' });
    const first = fs.readFileSync(file, 'utf-8').trim();
    const old = JSON.stringify({ at: '2026-01-01T00:00:00.000Z', kind: 'note', text: 'older format', prev: JSON.parse(first).id });
    assert.equal(chain([first, old]).broken, 1);
    fs.appendFileSync(file, `${old}\n`);
    assert.equal(verifyJournal(file).status, 'tampered');
    const future = JSON.stringify({ kind: 'note', v: 3, prev: JSON.parse(first).id });
    assert.equal(chain([first, future]).broken, 1, 'a schema this reader does not know is not taken on trust');
});

test('schema 2: a journal written before is read and continued, never rewritten; older events are counted as such', () => {
    const file = path.join(tmp(), 'journal.jsonl');
    const a = JSON.stringify({ at: '2026-01-01T00:00:00.000Z', kind: 'note', text: 'old one', prev: '00000000' });
    const b = JSON.stringify({ at: '2026-01-01T00:00:01.000Z', kind: 'note', text: 'old two', prev: sha(a) });
    fs.writeFileSync(file, `${a}\n${b}\n`);
    const before = fs.readFileSync(file, 'utf-8');
    record(file, { kind: 'note', text: 'new' });
    const after = fs.readFileSync(file, 'utf-8');
    assert.ok(after.startsWith(before), 'the older lines are untouched');
    const events = readJournal(file);
    assert.deepEqual(events.map((e) => e.v ?? null), [null, null, SCHEMA]);
    assert.equal(events[2].prev, sha(b), 'the first new event points at the last older line by its older-format link');
    const v = verifyJournal(file);
    assert.deepEqual([v.status, v.legacy, v.events], ['intact', 2, 3]);
});
