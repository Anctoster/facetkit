// tension: initiative, step 0 (plan 2.12, strategic plan 11). An agent that notices something outside
// its task — a defect next to its code, a gap in the brief, a risk — records it, and does nothing more
// about it. At the close of the item a person reads the list. Recording is the whole of step 0: whether
// what agents notice is worth acting on is what the pilots will show.
//
//   { kind: 'tension', item, step, agent, where, criterion?, owner?, text, proposal? }
//
//  I1  tensions per closed item — none anywhere means the rule does not work or is not read
//  I5  silent passes — defects found after acceptance in a file an agent of the item had opened (read
//      through `facet read`, or listed in its handoff), while that agent recorded no tension. Opened
//      is not the same as could-have-noticed: the number overstates blame and serves to compare agents,
//      not to judge one case.
import { closedItems, ofItem } from './journal.mjs';

/** The tensions of an item, in the order they were recorded. */
export const tensionsOf = (events, item) => ofItem(events, item).filter((e) => e.kind === 'tension');

/** I1 over the closed items: { perItem, items, withAny }. */
export function noticed(events) {
    const closed = closedItems(events);
    const counts = closed.map((i) => tensionsOf(events, i).length);
    return { items: closed.length, perItem: closed.length ? +(counts.reduce((a, b) => a + b, 0) / closed.length).toFixed(2) : null, withAny: counts.filter((n) => n > 0).length };
}

const norm = (f) => String(f ?? '').replace(/\\/g, '/').replace(/^\.\//, '');

/**
 * I5: the escapes (defects found after acceptance, with the files the fix changed) for which an agent of
 * the item had opened one of those files and recorded no tension. `openedBy(item)` returns
 * [{ step, agent, files: [...] }] — what each step read or listed.
 */
export function silentPasses(events, openedBy) {
    const closed = new Set(closedItems(events));
    const escapes = events.filter((e) => e.kind === 'escape' && closed.has(e.item) && Array.isArray(e.files) && e.files.length);
    const rows = [];
    for (const x of escapes) {
        const bad = new Set(x.files.map(norm));
        const told = new Set(tensionsOf(events, x.item).map((t) => t.agent).filter(Boolean));
        const silent = openedBy(x.item).filter((o) => o.agent && !told.has(o.agent) && o.files.some((f) => bad.has(norm(f))));
        rows.push({ item: x.item, files: [...bad], silent: silent.map((o) => ({ step: o.step, agent: o.agent })) });
    }
    const hit = rows.filter((r) => r.silent.length);
    return { escapes: rows.length, silent: hit.length, value: rows.length ? +(hit.length / rows.length).toFixed(3) : null, rows: hit };
}

/** What each step of an item opened: reads of the ledger inside the step's time, and the files its handoff lists. */
export function openedByStep(events, item, { reads = [], listed = () => [] } = {}) {
    const mine = ofItem(events, item);
    const out = [];
    for (const start of mine.filter((e) => e.kind === 'step.start' && e.agent)) {
        const end = mine.find((e) => e.kind === 'step.end' && e.step === start.step && e.at >= start.at);
        const within = reads.filter((r) => r.at >= start.at && (!end || r.at <= end.at)).map((r) => r.file);
        out.push({ step: start.step, agent: start.agent, files: [...new Set([...within, ...listed(start.step)].map(norm))] });
    }
    return out;
}

export const renderTensions = (list) => list.map((t) => `  · ${t.step ?? '?'}${t.agent ? ` (${t.agent})` : ''}${t.where ? ` at ${t.where}` : ''}${t.criterion ? ` [${t.criterion}]` : ''}: ${t.text}${t.proposal ? `\n      proposes: ${t.proposal}` : ''}${t.owner ? ` — for ${t.owner}` : ''}`).join('\n');
