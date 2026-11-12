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

/** All events in one order: a file as written; segments merged by logical clock, then time, then writer. */
export function readJournal(target) {
    if (!target || !fs.existsSync(target)) return [];
    if (!isSegmented(target)) return linesOf(target).map((l) => JSON.parse(l));
    const all = segments(target).flatMap((file) => linesOf(file).map((l) => JSON.parse(l)));
    return all.sort((a, b) => (a.lc ?? 0) - (b.lc ?? 0) || a.at.localeCompare(b.at) || String(a.w).localeCompare(String(b.w)) || (a.n ?? 0) - (b.n ?? 0));
}

/** Appends one event. `at` may be given (imports, tests); otherwise it is now. */
export function record(target, event, { writer = writerId(), team } = {}) {
    if (!isSegmented(target)) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const prev = linesOf(target).at(-1);
        const full = { at: event.at ?? new Date().toISOString(), ...event, prev: prev ? sha(prev) : '00000000' };
        fs.appendFileSync(target, `${JSON.stringify(full)}\n`);
        return full;
    }
    const file = path.join(target, ...(team ? [slug(team)] : []), `${writer}.jsonl`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const mine = linesOf(file);
    const seen = readJournal(target).reduce((m, e) => Math.max(m, e.lc ?? 0), 0);
    const full = { at: event.at ?? new Date().toISOString(), ...event, w: writer, ...(team ? { team } : {}), n: mine.length + 1, lc: seen + 1, prev: mine.length ? sha(mine.at(-1)) : '00000000' };
    fs.appendFileSync(file, `${JSON.stringify(full)}\n`);
    return full;
}

function brokenIn(lines) {
    for (let i = 0; i < lines.length; i++) if (JSON.parse(lines[i]).prev !== (i === 0 ? '00000000' : sha(lines[i - 1]))) return i;
    return -1;
}
/** Index of the first line of a single-file journal that does not follow the line before it, or -1. */
export const brokenAt = (file) => brokenIn(linesOf(file));

/** Integrity of the whole journal: every segment's chain, and items claimed by more than one writer. */
export function verifyJournal(target) {
    const files = isSegmented(target) ? segments(target) : fs.existsSync(target) ? [target] : [];
    const broken = files.map((file) => ({ segment: path.relative(isSegmented(target) ? target : path.dirname(target), file), line: brokenIn(linesOf(file)) + 1 })).filter((b) => b.line > 0);
    const events = readJournal(target);
    return { segments: files.length, events: events.length, broken, conflicts: conflicts(events) };
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
