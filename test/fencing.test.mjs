import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { chain, epochOf, forceUnlock, lockFile, lockVerdict, readJournal, record, repairJournal, verifyJournal, withJournalLock } from '../lib/journal.mjs';
import { sha } from '../lib/text.mjs';
import { tmp } from './helpers.mjs';

const line = (prev, ep, extra = {}) => JSON.stringify({ at: '2026-01-01T00:00:00.000Z', kind: 'note', ...extra, ...(ep ? { ep } : {}), prev });

test('lock: an owner that is alive on this machine is never taken over, however old the lock is', () => {
    const mine = { pid: process.pid, host: os.hostname(), at: Date.now() - 10 * 60 * 1000 };
    assert.deepEqual([lockVerdict(mine).take, lockVerdict(mine).why], [false, 'its process is alive']);
    assert.equal(lockVerdict({ ...mine, pid: 2 ** 22 + 12345 }).take, true, 'a process that no longer exists');
    assert.equal(lockVerdict({ ...mine, start: 'not-this-process' }).take, fs.existsSync('/proc/self/stat'), 'the pid was reused by another process (where start times can be read)');
    assert.equal(lockVerdict({ pid: 1, host: 'elsewhere', at: Date.now() - 1000 }).take, false, 'another machine, recent');
    assert.equal(lockVerdict({ pid: 1, host: 'elsewhere', at: Date.now() - 60000 }).take, true, 'another machine, stale: safe because the takeover raises the epoch');
});

test('lock: a live owner makes the others wait and fail loudly; the owner releases only its own lock', () => {
    const file = path.join(tmp(), 'j.jsonl');
    withJournalLock(file, (lock) => {
        assert.equal(lock.held(), true);
        fs.writeFileSync(lockFile(file), JSON.stringify({ pid: process.pid, host: os.hostname(), at: Date.now() - 120000, token: 'someone-else' }));
        assert.equal(lock.held(), false, 'the lock is no longer ours');
        assert.throws(() => withJournalLock(file, () => 1, { wait: 60 }), /its process is alive.*facet journal unlock/s);
    });
    assert.ok(fs.existsSync(lockFile(file)), 'a lock that belongs to somebody else is not removed on release');
    assert.equal(forceUnlock(file).token, 'someone-else');
    assert.equal(epochOf(file), 1, 'a forced unlock raises the epoch');
    assert.equal(withJournalLock(file, (lock) => lock.epoch), 1);
});

test('fencing: a writer that lost the lock mid-write appends nothing', () => {
    const file = path.join(tmp(), 'j.jsonl');
    record(file, { kind: 'note', text: 'one' });
    const real = fs.appendFileSync;
    // the takeover happens after the lock was acquired and before the append
    const original = fs.readFileSync;
    let stolen = false;
    fs.readFileSync = (f, ...rest) => {
        const out = original(f, ...rest);
        if (!stolen && String(f) === file) {
            stolen = true;
            fs.writeFileSync(lockFile(file), JSON.stringify({ pid: process.pid, host: os.hostname(), at: Date.now(), token: 'the-new-owner' }));
        }
        return out;
    };
    try {
        assert.throws(() => record(file, { kind: 'note', text: 'two' }), /taken over while this process was writing/);
    } finally {
        fs.readFileSync = original;
        fs.appendFileSync = real;
        fs.rmSync(lockFile(file), { force: true });
    }
    assert.deepEqual(readJournal(file).map((e) => e.text), ['one']);
});

test('fencing: of two events appended from the same place, the one under the higher epoch stands — in either order', () => {
    const a = line('00000000', 0, { text: 'a' });
    const old = line(sha(a), 1, { text: 'from the paused writer' });
    const fresh = line(sha(a), 2, { text: 'from the new owner' });
    const lateOld = chain([a, fresh, old]);
    assert.deepEqual([lateOld.accepted.length, lateOld.broken, lateOld.fenced.map((f) => f.line)], [2, -1, [3]]);
    const earlyOld = chain([a, old, fresh]);
    assert.deepEqual([earlyOld.accepted.map((l) => JSON.parse(l).text), earlyOld.fenced.map((f) => f.line)], [['a', 'from the new owner'], [2]]);
    const next = line(sha(fresh), 2, { text: 'continues from the winner' });
    assert.deepEqual(chain([a, old, fresh, next]).accepted.length, 3);
    assert.equal(chain([a, line('deadbeef', 9, { text: 'points nowhere' })]).broken, 1, 'an epoch does not excuse a line that fits no place');
    assert.equal(chain([a, fresh, line(sha(a), 2, { text: 'same epoch' })]).fenced[0].unlocked, true);
});

test('fencing: a real journal with a fenced line reads as one history, stays intact, and continues from the winner', () => {
    const dir = path.join(tmp(), 'journal');
    record(dir, { kind: 'note', text: 'one' }, { writer: 'ann' });
    const file = path.join(dir, 'ann.jsonl');
    const first = fs.readFileSync(file, 'utf-8').trim();
    fs.writeFileSync(`${lockFile(dir)}.epoch`, '1');
    record(dir, { kind: 'note', text: 'two, by the new owner' }, { writer: 'ann' });
    fs.appendFileSync(file, `${JSON.stringify({ at: '2026-01-01T00:00:01.000Z', kind: 'note', text: 'late write of the paused process', w: 'ann', n: 2, lc: 2, prev: sha(first) })}\n`);
    record(dir, { kind: 'note', text: 'three' }, { writer: 'ann' });
    assert.deepEqual(readJournal(dir).map((e) => [e.text, e.n]), [['one', 1], ['two, by the new owner', 2], ['three', 3]]);
    const v = verifyJournal(dir);
    assert.deepEqual([v.intact, v.status, v.fenced.length, v.fenced[0].line, v.epoch], [true, 'intact', 1, 3, 1]);
    assert.deepEqual(repairJournal(dir).map((m) => m.to), ['ann.jsonl.fenced']);
    assert.deepEqual([verifyJournal(dir).fenced.length, verifyJournal(dir).intact, readJournal(dir).length], [0, true, 3]);
});

test('fencing: two writers in one epoch mean the lock was not honoured — that is damage, and repair sets the loser aside', () => {
    const file = path.join(tmp(), 'j.jsonl');
    record(file, { kind: 'note', text: 'one' });
    const first = fs.readFileSync(file, 'utf-8').trim();
    record(file, { kind: 'note', text: 'two' });
    fs.appendFileSync(file, `${line(sha(first), 0, { text: 'unlocked twin' })}\n`);
    const v = verifyJournal(file);
    assert.deepEqual([v.intact, v.status], [false, 'malformed']);
    assert.match(v.structure[0].problem, /lock was not honoured/);
    repairJournal(file);
    assert.equal(verifyJournal(file).intact, true);
    assert.equal(fs.readFileSync(`${file}.fenced`, 'utf-8').includes('unlocked twin'), true);
});
