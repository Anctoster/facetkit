// journal: an append-only record of events is the only state the team has. Everything else —
// where an item stands, what to do next, what it cost, how each agent and model performs, what
// the schedule looks like, how far a result can be trusted — is computed from it.
//
// One file is enough for one person. For many people and many teams the journal is a directory of
// segments: every writer appends only to its own file, so two clones never edit the same file and
// any file transport (git, a shared folder, object storage) merges them by taking the union.
// Events from different writers are ordered by a logical clock that every append advances past
// everything the writer has seen. Each segment is hash-chained: history can grow, not be rewritten.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canon } from './canon.mjs';
import { sha, sha256 } from './text.mjs';

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'writer';
/** Who is appending: FACET_WRITER, or the OS user plus a short hash of the machine name. */
/** The run that is appending (an agent session), and who it acts for — optional; old events carry neither. */
export const sessionId = () => (process.env.FACET_SESSION ? slug(process.env.FACET_SESSION) : null);
export const actorId = () => (process.env.FACET_ACTOR ? slug(process.env.FACET_ACTOR) : null);
const identity = () => ({ ...(sessionId() ? { s: sessionId() } : {}), ...(actorId() ? { actor: actorId() } : {}) });
// ---- authorship ----------------------------------------------------------------------------
// A hash chain shows that history was not edited by accident; anybody who can write the file can
// recompute it. Authorship needs a key: when a signer is set (see lib/sign.mjs), every event's id
// is signed, and a reader who trusts the public key can tell who wrote it.
let signer = null;
/** `fn(id)` returns { k: key id, s: signature } — or pass null to stop signing. */
export const setSigner = (fn) => {
    signer = fn;
};
const signed = (e) => (signer && e.id ? { ...e, sg: signer(e.id) } : e);
/** Counts over events: signed by a trusted key, by an unknown key, with a signature that does not verify, or not signed. `keys` maps key id → verify(id, signature). */
export function signatureReport(events, keys = null) {
    const r = { signed: 0, unknown: 0, bad: 0, unsigned: 0, by: {} };
    for (const e of events) {
        if (!e.sg) r.unsigned++;
        else if (!keys) r.unknown++;
        else if (!keys[e.sg.k]) r.unknown++;
        else if (keys[e.sg.k](e.id, e.sg.s)) {
            r.signed++;
            r.by[e.sg.k] = (r.by[e.sg.k] ?? 0) + 1;
        } else r.bad++;
    }
    return r;
}
// ---- schema --------------------------------------------------------------------------------
// Schema 2 (v: 2): an event's id is the full SHA-256 of its canonical text without id and signature,
// and `prev` is the id of the event before it. A signature over the id therefore covers the event,
// its place in the chain, its writer, number and epoch. Events written before (no `v`) keep their
// rules — a 12-character SHA-1 id and an 8-character SHA-1 of the line before — and are read, never
// rewritten. Once a segment holds a schema-2 event, an older-format event after it breaks the chain:
// otherwise one appended line would bring the 32-bit link back.
export const SCHEMA = 2;
const GENESIS = '00000000';
/** The schema-2 id of an event: SHA-256 over its canonical text without id and signature. */
export const eventId = (e) => {
    const { id: _id, sg: _signature, ...rest } = e;
    return sha256(canon(rest));
};
/** An event's id is the hash of everything else in it: two events cannot share one, and an edited event no longer matches its own. */
const withId = (e) => {
    const full = { ...e, v: SCHEMA };
    return { ...full, id: eventId(full) };
};
/** What the next event points at: a schema-2 event's id, recomputed (null when it does not match — the event was edited); an older event's line hash. */
const linkOf = (line, e = parse(line)) => (e?.v === SCHEMA ? (eventId(e) === e.id ? e.id : null) : sha(line));
export const writerId = () => slug(process.env.FACET_WRITER ?? `${os.userInfo().username}-${sha(os.hostname(), 4)}`);
export const isSegmented = (target) => (fs.existsSync(target) ? fs.statSync(target).isDirectory() : !target.endsWith('.jsonl'));

