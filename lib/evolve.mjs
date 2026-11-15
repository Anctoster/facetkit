// evolve: the loop that turns repeated mistakes into tested changes of the team's rules.
//
//   1. a mistake keeps happening          patterns(): the same cause blamed on the same agent, again and again
//   2. which rule should have stopped it  the facets that declare this cause in `guards`
//   3. was the rule there                 was it in the loadout the step was given?
//   4. was it followed                    did the step leave the rule's footprint?
//   5. what follows                       no rule → write one; not delivered → load it; delivered and
//                                         ignored → reword it; followed and the mistake still happens →
//                                         the rule does not work as text: change it or make it a tool
//   6. try it                             a proposal becomes an experiment design: current against candidate
//   7. compare                            the design's analysis
//   8. decide                             adopt only what an independent repetition confirmed, and only by a person
//
// Nothing here edits a facet. A proposal is a file; the candidate wording is a file next to the facet;
// adoption is a recorded human decision that this module refuses until the evidence exists.
import fs from 'node:fs';
import path from 'node:path';
import { closedItems, ofItem } from './journal.mjs';
import { adhered } from './skillint.mjs';
import { newDesign } from './intelligence.mjs';

export const EVOLVE_LIMITS = { minIncidents: 3, window: 30, ignored: 0.5, followed: 0.7 };

/** Causes that recur: { mode, agent, incidents: [{ item, step, note, late }], items } over the last `window` closed items. */
export function patterns(events, { limits = EVOLVE_LIMITS } = {}) {
    const recent = new Set(closedItems(events).slice(-limits.window));
    const by = new Map();
    const add = (mode, agent, incident) => {
        const key = `${mode}|${agent ?? '*'}`;
        if (!by.has(key)) by.set(key, { mode, agent: agent ?? null, incidents: [] });
        by.get(key).incidents.push(incident);
    };
    for (const e of events) {
        if (!recent.has(e.item)) continue;
        if (e.kind === 'verdict') for (const f of e.fixes ?? []) add(f.mode ?? 'other', f.agent, { item: e.item, note: f.note ?? null, late: false });
        if (e.kind === 'escape') add(e.mode ?? 'other', e.agent ?? null, { item: e.item, note: e.note ?? null, late: true });
    }
    return [...by.values()].map((p) => ({ ...p, items: [...new Set(p.incidents.map((i) => i.item))] })).filter((p) => p.items.length >= limits.minIncidents && p.mode !== 'other').sort((a, b) => b.items.length - a.items.length);
}

/** For one pattern: per guarding facet, how often it was delivered and followed in the very steps that failed. */
export function diagnosePattern(pattern, events, facets, { ledgerOf = () => [], limits = EVOLVE_LIMITS } = {}) {
    const guards = facets.filter((f) => f.guards.includes(pattern.mode));
    const failing = [];
    for (const item of pattern.items) {
        const mine = ofItem(events, item);
        const runs = ledgerOf(item);
        for (const start of mine.filter((e) => e.kind === 'step.start' && !e.assist && (!pattern.agent || e.agent === pattern.agent))) {
            const end = mine.find((e) => e.kind === 'step.end' && e.step === start.step && e.at >= start.at);
            const inside = (x) => x.at >= start.at && (!end || x.at <= end.at);
            failing.push({ item, start, window: { runs: runs.filter(inside), events: mine.filter((e) => inside(e) && (e.step === undefined || e.step === start.step)) } });
            break; // the first attempt of the blamed agent is where the rule should have worked
        }
    }
    if (!guards.length) return [{ pattern, facet: null, kind: 'create', steps: failing.length, why: `no rule guards against "${pattern.mode}", and it happened in ${pattern.items.length} items`, change: `write a facet with "guards: [${pattern.mode}]" for ${pattern.agent ?? 'the team'}, with a footprint, and test it against no rule` }];
    return guards.map((f) => {
        const delivered = failing.filter((x) => (x.start.facets ?? []).includes(f.ref));
        const follows = delivered.map((x) => adhered(f.footprint, x.window));
        const known = follows.filter((x) => x !== null);
        const rate = known.length ? known.filter(Boolean).length / known.length : null;
        const base = { pattern, facet: f.ref, steps: failing.length, delivered: delivered.length, followed: known.filter(Boolean).length, measurable: known.length };
        if (delivered.length < failing.length * 0.5) return { ...base, kind: 'load', why: `${f.ref} guards against "${pattern.mode}" but reached only ${delivered.length} of the ${failing.length} steps that failed`, change: `add ${f.ref} to the loadout of ${pattern.agent ?? 'the failing role'} for that phase` };
        if (rate === null) return { ...base, kind: 'instrument', why: `${f.ref} was delivered, but it declares no footprint: nobody can tell whether it was followed`, change: `give ${f.ref} a footprint (a command or an event that only following it leaves), then look again` };
        if (rate < limits.ignored) return { ...base, kind: 'reword', why: `${f.ref} was delivered to ${delivered.length} failing steps and followed in ${base.followed} of ${known.length}: it is read and not acted on`, change: `write a candidate wording (shorter Do, a concrete Check, a Stop that names the temptation) and test it against the current one` };
        if (rate >= limits.followed) return { ...base, kind: f.check && /`[^`]+`/.test(f.check) ? 'to-tool' : 'change', why: `${f.ref} was followed in ${base.followed} of ${known.length} failing steps and "${pattern.mode}" still happened: as a text it does not prevent it`, change: f.check && /`[^`]+`/.test(f.check) ? `its Check names a command: make that command a gate the flow runs, and test the facet against the gate` : `rewrite what it asks for, or retire it — after an experiment against no rule shows which` };
        return { ...base, kind: 'observe', why: `${f.ref} was followed in ${base.followed} of ${known.length} failing steps: too mixed to act on`, change: 'keep collecting' };
    });
}

