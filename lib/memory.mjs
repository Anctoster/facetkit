// memory: what the team learned, kept only while it is true and useful.
//  - a memory is tied to a territory (path globs or topics) and is recalled only by work that
//    enters that territory — never loaded "just in case";
//  - a memory may be anchored to code by a content hash; when the code changes, the memory is
//    reported as stale instead of being trusted;
//  - every recall is recorded; when the item closes, the memories that were recalled are credited
//    or debited by its outcome. A memory that keeps failing to help is retired.
// Storage is JSON lines meant to be committed with the project: one file, or one file per writer.
import fs from 'node:fs';
import path from 'node:path';
import { hashRange } from './capsule.mjs';
import { writerId, withJournalLock } from './journal.mjs';
import { sha, similarity, wordCount } from './text.mjs';

export const KINDS = ['pitfall', 'decision', 'fact', 'how'];
export const MEMORY_LIMITS = { words: 45, duplicate: 0.6, retireAfter: 5, retireBelow: 0.35 };
const ANCHOR = /^(.+?):(\d+)(?:-(\d+))?(?:#([0-9a-f]{8}))?$/;
const glob = (pattern) => new RegExp(`^${pattern.replace(/[.+^$()|[\]\\{}]/g, '\\$&').replace(/\*\*/g, '§§').replace(/\*/g, '[^/]*').replaceAll('§§', '.*')}$`);

/**
 * The store is a file, or a directory of per-writer segments (the same merge-free scheme as the
 * journal). It is append-only: a memory, a use, a credit and a retirement are each one line, and
 * the current picture is the fold of all lines. Two people can add and settle memories in
 * separate clones and merge without conflicts.
 */
const segmented = (target) => (fs.existsSync(target) ? fs.statSync(target).isDirectory() : !target.endsWith('.jsonl'));
const filesOf = (target) => (!fs.existsSync(target) ? [] : segmented(target) ? fs.readdirSync(target).filter((f) => f.endsWith('.jsonl')).sort().map((f) => path.join(target, f)) : [target]);
export function loadMemory(target) {
    const lines = filesOf(target).flatMap((f) => fs.readFileSync(f, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    const byId = new Map(lines.filter((l) => l.id).map((m) => [m.id, { uses: 0, helped: 0, hurt: 0, ...m }]));
    for (const l of lines) {
        for (const id of l.use ?? []) if (byId.has(id)) byId.get(id).uses++;
        const m = l.credit ? byId.get(l.credit) : l.retire ? byId.get(l.retire) : null;
        if (m && l.credit) Object.assign(m, { helped: m.helped + (l.helped ?? 0), hurt: m.hurt + (l.hurt ?? 0) });
        if (m && l.retire) m.retired = l.reason ?? 'retired';
    }
    return [...byId.values()];
}
function append(target, line, writer = writerId()) {
    const file = segmented(target) ? path.join(target, `${writer}.jsonl`) : target;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    withJournalLock(file, () => fs.appendFileSync(file, `${JSON.stringify(line)}\n`)); // two sessions remembering at once do not interleave lines
}

/** Expected usefulness: the share of outcomes in which the memory helped, starting from "unknown". */
export const utility = (m) => ((m.helped ?? 0) + 1) / ((m.helped ?? 0) + (m.hurt ?? 0) + 2);

/** Adds a memory. Refuses long texts, missing territory, unknown kinds and near-duplicates. */
export function remember(file, { kind, text, about = [], anchor, by, item }, { root = process.cwd(), now = new Date() } = {}) {
    const entries = loadMemory(file);
    if (!KINDS.includes(kind)) return { ok: false, reason: `kind must be one of ${KINDS.join(', ')}` };
    if (!text || wordCount(text) > MEMORY_LIMITS.words) return { ok: false, reason: `a memory is one sentence of at most ${MEMORY_LIMITS.words} words` };
    if (!about.length) return { ok: false, reason: 'a memory needs a territory: --about <path glob or topic>' };
    const twin = entries.find((e) => !e.retired && similarity(e.text, text) >= MEMORY_LIMITS.duplicate);
    if (twin) return { ok: false, reason: `already known as ${twin.id}: "${twin.text}"`, twin: twin.id };
    let sealed;
    if (anchor) {
        const m = ANCHOR.exec(anchor);
        const hash = m ? hashRange(root, m[1], Number(m[2]), Number(m[3] ?? m[2])) : null;
        if (!hash) return { ok: false, reason: `cannot anchor to ${anchor}: no such file or range` };
        sealed = `${m[1]}:${m[2]}-${m[3] ?? m[2]}#${hash}`;
    }
    const entry = { id: `m-${sha(`${text}${now.toISOString()}`, 6)}`, kind, text: text.trim(), about, anchor: sealed, by, item, created: now.toISOString().slice(0, 10) };
    append(file, entry);
    return { ok: true, entry };
}

/** live | stale (the anchored code changed) | retired */
export function condition(m, root) {
    if (m.retired) return 'retired';
    if (!m.anchor) return 'live';
    const a = ANCHOR.exec(m.anchor);
    return a && hashRange(root, a[1], Number(a[2]), Number(a[3] ?? a[2])) === a[4] ? 'live' : 'stale';
}

/**
 * Memories for work that touches `files` or concerns `topics`, best first, within a word budget.
 * Stale memories are not returned as knowledge; they are listed so somebody re-checks them.
 */
export function recall(file, { files = [], topics = [], budgetWords = 120, root = process.cwd() } = {}) {
    const entries = loadMemory(file);
    const hit = (m) => m.about.some((a) => topics.includes(a) || files.some((f) => glob(a).test(f)));
    const used = [];
    const stale = [];
    let words = 0;
    const ranked = entries.filter((m) => !m.retired && hit(m)).sort((a, b) => utility(b) - utility(a) || b.created.localeCompare(a.created));
    for (const m of ranked) {
        if (condition(m, root) === 'stale') {
            stale.push(m);
            continue;
        }
        const w = wordCount(m.text);
        if (words + w > budgetWords) continue;
        words += w;
        used.push(m);
    }
    if (used.length) append(file, { use: used.map((m) => m.id) });
    return { used, stale, words, skipped: ranked.length - used.length - stale.length };
}

/**
 * Settles the memories recalled during an item by its outcome: `good` (passed without rework of
 * the recalling agent) credits them, otherwise they are debited by half a point — the memory was
 * present and did not prevent the trouble. Retires what has had its chances.
 */
export function credit(file, ids, good) {
    const retired = [];
    for (const m of loadMemory(file)) {
        if (!ids.includes(m.id) || m.retired) continue;
        append(file, { credit: m.id, helped: good ? 1 : 0, hurt: good ? 0 : 0.5 });
        const next = { helped: m.helped + (good ? 1 : 0), hurt: m.hurt + (good ? 0 : 0.5) };
        if (next.helped + next.hurt >= MEMORY_LIMITS.retireAfter && utility(next) < MEMORY_LIMITS.retireBelow) {
            append(file, { retire: m.id, reason: 'not useful' });
            retired.push(m.id);
        }
    }
    return { settled: ids.length, retired };
}

/** Retires memories (after somebody decided they no longer hold). */
export function retire(file, ids, reason = 'retired by hand') {
    for (const id of ids) append(file, { retire: id, reason });
}

export function renderRecall({ used, stale, skipped }) {
    const lines = used.map((m) => `- [${m.id}] ${m.kind}: ${m.text}${m.anchor ? ` (\`${m.anchor}\`)` : ''}`);
    if (stale.length) lines.push(`Stale — the code they point at changed, re-check before relying on them: ${stale.map((m) => m.id).join(', ')}`);
    if (skipped) lines.push(`${skipped} more did not fit the budget.`);
    return lines.length ? lines.join('\n') : 'nothing known about this territory';
}