function segments(dir) {
    const out = [];
    const visit = (abs) => {
        for (const entry of fs.existsSync(abs) ? fs.readdirSync(abs, { withFileTypes: true }) : []) {
            if (entry.isDirectory()) visit(path.join(abs, entry.name));
            else if (entry.name.endsWith('.jsonl')) out.push(path.join(abs, entry.name));
        }
    };
    visit(dir);
    return out.sort();
}
// facet writes every line with LF alone. A checkout with git's core.autocrlf (the default on Windows)
// adds a CR before each LF; that CR is not part of the event, and an older-format link is a hash of
// the line's bytes, so it is taken off before anything is hashed. One CR, at the end only: what the
// line held when it was written is restored, nothing else is forgiven.
const splitLines = (text) => text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l)).filter(Boolean);
const linesOf = (file) => (fs.existsSync(file) ? splitLines(fs.readFileSync(file, 'utf-8')) : []);
const parse = (line) => {
    try {
        return JSON.parse(line);
    } catch {
        return null;
    }
};
/** Lines that are whole events. A torn line (a writer died mid-append) is skipped here and reported by verifyJournal. */
const eventsOf = (file) => {
    const lines = linesOf(file);
    const c = chain(lines);
    // fenced lines are not history; lines after a break are still read, so that a damaged journal can be inspected (verifyJournal says it is damaged)
    const fenced = new Set(c.fenced.map((f) => f.line));
    return lines.filter((_, i) => !fenced.has(i + 1)).map(parse).filter(Boolean);
};