export const proposalsDir = (root) => path.join(root, 'trials', 'proposals');
export function loadProposals(root) {
    const dir = proposalsDir(root);
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))) : [];
}
export function saveProposal(root, p) {
    fs.mkdirSync(proposalsDir(root), { recursive: true });
    fs.writeFileSync(path.join(proposalsDir(root), `${p.id}.json`), `${JSON.stringify(p, null, 2)}\n`);
}
/** Turns diagnoses into proposals, skipping what is already proposed for the same cause, agent and facet. */
export function propose(diagnoses, existing = [], { now = new Date().toISOString() } = {}) {
    const key = (d) => `${d.pattern.mode}|${d.pattern.agent ?? '*'}|${d.facet ?? '-'}|${d.kind}`;
    const have = new Set(existing.filter((p) => !['rejected', 'adopted'].includes(p.status)).map((p) => p.key));
    let n = existing.length;
    return diagnoses.filter((d) => d.kind !== 'observe' && !have.has(key(d))).map((d) => ({ id: `EVO-${String(++n).padStart(3, '0')}`, key: key(d), status: 'proposed', kind: d.kind, mode: d.pattern.mode, agent: d.pattern.agent, facet: d.facet, items: d.pattern.items, why: d.why, change: d.change, steps: d.steps, delivered: d.delivered ?? null, followed: d.followed ?? null, design: null, createdAt: now }));
}

/** The experiment that would settle a proposal. `variant` is the candidate facet file for "reword"/"change"/"create". */
export function designFor(proposal, { id, seed, variant = null, otherModel = null, minPerArm = 30 } = {}) {
    if (['load', 'instrument'].includes(proposal.kind)) throw new Error(`${proposal.id} (${proposal.kind}) is a configuration change, not a claim about behaviour: make it, and let the next scan show whether the pattern stops`);
    if (['reword', 'change', 'create'].includes(proposal.kind) && !variant) throw new Error(`${proposal.id}: write the candidate wording to a file and pass it as the variant`);
    const arms = proposal.kind === 'create' ? [{ id: 'A', facet: 'off' }, { id: 'B', facet: 'variant', variant }]
        : proposal.kind === 'to-tool' ? [{ id: 'A', facet: 'off' }, { id: 'B', facet: 'on' }]
        : [{ id: 'A', facet: 'on' }, { id: 'B', facet: 'variant', variant }, { id: 'C', facet: 'off' }];
    if (otherModel) arms.push({ id: 'M', facet: arms.at(1).facet, variant: arms.at(1).variant, model: otherModel });
    return newDesign({ id, facet: proposal.facet ?? `candidate:${proposal.id}`, seed, arms, primary: 'clean', minPerArm, proposal: proposal.id, hypothesis: `${proposal.change} — fewer "${proposal.mode}" from ${proposal.agent ?? 'the team'}` });
}

/** May the proposal be adopted? Only on a confirmed, favourable result — never because it reads well. */
export function mayAdopt(proposal, analysis) {
    if (['load', 'instrument'].includes(proposal.kind)) return { ok: true, why: 'a configuration change: it changes what is delivered or measured, not what a rule says' };
    if (!analysis) return { ok: false, why: 'no experiment has been run for it' };
    if (analysis.stage !== 'confirmed') return { ok: false, why: `its experiment is ${analysis.stage}: ${analysis.verdict}. A change is adopted only after an independent repetition agrees` };
    const b = analysis.arms.find((x) => x.arm === 'B') ?? analysis.arms[0];
    if (b.direction !== 'better') return { ok: false, why: `the confirmed result is "${b.direction}", not better` };
    return { ok: true, why: `confirmed: arm ${b.arm} is better on "${analysis.primary}" by ${b.primary.diff} [${b.primary.low}, ${b.primary.high}]` };
}

export function renderProposals(list) {
    return list.length ? list.map((p) => `${p.id}  ${p.status.padEnd(9)} ${p.kind.padEnd(10)} "${p.mode}" by ${p.agent ?? 'the team'} in ${p.items.length} items${p.facet ? ` · ${p.facet}` : ''}\n    ${p.why}\n    → ${p.change}${p.design ? `\n    experiment: ${p.design}` : ''}`).join('\n') : 'no recurring mistake: nothing to propose';
}
