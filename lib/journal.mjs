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
import { sha } from './text.mjs';

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'writer';
/** Who is appending: FACET_WRITER, or the OS user plus a short hash of the machine name. */
/** The run that is appending (an agent session), and who it acts for — optional; old events carry neither. */
export const sessionId = () => (process.env.FACET_SESSION ? slug(process.env.FACET_SESSION) : null);
export const actorId = () => (process.env.FACET_ACTOR ? slug(process.env.FACET_ACTOR) : null);
const identity = () => ({ ...(sessionId() ? { s: sessionId() } : {}), ...(actorId() ? { actor: actorId() } : {}) });
/** An event's id is the hash of everything else in it: two events cannot share one, and an edited event no longer matches its own. */
const withId = (e) => ({ ...e, id: sha(JSON.stringify(e), 12) });
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
const linesOf = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean) : []);
const parse = (line) => {
    try {
        return JSON.parse(line);
    } catch {
        return null;
    }
};
/** Lines that are whole events. A torn line (a writer died mid-append) is skipped here and reported by verifyJournal. */
const eventsOf = (file) => linesOf(file).map(parse).filter(Boolean);

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
const lockFile = (target) => (isSegmented(target) ? path.join(target, '.lock') : `${target}.lock`);
const alive = (pid) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return e.code === 'EPERM';
    }
};

/** Runs `fn` while holding the journal's lock. Throws after LOCK_WAIT_MS rather than write unlocked. */
export function withJournalLock(target, fn, { wait = LOCK_WAIT_MS, stale = LOCK_STALE_MS } = {}) {
    const file = lockFile(target);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const until = Date.now() + wait;
    for (;;) {
        try {
            const fd = fs.openSync(file, 'wx');
            fs.writeSync(fd, JSON.stringify({ pid: process.pid, host: os.hostname(), at: Date.now() }));
            fs.closeSync(fd);
            break;
        } catch (e) {
            if (e.code !== 'EEXIST') throw e;
            // the holder may release between our failed create and this read: then simply compete again
            let text = null;
            let mtime = Date.now();
            try {
                text = fs.readFileSync(file, 'utf-8');
                mtime = fs.statSync(file).mtimeMs;
            } catch {
                continue;
            }
            const owner = parse(text) ?? {};
            const age = Date.now() - (owner.at ?? mtime);
            const dead = owner.host === os.hostname() && Number.isInteger(owner.pid) && !alive(owner.pid);
            if (dead || age > stale) {
                // take over: remove only the very lock we judged, then compete for a fresh one like everybody else
                try {
                    if (fs.readFileSync(file, 'utf-8') === text) fs.rmSync(file, { force: true });
                } catch {
                    /* somebody else took it over first */
                }
                continue;
            }
            if (Date.now() > until) throw new Error(`journal is locked by pid ${owner.pid ?? '?'} on ${owner.host ?? '?'} for ${Math.round(age / 1000)} s: ${file}`);
            sleep(5 + Math.floor(Math.random() * 20));
        }
    }
    try {
        return fn();
    } finally {
        fs.rmSync(file, { force: true });
    }
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
    return withJournalLock(target, () => {
        if (!isSegmented(target)) {
            const lines = linesOf(target);
            refuseTorn(target, lines);
            const prev = lines.at(-1);
            const full = withId({ at: event.at ?? new Date().toISOString(), ...event, ...identity(), prev: prev ? sha(prev) : '00000000' });
            fs.appendFileSync(target, `${JSON.stringify(full)}\n`);
            return full;
        }
        const file = path.join(target, ...(team ? [slug(team)] : []), `${writer}.jsonl`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const mine = linesOf(file);
        refuseTorn(file, mine);
        const seen = readJournal(target).reduce((m, e) => Math.max(m, e.lc ?? 0), 0);
        const full = withId({ at: event.at ?? new Date().toISOString(), ...event, ...identity(), w: writer, ...(team ? { team } : {}), n: mine.length + 1, lc: seen + 1, prev: mine.length ? sha(mine.at(-1)) : '00000000' });
        fs.appendFileSync(file, `${JSON.stringify(full)}\n`);
        return full;
    });
}

function brokenIn(lines) {
    for (let i = 0; i < lines.length; i++) {
        const e = parse(lines[i]);
        if (e === null) return i; // a line that is not an event breaks the chain where it stands
        if (e.prev !== (i === 0 ? '00000000' : sha(lines[i - 1]))) return i;
    }
    return -1;
}
/** Index of the first line of a single-file journal that does not follow the line before it, or -1. */
export const brokenAt = (file) => brokenIn(linesOf(file));
/** The same check for lines held in memory (a proof bundle carries its journal with it). */
export const brokenLines = (lines) => brokenIn(lines);

/** What is wrong with the shape of one segment, beyond its hash chain: torn lines, numbering, clock, writer. */
function structureOf(file, name, segmented, ids = new Set()) {
    const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
    const lines = raw.split('\n').filter(Boolean);
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
            const { id, ...rest } = e;
            if (sha(JSON.stringify(rest), 12) !== id) add(i + 1, `event id ${id} does not match the event`);
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
 * Integrity of the whole journal: every segment's hash chain, its structure, and items claimed by
 * more than one writer. `intact` is the single answer governance asks for.
 */
export function verifyJournal(target) {
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
    const intact = files.length > 0 && broken.length === 0 && structure.length === 0;
    const claims = conflicts(events);
    // one word for what is wrong, most serious first
    const status = !files.length ? 'empty' : structure.some((x) => /cut off|not an event/.test(x.problem)) ? 'torn' : broken.length ? 'tampered' : structure.length ? 'malformed' : claims.length ? 'conflict' : 'intact';
    return { segments: files.length, events: events.length, broken, structure, sharedClocks, conflicts: claims, intact, status };
}

/** Sets a torn tail aside in `<segment>.torn` so that the segment can be appended to again. Never silent: returns what it moved. */
export function repairJournal(target) {
    const files = isSegmented(target) ? segments(target) : fs.existsSync(target) ? [target] : [];
    return withJournalLock(target, () => {
        const moved = [];
        for (const file of files) {
            const lines = linesOf(file);
            if (!lines.length || parse(lines.at(-1)) !== null) continue;
            fs.appendFileSync(`${file}.torn`, `${lines.at(-1)}\n`);
            fs.writeFileSync(file, lines.slice(0, -1).map((l) => `${l}\n`).join(''));
            moved.push({ segment: path.basename(file), line: lines.length, to: `${path.basename(file)}.torn` });
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