// ---- the writer protocol -----------------------------------------------------------------
// Appending is read-then-write: the next `n`, the logical clock and `prev` all depend on what is
// already there. Two processes doing that at once would hand out the same numbers, so the whole
// sequence runs under one lock per journal. The lock is a file created with the exclusive flag —
// atomic on local file systems — holding the owner's pid, host and time.
//
// A lock left behind by a process that died is taken over, never waited on forever: at once when
// the owner ran on this machine and its pid is gone, otherwise after LOCK_STALE_MS. Network and
// synchronised folders do not all honour exclusive create; there, give every machine its own
// FACET_WRITER and let the transport merge segments, rather than share one working copy.
export const LOCK_STALE_MS = 30000;
const LOCK_WAIT_MS = 15000;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export const lockFile = (target) => (isSegmented(target) ? path.join(target, '.lock') : `${target}.lock`);
const alive = (pid) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return e.code === 'EPERM';
    }
};
/** When a process started, as the system counts it (Linux); null where that cannot be read. Tells a live owner from a reused pid. */
const startOf = (pid) => {
    try {
        return fs.readFileSync(`/proc/${pid}/stat`, 'utf-8').split(') ').at(-1).split(' ')[19] ?? null;
    } catch {
        return null;
    }
};
const readLock = (file) => {
    try {
        const text = fs.readFileSync(file, 'utf-8');
        return { text, owner: parse(text) ?? {}, mtime: fs.statSync(file).mtimeMs };
    } catch {
        return null;
    }
};
// ---- fencing -------------------------------------------------------------------------------
// A lock cannot stop a process that was paused while holding it and wakes up after somebody else
// took over. So every forced takeover raises the journal's epoch, every event carries the epoch
// it was written under, and readers settle a fork by a fixed rule (see `chain`): the event written
// under the higher epoch stands, the other is set aside as fenced. The lock makes forks rare;
// the epoch makes them harmless — correctness never rests on the lock alone.
const epochFile = (target) => `${lockFile(target)}.epoch`;
export const epochOf = (target) => {
    try {
        return Number(fs.readFileSync(epochFile(target), 'utf-8')) || 0;
    } catch {
        return 0;
    }
};
function raiseEpoch(target) {
    const next = epochOf(target) + 1;
    const tmp = `${epochFile(target)}.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmp, String(next));
    fs.renameSync(tmp, epochFile(target));
    return next;
}
/**
 * May this lock be taken over? Only when its owner is known to be gone: its process no longer
 * exists on this machine (or the pid now belongs to another process), or it was written on
 * another machine longer ago than `stale`. A lock whose owner is alive on this machine is never
 * taken, however old: that is a decision for a person (`facet journal unlock`).
 */
export function lockVerdict(owner, { stale = LOCK_STALE_MS, mtime = Date.now(), now = Date.now(), host = os.hostname() } = {}) {
    const age = now - (owner.at ?? mtime);
    if (owner.host === host && Number.isInteger(owner.pid)) {
        if (!alive(owner.pid)) return { take: true, why: 'its process is gone', age };
        const started = startOf(owner.pid);
        if (owner.start && started && owner.start !== started) return { take: true, why: 'its pid now belongs to another process', age };
        return { take: false, why: 'its process is alive', age };
    }
    return age > stale ? { take: true, why: `written on ${owner.host ?? 'an unknown machine'} ${Math.round(age / 1000)} s ago`, age } : { take: false, why: 'held on another machine', age };
}
/** Removes exactly the lock that was judged, and no other: the file is moved aside first and put back if it turns out to be a newer one. */
function takeOver(target, judged) {
    const file = lockFile(target);
    const aside = `${file}.${process.pid}.${Date.now()}.taken`;
    try {
        fs.renameSync(file, aside);
    } catch {
        return false; // somebody else was faster
    }
    let moved = null;
    try {
        moved = fs.readFileSync(aside, 'utf-8');
    } catch { /* gone */ }
    if (moved !== judged) { // between our judgement and the move a new owner arrived: give its lock back
        try {
            fs.linkSync(aside, file);
        } catch { /* a third process holds a fresh lock; the returned owner is fenced by the epoch */ }
        fs.rmSync(aside, { force: true });
        return false;
    }
    raiseEpoch(target);
    fs.rmSync(aside, { force: true });
    return true;
}

/** Runs `fn(lock)` while holding the journal's lock; `lock.epoch` is the epoch to write under, `lock.held()` says whether the lock is still ours. Throws after `wait` rather than write unlocked. */
export function withJournalLock(target, fn, { wait = LOCK_WAIT_MS, stale = LOCK_STALE_MS } = {}) {
    const file = lockFile(target);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const until = Date.now() + wait;
    const token = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`;
    for (;;) {
        try {
            const fd = fs.openSync(file, 'wx');
            fs.writeSync(fd, JSON.stringify({ pid: process.pid, host: os.hostname(), at: Date.now(), start: startOf(process.pid), token }));
            fs.closeSync(fd);
            break;
        } catch (e) {
            // Windows answers EPERM, not EEXIST, while another process is deleting the lock file: that
            // is contention too. A real permission problem is still raised, once the wait is over.
            const busy = e.code === 'EEXIST' || (process.platform === 'win32' && (e.code === 'EPERM' || e.code === 'EACCES'));
            if (!busy) throw e;
            if (e.code !== 'EEXIST') {
                if (Date.now() > until) throw e;
                sleep(5 + Math.floor(Math.random() * 20));
                continue;
            }
            const seen = readLock(file); // the holder may release between our failed create and this read: then simply compete again
            if (!seen) continue;
            const verdict = lockVerdict(seen.owner, { stale, mtime: seen.mtime });
            if (verdict.take) {
                takeOver(target, seen.text);
                continue;
            }
            if (Date.now() > until) throw new Error(`journal is locked by pid ${seen.owner.pid ?? '?'} on ${seen.owner.host ?? '?'} for ${Math.round(verdict.age / 1000)} s (${verdict.why}): ${file} — if that process is stuck, stop it or run \`facet journal unlock\``);
            sleep(5 + Math.floor(Math.random() * 20));
        }
    }
    const held = () => readLock(file)?.owner.token === token;
    try {
        return fn({ epoch: epochOf(target), held });
    } finally {
        // never remove a lock that is no longer ours; on Windows a file another process is reading cannot be
        // deleted for a moment (EPERM/EBUSY): retry rather than fail a writer whose event is already written
        if (held()) fs.rmSync(file, { force: true, recursive: true, maxRetries: 20, retryDelay: 5 });
    }
}
/** A person's decision to remove a lock whose owner is stuck: the epoch is raised, so whatever that owner still writes is fenced. */
export function forceUnlock(target) {
    const seen = readLock(lockFile(target));
    if (!seen) return null;
    return takeOver(target, seen.text) ? seen.owner : null;
}

/**
 * The accepted history of one segment. A line continues the chain when its `prev` is the hash of
 * the accepted line before it. A line that points further back is a fork: two writers appended
 * from the same place. The one written under the higher epoch stands; a fork inside one epoch
 * keeps what was written first. Anything else that does not fit is where the chain is broken.
 * Returns { accepted: [raw lines], fenced: [{ line, why }], broken: index or -1 }.
 */
