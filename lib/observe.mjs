// observe: what happened, readable in one screen, and what looks wrong. Both come from the
// journal and the per-item run ledgers; there is nothing to instrument and nothing to keep running.
import { itemState } from './flow.mjs';
import { minutesBetween, ofItem } from './journal.mjs';

/** Step by step: when, how long, by whom, on which model, with how many commands and failures. */
export function timeline(events, item, runs = []) {
    const mine = ofItem(events, item).filter((e) => ['step.start', 'step.end', 'verdict', 'note', 'item.open', 'item.close', 'answer'].includes(e.kind));
    const lines = [];
    const started = {};
    for (const e of mine) {
        const t = e.at.slice(5, 16).replace('T', ' ');
        if (e.kind === 'item.open') lines.push(`${t}  open   ${item} · tier ${e.tier ?? 'normal'} · ${e.steps.length} steps`);
        else if (e.kind === 'step.start') {
            started[e.step] = e.at;
            lines.push(`${t}  start  ${e.step}${e.agent ? ` · ${e.agent}` : ''}${e.model ? ` · ${e.model}` : ''}${e.assist ? ` · assisting ${e.assist}` : ''}${e.rework ? ' · rework' : ''}`);
        } else if (e.kind === 'note') lines.push(`${t}    ·    ${e.text}`);
        else if (e.kind === 'step.end') {
            const from = started[e.step];
            const mineRuns = runs.filter((r) => r.kind === 'run' && from && r.at >= from && r.at <= e.at);
            lines.push(`${t}  end    ${e.step} → ${e.status}${from ? ` · ${minutesBetween(from, e.at)} min` : ''} · ${mineRuns.length} commands (${mineRuns.filter((r) => r.exit !== 0).length} failed)${e.tokens ? ` · ${e.tokens} tok` : ''}${e.for ? ` · for ${e.for}` : ''}`);
        } else if (e.kind === 'verdict') lines.push(`${t}  verdict ${e.verdict}${e.fixes?.length ? ` · fixes for ${[...new Set(e.fixes.map((f) => f.agent))].join(', ')}` : ''}`);
        else if (e.kind === 'answer') lines.push(`${t}  answer ${e.step}`);
        else if (e.kind === 'item.close') lines.push(`${t}  close  ${item}${e.commit ? ` · ${e.commit}` : ''}`);
    }
    return lines;
}

/** Patterns worth a human look. Each has the evidence that triggered it. */
export function anomalies(events, item, runs = [], { gapMinutes = 30 } = {}) {
    const found = [];
    const state = itemState(events, item);
    if (!state) return found;
    const mine = ofItem(events, item);
    for (const s of state.steps) {
        if (s.attempts > 2) found.push({ kind: 'thrash', step: s.id, why: `${s.attempts} attempts` });
        if (s.resumes) found.push({ kind: 'interrupted', step: s.id, why: `resumed ${s.resumes} time(s)` });
    }
    const assists = mine.filter((e) => e.kind === 'step.start' && e.assist);
    if (assists.length > 1) found.push({ kind: 'bounce', step: assists.at(-1).assist, why: `${assists.length} hand-backs between agents` });
    if (state.cycles > 1) found.push({ kind: 'rework', step: 'proof', why: `${state.cycles} rework cycles` });
    const open = {};
    for (const e of mine) {
        if (e.kind === 'step.start') open[e.step] = { at: e.at, last: e.at, notes: 0 };
        else if (e.kind === 'note' && open[e.step]) {
            if (minutesBetween(open[e.step].last, e.at) > gapMinutes) found.push({ kind: 'gap', step: e.step, why: `${minutesBetween(open[e.step].last, e.at)} min without a checkpoint` });
            open[e.step].last = e.at;
            open[e.step].notes++;
        } else if (e.kind === 'step.end' && open[e.step]) {
            const from = open[e.step];
            const mineRuns = runs.filter((r) => r.kind === 'run' && r.at >= from.at && r.at <= e.at);
            const failed = mineRuns.filter((r) => r.exit !== 0).length;
            if (e.status === 'DONE' && e.agent && !mineRuns.length && !from.notes) found.push({ kind: 'silent', step: e.step, why: 'reported DONE with no command and no checkpoint on record' });
            if (mineRuns.length >= 6 && failed / mineRuns.length > 0.5) found.push({ kind: 'flailing', step: e.step, why: `${failed} of ${mineRuns.length} commands failed` });
            let streak = 0;
            for (let i = 1; i < mineRuns.length; i++) {
                streak = mineRuns[i].cmd === mineRuns[i - 1].cmd && mineRuns[i].exit !== 0 && mineRuns[i - 1].exit !== 0 ? streak + 1 : 0;
                if (streak === 2) found.push({ kind: 'loop', step: e.step, why: `"${mineRuns[i].cmd.slice(0, 50)}" failed three times in a row` });
            }
            delete open[e.step];
        }
    }
    return found;
}
