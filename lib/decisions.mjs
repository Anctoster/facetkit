// decisions: an architecture decision is a prediction about the system, and a prediction can be
// checked. A decision record here carries, besides its context and the alternatives it rejected,
// the measures that must keep holding if the decision was right — a fitness rule that must stay
// clean, a number that must stay under a limit, a command that must keep passing. `facet decide
// check` measures them all; a decision whose measure fails is not "wrong", it is due for review,
// and the record says since when and by how much.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const decisionsDir = (root) => path.join(root, 'docs', 'decisions');
const file = (root, id) => path.join(decisionsDir(root), `${id}.json`);
export const loadDecisions = (root) => (fs.existsSync(decisionsDir(root)) ? fs.readdirSync(decisionsDir(root)).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(decisionsDir(root), f), 'utf-8'))) : []);
export function saveDecision(root, d) {
    fs.mkdirSync(decisionsDir(root), { recursive: true });
    fs.writeFileSync(file(root, d.id), `${JSON.stringify(d, null, 2)}\n`);
    fs.writeFileSync(file(root, d.id).replace(/\.json$/, '.md'), renderDecisionMd(d));
    return d;
}

/**
 * A measure is one of:
 *   { fitness: "<rule id>" }                 the rule has no violation outside the baseline
 *   { run: "<command>" }                     the command exits 0
 *   { run: "<command>", max: N } / min: N    the first number the command prints stays within the bound
 */
export function newDecision({ id, title, context = '', decision, alternatives = [], measures = [], by = null, now = new Date().toISOString() }) {
    if (!/^[A-Za-z][\w.-]*$/.test(id ?? '')) throw new Error('a decision needs an id (ADR-3)');
    if (!title || !decision) throw new Error('a decision needs a title and the decision itself');
    if (!measures.length) throw new Error('a decision needs at least one measure that must keep holding if it was right (--fitness RULE or --measure "CMD" [--max N])');
    for (const m of measures) if (!m.fitness && !m.run) throw new Error('a measure is { fitness: rule } or { run: command, max?, min? }');
    return { id, title, context, decision, alternatives, measures, by, at: now, status: 'accepted', checks: [] };
}

/** Measures every measure of a decision. `fitnessFresh(ruleId)` returns the number of new violations of that rule. */
export function checkDecision(root, d, { fitnessFresh = () => null, timeoutSec = 300 } = {}) {
    const rows = d.measures.map((m) => {
        if (m.fitness) {
            const n = fitnessFresh(m.fitness);
            return { measure: `fitness ${m.fitness}`, value: n, holds: n === null ? null : n === 0, why: n === null ? `no fitness rule "${m.fitness}"` : n ? `${n} new violation(s)` : 'clean' };
        }
        const r = spawnSync('sh', ['-c', m.run], { cwd: root, encoding: 'utf-8', timeout: timeoutSec * 1000 });
        if (m.max === undefined && m.min === undefined) return { measure: m.run, value: r.status, holds: r.status === 0, why: `exit ${r.status}` };
        const n = Number(/-?\d+(?:\.\d+)?/.exec(`${r.stdout ?? ''}`)?.[0]);
        if (!Number.isFinite(n)) return { measure: m.run, value: null, holds: null, why: 'printed no number' };
        const holds = (m.max === undefined || n <= m.max) && (m.min === undefined || n >= m.min);
        return { measure: m.run, value: n, holds, why: `${n}${m.max !== undefined ? ` (max ${m.max})` : ''}${m.min !== undefined ? ` (min ${m.min})` : ''}` };
    });
    const state = rows.some((r) => r.holds === false) ? 'review' : rows.some((r) => r.holds === null) ? 'unmeasured' : 'holding';
    return { id: d.id, title: d.title, state, rows };
}
export const renderDecisionCheck = (c) => [`${c.id} ${c.state.toUpperCase().padEnd(10)} ${c.title}`, ...c.rows.map((r) => `    ${r.holds === true ? '✓' : r.holds === false ? '✗' : '?'} ${r.measure} — ${r.why}`)].join('\n');

export function renderDecisionMd(d) {
    return [`# ${d.id}: ${d.title}`, '', `Status: ${d.status} · ${d.at.slice(0, 10)}${d.by ? ` · ${d.by}` : ''}`, '', '## Context', '', d.context || '—', '', '## Decision', '', d.decision, '',
        '## Alternatives rejected', '', ...(d.alternatives.length ? d.alternatives.map((a) => `- ${a}`) : ['—']), '',
        '## What must keep holding if this was right', '', ...d.measures.map((m) => `- ${m.fitness ? `fitness rule \`${m.fitness}\` stays clean` : `\`${m.run}\`${m.max !== undefined ? ` prints at most ${m.max}` : m.min !== undefined ? ` prints at least ${m.min}` : ' passes'}`}`), '',
        '_Checked by `facet decide check`. A measure that fails sends the decision to review; it does not make it wrong._', ''].join('\n');
}