export const FORK_DEPTH = 8;
export function chain(lines) {
    const accepted = [];
    const hashes = [];
    const fenced = [];
    let current = false; // a schema-2 event has been accepted: from here on only schema-2 events continue the chain
    for (let i = 0; i < lines.length; i++) {
        const e = parse(lines[i]);
        if (e === null) return { accepted, fenced, broken: i };
        if (e.v !== undefined && e.v !== SCHEMA) return { accepted, fenced, broken: i }; // a schema this reader does not know
        if (current && e.v !== SCHEMA) return { accepted, fenced, broken: i };
        const link = linkOf(lines[i], e);
        if (link === null) return { accepted, fenced, broken: i };
        const top = hashes.length ? hashes.at(-1) : GENESIS;
        if (e.prev === top) {
            accepted.push(lines[i]);
            hashes.push(link);
            current ||= e.v === SCHEMA;
            continue;
        }
        let j = -2;
        for (let k = hashes.length - 2; k >= Math.max(-1, hashes.length - 1 - FORK_DEPTH); k--) if ((k < 0 ? GENESIS : hashes[k]) === e.prev) {
            j = k;
            break;
        }
        if (j === -2) return { accepted, fenced, broken: i };
        const displaced = accepted.slice(j + 1).map(parse);
        const ep = e.ep ?? 0;
        if (displaced.every((d) => (d.ep ?? 0) < ep)) { // the newer epoch wins: what the fenced writer appended is set aside
            for (let k = j + 1; k < accepted.length; k++) fenced.push({ line: lines.indexOf(accepted[k]) + 1, why: `written under epoch ${parse(accepted[k]).ep ?? 0} after epoch ${ep} had taken over` });
            accepted.length = j + 1;
            hashes.length = j + 1;
            accepted.push(lines[i]);
            hashes.push(link);
        } else if (displaced.some((d) => (d.ep ?? 0) > ep)) fenced.push({ line: i + 1, why: `written under epoch ${ep} after a later epoch had taken over` });
        // no takeover separates the two writers: the lock itself was bypassed or not honoured. The first one stands, and it is reported as damage.
        else fenced.push({ line: i + 1, unlocked: true, why: `a second writer appended from the same place in epoch ${ep}: the lock was not honoured` });
    }
    return { accepted, fenced: fenced.sort((a, b) => a.line - b.line), broken: -1 };
}
/** A segment whose last line is not a whole event cannot be appended to: the chain would start from garbage. */
function refuseTorn(file, lines) {
    if (lines.length && parse(lines.at(-1)) === null) throw new Error(`journal segment ends in a torn line: ${file} — run \`facet journal repair\` to set it aside, then retry`);
}

/** All events in one order: a file as written; segments merged by logical clock, then time, then writer. */
export function readJournal(target) {
    if (!target || !fs.existsSync(target)) return [];
    if (!isSegmented(target)) return eventsOf(target);
    const all = segments(target).flatMap(eventsOf);
    return all.sort((a, b) => (a.lc ?? 0) - (b.lc ?? 0) || a.at.localeCompare(b.at) || String(a.w).localeCompare(String(b.w)) || (a.n ?? 0) - (b.n ?? 0));
}

