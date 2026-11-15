// heal: the system looks for its own weak points in its own record, repairs the ones that are safe
// to repair by itself, and checks later whether the repair worked.
//
//  weakness   found by a detector that reads the journal, the trust graph, the lessons and the
//             proposals — never by an opinion. Each has a stable key, so it is found once.
//  remedy     either `auto` — reversible, bounded, touching only the team's own configuration
//             (raise a step one model up on probation, mark a check suspect, retire a faded lesson,
//             file a proposal) — or `person`, with the exact command to run.
//  follow-up  an applied remedy is on probation: after `probation` closed items the detector runs
//             again. Gone → healed. Still there → failed, and it goes to a person; an automatic
//             remedy is never repeated on the same weakness.
// What it will not do: edit a facet, change the policy, waive a rule, or lower any requirement.
import { closedItems } from './journal.mjs';
import { ranked } from './trustgraph.mjs';

export const HEAL = { minObservations: 5, weakTrust: 0.5, vacuousAfter: 12, waivers: 3, probation: 8 };

export function weaknesses({ events, graph, fadedLessons = [], openPatterns = [], decay = null, ladder = ['haiku', 'sonnet', 'opus'] }, limits = HEAL) {
    const out = [];
    const add = (key, kind, text, remedy) => out.push({ key, kind, text, remedy });
    for (const kind of ['agent', 'judge']) for (const n of ranked(graph, kind)) {
        if (n.n < limits.minObservations || n.trust >= limits.weakTrust) continue;
        const [name, model] = n.id.split(':')[1].split('@');
        const up = ladder[ladder.indexOf(model) + 1];
        add(`weak:${n.id}`, `weak-${kind}`, `${n.id} held in ${n.good} of ${n.n} items (trust ${n.trust})`,
            up ? { class: 'auto', action: 'raise-model', agent: name, from: model, to: up, text: `run ${name} on ${up} for the next ${limits.probation} items, then compare` } : { class: 'person', text: `${name} is already on the largest model: change its rules (facet evolve scan) or its route` });
    }
    for (const n of ranked(graph, 'tool')) {
        if (n.bad >= 2) add(`false-pass:${n.id}`, 'unreliable-check', `${n.id} was contradicted ${n.bad} times${n.notes[0] ? ` (${n.notes[0]})` : ''}`, { class: 'auto', action: 'suspect-check', check: n.id.slice(5), text: 'its evidence stops counting toward trust until the check is repaired; a person repairs it' });
        else if (n.bad === 0 && n.n >= limits.vacuousAfter) add(`vacuous:${n.id}`, 'never-fails', `${n.id} passed ${n.n} times and never failed: it may not be able to fail`, { class: 'person', text: 'prove it can fail: facet canary (plant a defect and see the check catch it)' });
    }
    for (const r of fadedLessons) add(`faded:${r.lesson.id}`, 'faded-lesson', `${r.lesson.id} has confidence ${r.c.value}: ${r.c.why}`, { class: 'auto', action: 'retire-lesson', lesson: r.lesson.id, text: 'stop applying it; test its hypothesis again before it returns' });
    for (const p of openPatterns) add(`pattern:${p.mode}|${p.agent ?? '*'}`, 'unaddressed-mistake', `"${p.mode}" by ${p.agent ?? 'several agents'} recurred in ${p.items.length} items and nothing addresses it`, { class: 'auto', action: 'file-proposal', text: 'diagnose it and file a proposal (facet evolve scan)' });
    const waived = new Map();
    for (const e of events) if (e.kind === 'waiver') waived.set(e.rule, (waived.get(e.rule) ?? 0) + 1);
    for (const [rule, n] of waived) if (n >= limits.waivers) add(`waived:${rule}`, 'rule-routinely-waived', `rule "${rule}" was waived ${n} times: either the rule or the work is wrong`, { class: 'person', text: 'decide: change the policy, or stop waiving' });
    for (const f of decay?.uncovered ?? []) add(`blind:${f}`, 'blind-spot', `${f} changes and no check covers it`, { class: 'person', text: `add it to a check's "covers"` });
    return out;
}

/** What to do now: new weaknesses, split by who acts; nothing that was already tried. */
export function plan(found, events) {
    const tried = new Map(events.filter((e) => e.kind === 'heal').map((e) => [e.key, e]));
    const fresh = found.filter((w) => !tried.has(w.key));
    return { auto: fresh.filter((w) => w.remedy.class === 'auto'), person: fresh.filter((w) => w.remedy.class === 'person'), known: found.filter((w) => tried.has(w.key)) };
}

/** Did the earlier remedies work? One row per applied remedy. */
export function followUp(found, events, limits = HEAL) {
    const now = closedItems(events).length;
    const still = new Set(found.map((w) => w.key));
    return events.filter((e) => e.kind === 'heal').map((h) => {
        const waited = now - (h.closedThen ?? 0);
        const state = waited < limits.probation ? 'on probation' : still.has(h.key) ? 'FAILED' : 'healed';
        return { key: h.key, action: h.action, waited, state, text: state === 'FAILED' ? `${h.key}: the remedy (${h.action}) did not remove the weakness after ${waited} items — a person decides; undo it or try something else` : state === 'healed' ? `${h.key}: gone after ${h.action}` : `${h.key}: ${h.action} applied, ${limits.probation - waited} more items until it is judged` };
    });
}

/** The configuration the automatic remedies amount to. Derived from the journal: undoing is one event. */
export function overrides(events) {
    const out = { models: {}, suspect: [] };
    for (const e of events) {
        if (e.kind === 'heal' && e.action === 'raise-model') out.models[e.agent] = e.to;
        if (e.kind === 'heal' && e.action === 'suspect-check' && !out.suspect.includes(e.check)) out.suspect.push(e.check);
        if (e.kind === 'heal.undo') {
            if (e.agent) delete out.models[e.agent];
            if (e.check) out.suspect = out.suspect.filter((c) => c !== e.check);
        }
    }
    return out;
}

export function renderHeal(p, follow = []) {
    return [
        ...p.auto.map((w) => `  ⚙ ${w.kind}: ${w.text}\n      remedy (automatic, reversible): ${w.remedy.text}`),
        ...p.person.map((w) => `  ☞ ${w.kind}: ${w.text}\n      for a person: ${w.remedy.text}`),
        ...follow.map((f) => `  ${f.state === 'healed' ? '✓' : f.state === 'FAILED' ? '✗' : '…'} ${f.text}`),
        `${p.auto.length} to repair automatically (facet heal apply) · ${p.person.length} for a person · ${p.known.length} already being treated`,
    ].join('\n');
}
