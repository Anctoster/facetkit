import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { brokenAt, readJournal, record, verifyJournal } from '../lib/journal.mjs';
import { sha } from '../lib/text.mjs';
import { tmp } from './helpers.mjs';

// what git's core.autocrlf does to a text file on a Windows checkout
const toCRLF = (file) => fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace(/\n/g, '\r\n'));
const olderJournal = () => {
    const file = path.join(tmp(), 'journal.jsonl');
    const a = JSON.stringify({ at: '2026-01-01T00:00:00.000Z', kind: 'note', text: 'one', prev: '00000000' });
    const b = JSON.stringify({ at: '2026-01-01T00:00:01.000Z', kind: 'note', text: 'two', prev: sha(a) });
    const c = JSON.stringify({ at: '2026-01-01T00:00:02.000Z', kind: 'note', text: 'three', prev: sha(b) });
    fs.writeFileSync(file, `${a}\n${b}\n${c}\n`);
    return file;
};

test('journal: a checkout that turns LF into CRLF does not break the chain — the CR is not part of the event', () => {
    const file = olderJournal();
    toCRLF(file);
    assert.equal(brokenAt(file), -1);
    assert.equal(verifyJournal(file).status, 'intact');
    assert.deepEqual(readJournal(file).map((e) => e.text), ['one', 'two', 'three']);
    record(file, { kind: 'note', text: 'appended after the checkout' });
    assert.equal(verifyJournal(file).status, 'intact', 'a file with both endings reads as one history');
    const dir = path.join(tmp(), 'journal');
    for (const t of ['a', 'b']) record(dir, { kind: 'note', text: t }, { writer: 'ann' });
    toCRLF(path.join(dir, 'ann.jsonl'));
    assert.equal(verifyJournal(dir).status, 'intact', 'segments too');
});

test('journal: an edit in a CRLF journal is still found — only the line ending is forgiven', () => {
    const file = olderJournal();
    toCRLF(file);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('"two"', '"TWO"'));
    assert.equal(brokenAt(file), 2);
    assert.equal(verifyJournal(file).status, 'tampered');
    // a CR anywhere but at the very end of a line is not a line ending: the line no longer parses or no longer matches
    const other = olderJournal();
    fs.writeFileSync(other, fs.readFileSync(other, 'utf-8').replace('"two"', '"two"\r\r'));
    assert.notEqual(verifyJournal(other).status, 'intact');
});