/** Appends one event, atomically with respect to every other writer of this journal. `at` may be given (imports, tests); otherwise it is now. */
export function record(target, event, { writer = writerId(), team } = {}) {
    if (!isSegmented(target)) fs.mkdirSync(path.dirname(target), { recursive: true });
    else fs.mkdirSync(target, { recursive: true });
    return withJournalLock(target, (lock) => {
        const ep = lock.epoch ? { ep: lock.epoch } : {}; // journals that never saw a takeover stay as they were
        const append = (file, full) => {
            if (!lock.held()) throw new Error(`the journal lock was taken over while this process was writing (it was paused or too slow): nothing was appended — run the command again`);
            fs.appendFileSync(file, `${JSON.stringify(signed(full))}\n`);
            return full;
        };
        if (!isSegmented(target)) {
            const lines = linesOf(target);
            refuseTorn(target, lines);
            const prev = chain(lines).accepted.at(-1); // a fenced line is not something to continue from
            return append(target, withId({ at: event.at ?? new Date().toISOString(), ...event, ...identity(), ...ep, prev: prev ? linkOf(prev) : GENESIS }));
        }
        const file = path.join(target, ...(team ? [slug(team)] : []), `${writer}.jsonl`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const raw = linesOf(file);
        refuseTorn(file, raw);
        const mine = chain(raw).accepted;
        const seen = readJournal(target).reduce((m, e) => Math.max(m, e.lc ?? 0), 0);
        return append(file, withId({ at: event.at ?? new Date().toISOString(), ...event, ...identity(), ...ep, w: writer, ...(team ? { team } : {}), n: mine.length + 1, lc: seen + 1, prev: mine.length ? linkOf(mine.at(-1)) : GENESIS }));
    });
}

const brokenIn = (lines) => chain(lines).broken;
/** Index of the first line of a single-file journal that does not follow the line before it, or -1. */
export const brokenAt = (file) => brokenIn(linesOf(file));
/** The same check for lines held in memory (a proof bundle carries its journal with it). */
export const brokenLines = (lines) => brokenIn(lines);

/** What is wrong with the shape of one segment, beyond its hash chain: torn lines, numbering, clock, writer. */
function structureOf(file, name, segmented, ids = new Set()) {
    const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
    const all = splitLines(raw);
    const setAside = new Set(chain(all).fenced.map((f) => f.line));
    const lines = all.filter((_, i) => !setAside.has(i + 1)); // fenced lines are reported apart; they are not part of the sequence
    const out = [];
    const add = (line, problem) => out.push({ segment: name, line, problem });
    if (raw.length && !raw.endsWith('\n')) add(lines.length, 'last line has no end: a write was cut off');
    let lc = 0;
    const seen = new Set();
    const owner = path.basename(file, '.jsonl');
    lines.forEach((line, i) => {
        const e = parse(line);
        if (e === null) return add(i + 1, 'not an event (torn or edited line)');
        if (e.id !== undefined) { // events written before 0.6 have no id and are accepted as they are
            const { id, sg: _signature, ...rest } = e;
            const expected = e.v === SCHEMA ? eventId(e) : sha(JSON.stringify(rest), 12);
            if (expected !== id) add(i + 1, `event id ${id} does not match the event`);
            if (ids.has(id)) add(i + 1, `event id ${id} is used twice`);
            ids.add(id);
        }
        if (!segmented) return undefined;
        if (e.n !== i + 1) add(i + 1, seen.has(e.n) ? `sequence number ${e.n} is used twice` : `sequence number ${e.n}, expected ${i + 1}`);
        seen.add(e.n);
        if (e.w !== owner) add(i + 1, `written by "${e.w}" into the segment of "${owner}"`);
        if (!(e.lc > lc)) add(i + 1, `logical clock ${e.lc} does not advance past ${lc}`);
        lc = Math.max(lc, e.lc ?? 0);
        return undefined;
    });
    return out;
}

/**
 * Signatures a project requires (govern.signEvents: "required"): every schema-2 event signed by a key
 * the project trusts. A schema-2 id covers the event and its place in the chain, so an unsigned or
 * re-signed event is damage, not a missing extra. Older-format events are not asked for signatures —
 * they could not carry a signature worth having.
 */
function unsignedOf(files, nameOf, keys) {
    const out = [];
    for (const file of files) {
        linesOf(file).forEach((line, i) => {
            const e = parse(line);
            if (e?.v !== SCHEMA) return;
            if (!e.sg) out.push({ segment: nameOf(file), line: i + 1, id: e.id, problem: 'not signed, and govern.signEvents is "required"' });
            else if (!keys?.[e.sg.k]) out.push({ segment: nameOf(file), line: i + 1, id: e.id, problem: `signed by key ${e.sg.k}, which this project does not trust` });
        });
    }
    return out;
}

/**
 * Integrity of the whole journal: every segment's hash chain, its structure, and items claimed by
 * more than one writer. `intact` is the single answer governance asks for. With `require`, every
 * schema-2 event must also be signed by one of `keys` (see unsignedOf).
 */
export function verifyJournal(target, { keys = null, require = false } = {}) {
    const segmented = isSegmented(target);
    const files = segmented ? segments(target) : fs.existsSync(target) ? [target] : [];
    const nameOf = (file) => path.relative(segmented ? target : path.dirname(target), file);
    const broken = files.map((file) => ({ segment: nameOf(file), line: brokenIn(linesOf(file)) + 1 })).filter((b) => b.line > 0);
    const ids = new Set();
    const structure = files.flatMap((file) => structureOf(file, nameOf(file), segmented, ids));
    const events = readJournal(target);
    const clocks = new Map();
    for (const e of events) if (e.lc !== undefined) clocks.set(e.lc, (clocks.get(e.lc) ?? 0) + 1);
    // the same clock value in two segments is legal when two clones wrote without seeing each other;
    // inside one working copy it means the lock was bypassed, so it is reported, not judged
    const sharedClocks = [...clocks.values()].filter((n) => n > 1).length;
    const fenced = files.flatMap((file) => chain(linesOf(file)).fenced.map((f) => ({ segment: nameOf(file), ...f })));
    for (const f of fenced.filter((x) => x.unlocked)) structure.push({ segment: f.segment, line: f.line, problem: f.why });
    const signatures = signatureReport(files.flatMap((file) => linesOf(file).map(parse).filter(Boolean)), keys);
    const unsigned = require ? unsignedOf(files, nameOf, keys) : [];
    const intact = files.length > 0 && broken.length === 0 && structure.length === 0 && signatures.bad === 0 && unsigned.length === 0;
    const claims = conflicts(events);
    // one word for what is wrong, most serious first
    const status = !files.length ? 'empty' : structure.some((x) => /cut off|not an event/.test(x.problem)) ? 'torn' : broken.length ? 'tampered' : structure.length ? 'malformed' : claims.length ? 'conflict' : 'intact';
    const legacy = events.filter((e) => e.v === undefined).length; // older-format events: read and checked by their own, weaker rules
    return { segments: files.length, events: events.length, legacy, broken, structure, fenced, signatures, unsigned, epoch: epochOf(target), sharedClocks, conflicts: claims, intact, status: signatures.bad || unsigned.length ? 'tampered' : status };
}

/** Sets a torn tail aside in `<segment>.torn` so that the segment can be appended to again. Never silent: returns what it moved. */
export function repairJournal(target) {
    const files = isSegmented(target) ? segments(target) : fs.existsSync(target) ? [target] : [];
    return withJournalLock(target, () => {
        const moved = [];
        for (const file of files) {
            let lines = linesOf(file);
            if (lines.length && parse(lines.at(-1)) === null) {
                fs.appendFileSync(`${file}.torn`, `${lines.at(-1)}\n`);
                moved.push({ segment: path.basename(file), line: lines.length, to: `${path.basename(file)}.torn` });
                lines = lines.slice(0, -1);
            }
            // lines that lost a fork are kept apart, never deleted: what stays is one whole chain
            const lost = chain(lines).fenced;
            for (const f of lost) {
                fs.appendFileSync(`${file}.fenced`, `${lines[f.line - 1]}\n`);
                moved.push({ segment: path.basename(file), line: f.line, to: `${path.basename(file)}.fenced` });
            }
            const gone = new Set(lost.map((f) => f.line));
            if (moved.some((m) => m.segment === path.basename(file))) fs.writeFileSync(file, lines.filter((_, i) => !gone.has(i + 1)).map((l) => `${l}\n`).join(''));
        }
        return moved;
    });
}

/** Items that two writers opened at the same time. The earlier claim wins; the other must yield. */
export function conflicts(events) {
    const holder = new Map();
    const out = [];
    for (const e of events) {
        if (e.kind === 'item.open') {
            const h = holder.get(e.item);
            if (h && h !== (e.w ?? null)) out.push({ item: e.item, winner: h, loser: e.w ?? null });
            else holder.set(e.item, e.w ?? null);
        } else if (e.kind === 'item.close' || e.kind === 'item.yield') holder.delete(e.item);
    }
    return out;
}

export const ofItem = (events, item) => events.filter((e) => e.item === item);
/** Items that are open; with `writer`, only the ones that writer holds. */
export const openItems = (events, writer) => {
    const open = new Map();
    for (const e of events) {
        if (e.kind === 'item.open' && !open.has(e.item)) open.set(e.item, e);
        if (e.kind === 'item.close' || (e.kind === 'item.yield' && open.get(e.item)?.w === e.w)) open.delete(e.item);
    }
    return [...open.entries()].filter(([, e]) => writer === undefined || (e.w ?? null) === writer).map(([item]) => item);
};
export const holderOf = (events, item) => events.filter((e) => e.item === item && e.kind === 'item.open').at(0)?.w ?? null;
export const closedItems = (events) => events.filter((e) => e.kind === 'item.close').map((e) => e.item);
export const minutesBetween = (a, b) => +((new Date(b) - new Date(a)) / 60000).toFixed(1);
