import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readJournal, record, setSigner, verifyJournal } from '../lib/journal.mjs';
import { eventSigner, eventVerifiers, newKey } from '../lib/sign.mjs';
import { tmp, write } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');
const trustOf = (...keys) => eventVerifiers({ keys: keys.map((k) => ({ id: k.id, pub: k.pub })) });
const writeSigned = (file, key, texts) => {
    setSigner(eventSigner(key));
    try {
        for (const t of texts) record(file, { kind: 'note', text: t });
    } finally {
        setSigner(null);
    }
};
const stripSignature = (file, n) => {
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
    const { sg: _sg, ...rest } = JSON.parse(lines[n]);
    lines[n] = JSON.stringify(rest);
    fs.writeFileSync(file, `${lines.join('\n')}\n`);
};

test('signatures required: a signature taken off an event is damage, though the chain is whole', () => {
    const key = newKey();
    const file = path.join(tmp(), 'journal.jsonl');
    writeSigned(file, key, ['one', 'two', 'three']);
    const keys = trustOf(key);
    assert.equal(verifyJournal(file, { keys, require: true }).status, 'intact');
    stripSignature(file, 1);
    assert.equal(verifyJournal(file, { keys }).status, 'intact', 'without the requirement a missing signature is only counted');
    const v = verifyJournal(file, { keys, require: true });
    assert.deepEqual([v.status, v.intact, v.unsigned.length, v.unsigned[0].line, v.broken.length], ['tampered', false, 1, 2, 0]);
});

test('signatures required: an event signed by a key the project does not trust is damage too', () => {
    const ours = newKey();
    const theirs = newKey();
    const file = path.join(tmp(), 'journal.jsonl');
    writeSigned(file, ours, ['one']);
    writeSigned(file, theirs, ['two']);
    const v = verifyJournal(file, { keys: trustOf(ours), require: true });
    assert.equal(v.status, 'tampered');
    assert.match(v.unsigned[0].problem, /does not trust/);
});

test('signatures required: a schema-2 event written unsigned before the requirement is damage too; older-format events are not asked', () => {
    const key = newKey();
    const file = path.join(tmp(), 'journal.jsonl');
    fs.writeFileSync(file, `${JSON.stringify({ at: '2026-01-01T00:00:00.000Z', kind: 'note', text: 'older format', prev: '00000000' })}\n`);
    record(file, { kind: 'note', text: 'before the requirement' });
    writeSigned(file, key, ['after']);
    const v = verifyJournal(file, { keys: trustOf(key), require: true });
    assert.equal(v.status, 'tampered');
    assert.deepEqual(v.unsigned.map((u) => u.line), [2], 'only the unsigned schema-2 event, not the older-format one');
    assert.equal(verifyJournal(file, { keys: trustOf(key) }).status, 'intact', 'without the requirement nothing is asked');
});

test('signatures required: a writer that would throw while signing appends nothing', () => {
    const file = path.join(tmp(), 'journal.jsonl');
    record(file, { kind: 'note', text: 'one' });
    const before = fs.readFileSync(file, 'utf-8');
    setSigner(() => {
        throw new Error('no key');
    });
    try {
        assert.throws(() => record(file, { kind: 'note', text: 'two' }), /no key/);
    } finally {
        setSigner(null);
    }
    assert.equal(fs.readFileSync(file, 'utf-8'), before);
});

test('cli: with signatures required, a machine without a key writes nothing; with a trusted key it does, and a stripped signature is reported', () => {
    const root = tmp();
    const keys = tmp();
    write(root, 'package.json', JSON.stringify({ facetkit: { journal: '.facet/journal.jsonl', govern: { signEvents: 'required' } } }));
    write(root, 'routing.json', JSON.stringify({ items: { A: { deps: [], route: [], gates: [] }, B: { deps: [], route: [], gates: [] } } }));
    const env = { ...process.env, FACET_KEYS: keys, FACET_KEY: '' };
    delete env.FACET_KEY;
    const f = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf-8', env });
    const refused = f('flow', 'open', 'A');
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /signEvents is "required" and this machine has no key/);
    const journal = path.join(root, '.facet', 'journal.jsonl');
    assert.equal(fs.existsSync(journal) ? fs.readFileSync(journal, 'utf-8') : '', '');
    assert.equal(f('key', 'new').status, 0);
    const trusted = f('key', 'trust', '--name', 'ann', '--role', 'writer');
    assert.equal(trusted.status, 0, trusted.stderr);
    const opened = f('flow', 'open', 'A');
    assert.equal(opened.status, 0, opened.stderr);
    assert.equal(f('journal').status, 0);
    stripSignature(journal, 0);
    const checked = f('journal');
    assert.equal(checked.status, 1);
    assert.match(checked.stderr, /not signed, and govern.signEvents is "required"/);
});

test('cli: govern.signEvents is "off", "on" or "required" — "off" signs nothing even with a key at hand; another value is an error', () => {
    const run = (signEvents) => {
        const root = tmp();
        write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal', govern: { signEvents } }));
        write(root, 'facet.items.json', JSON.stringify({ items: { A: { deps: [], route: [], gates: [] } } }));
        const env = { ...process.env, FACET_KEYS: path.join(tmp(), 'keys'), FACET_WRITER: 'ann' };
        const f = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf-8', env });
        f('key', 'new');
        return { r: f('flow', 'open', 'A'), events: () => readJournal(path.join(root, '.facet', 'journal')) };
    };
    const off = run('off');
    assert.equal(off.r.status, 0, off.r.stderr);
    assert.ok(off.events().length && off.events().every((e) => !e.sg), '"off" is off, although the string is not empty');
    const on = run('on');
    assert.ok(on.events().every((e) => e.sg));
    const typo = run('requried');
    assert.notEqual(typo.r.status, 0);
    assert.match(typo.r.stderr, /govern\.signEvents is "requried": use "off", "on" or "required"/);
});
