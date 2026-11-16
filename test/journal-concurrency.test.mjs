import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LOCK_STALE_MS, readJournal, record, repairJournal, verifyJournal, withJournalLock } from '../lib/journal.mjs';
import { tmp } from './helpers.mjs';

const JOURNAL = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'journal.mjs')).href;
const worker = (target, writer, count, extra = '') => `import { record } from ${JSON.stringify(JOURNAL)}; for (let i = 0; i < ${count}; i++) record(${JSON.stringify(target)}, { kind: 'note', item: 'A', text: '${writer} ' + i }${extra});`;
const runAll = (scripts) => Promise.all(scripts.map((s) => new Promise((resolve) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', s], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => resolve({ code, err }));
})));

test('journal: 20 processes writing at once lose nothing, repeat nothing and keep every chain whole', async () => {
    const dir = path.join(tmp(), 'journal');
    const done = await runAll(Array.from({ length: 20 }, (_, w) => worker(dir, `w${w}`, 40, `, { writer: 'w${w}' }`)));
    assert.deepEqual(done.filter((d) => d.code !== 0), [], 'every writer finished');
    const v = verifyJournal(dir);
    assert.equal(v.events, 800);
    assert.equal(v.intact, true, JSON.stringify([v.broken, v.structure.slice(0, 3)]));
    assert.equal(v.sharedClocks, 0, 'no two events share a logical clock value');
    const ev = readJournal(dir);
    assert.equal(new Set(ev.map((e) => e.lc)).size, 800);
    assert.equal(new Set(ev.map((e) => `${e.w}|${e.n}`)).size, 800);
    assert.deepEqual(verifyJournal(dir), v, 'verifying twice gives the same answer');
});

test('journal: processes that share one writer name and one segment still do not collide', async () => {
    const dir = path.join(tmp(), 'journal');
    const done = await runAll(Array.from({ length: 8 }, (_, w) => worker(dir, `p${w}`, 25, ", { writer: 'same' }")));
    assert.deepEqual(done.filter((d) => d.code !== 0), []);
    const v = verifyJournal(dir);
    assert.equal(v.segments, 1);
    assert.equal(v.events, 200);
    assert.equal(v.intact, true, JSON.stringify(v.structure.slice(0, 3)));
});

test('journal: a single-file journal survives concurrent appends too', async () => {
    const file = path.join(tmp(), 'journal.jsonl');
    const done = await runAll(Array.from({ length: 8 }, (_, w) => worker(file, `f${w}`, 25)));
    assert.deepEqual(done.filter((d) => d.code !== 0), []);
    const v = verifyJournal(file);
    assert.equal(v.events, 200);
    assert.equal(v.intact, true);
});

test('journal: two processes opening the same item at once yield exactly one conflict, every time', async () => {
    for (let round = 0; round < 3; round++) {
        const dir = path.join(tmp(), 'journal');
        const open = (w) => `import { record } from ${JSON.stringify(JOURNAL)}; record(${JSON.stringify(dir)}, { kind: 'item.open', item: 'P1' }, { writer: '${w}' });`;
        await runAll([open('ann'), open('bob')]);
        const v = verifyJournal(dir);
        assert.equal(v.intact, true);
        assert.equal(v.conflicts.length, 1);
        assert.notEqual(v.conflicts[0].winner, v.conflicts[0].loser);
    }
});

test('journal: a lock left by a process that died is taken over; a live lock is waited for, then refused', () => {
    const dir = path.join(tmp(), 'journal');
    record(dir, { kind: 'note', text: 'first' }, { writer: 'ann' });
    const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf-8' }).stdout;
    fs.writeFileSync(path.join(dir, '.lock'), JSON.stringify({ pid: Number(dead), host: (await0()), at: Date.now() }));
    record(dir, { kind: 'note', text: 'after a crash' }, { writer: 'ann' });
    assert.equal(readJournal(dir).length, 2);
    // a lock from another machine cannot be probed: it is honoured until it is older than the stale limit
    fs.writeFileSync(path.join(dir, '.lock'), JSON.stringify({ pid: 1, host: 'elsewhere', at: Date.now() }));
    assert.throws(() => withJournalLock(dir, () => 1, { wait: 150 }), /journal is locked/);
    fs.writeFileSync(path.join(dir, '.lock'), JSON.stringify({ pid: 1, host: 'elsewhere', at: Date.now() - LOCK_STALE_MS - 1000 }));
    assert.equal(withJournalLock(dir, () => 'in'), 'in');
    assert.equal(fs.existsSync(path.join(dir, '.lock')), false, 'the lock is released');
});
function await0() {
    return spawnSync(process.execPath, ['-e', "process.stdout.write(require('os').hostname())"], { encoding: 'utf-8' }).stdout;
}

test('journal: a write cut off mid-line is reported, never appended after, and set aside only on request', () => {
    const dir = path.join(tmp(), 'journal');
    for (let i = 0; i < 3; i++) record(dir, { kind: 'note', text: `n${i}` }, { writer: 'ann' });
    const seg = path.join(dir, 'ann.jsonl');
    fs.appendFileSync(seg, '{"at":"2026-01-05T09:00:00.000Z","kind":"note","te');
    assert.equal(readJournal(dir).length, 3, 'the whole events stay readable');
    const v = verifyJournal(dir);
    assert.equal(v.intact, false);
    assert.match(v.structure.map((s) => s.problem).join('; '), /cut off/);
    assert.throws(() => record(dir, { kind: 'note', text: 'next' }, { writer: 'ann' }), /torn line/);
    assert.equal(fs.readFileSync(seg, 'utf-8').split('\n').filter(Boolean).length, 4, 'nothing was repaired silently');
    assert.deepEqual(repairJournal(dir).map((m) => m.to), ['ann.jsonl.torn']);
    assert.equal(verifyJournal(dir).intact, true);
    record(dir, { kind: 'note', text: 'next' }, { writer: 'ann' });
    assert.equal(readJournal(dir).length, 4);
    assert.equal(fs.existsSync(`${seg}.torn`), true, 'the torn line is kept for a person to look at');
});

test('journal: an absent journal is not an intact journal', () => {
    assert.equal(verifyJournal(path.join(tmp(), 'nothing')).intact, false);
});
