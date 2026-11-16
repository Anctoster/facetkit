// cognition: memory of what the team has learned, not of what happened.
//
// The journal remembers events; `facet mem` remembers facts about places in the code. A lesson is
// neither: it is a rule of conduct that a tested hypothesis earned — "in this situation, do this" —
// with the evidence it rests on and a confidence that is recomputed, never stored.
//
//  when        the situation: any of agent, taskClass, difficulty, model. Fewer keys = wider lesson.
//  kind        use-facet | avoid-facet | practice (free text delivered with the rules)
//  because     the hypotheses it rests on. A lesson without one cannot be created.
//  confidence  starts from the verdict (supported 0.9, promising 0.6), then follows experience: every
//              later item where the lesson was applied and the agent was not blamed strengthens it,
//              every one where it was blamed weakens it; it fades with items that pass without it
//              being confirmed, and halves when the model it was learned on is no longer the one in use.
//  learning    lessons above the floor change what an agent is given (the curriculum); a lesson that
//              falls below it stops being applied by itself. Nothing is retrained: what changes is
//              the instruction set, by evidence, reversibly.
import fs from 'node:fs';
import path from 'node:path';
import { closedItems } from './journal.mjs';

export const COGNITION = { floor: 0.5, halfLife: 60, start: { supported: 0.9, promising: 0.6, imported: 0.55 }, words: 40 };
const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

/** A lesson from a judged hypothesis, or null when the verdict teaches nothing yet. */
export function lessonFrom(h, verdict, { when = {}, at = 0, model = null, text = null } = {}) {
    const v = verdict.verdict;
    const positive = v === 'supported' || v === 'promising';
    const negative = v === 'refuted' || v === 'no-effect';
    if (!positive && !negative) return null;
    const helps = h.predicts.direction === 'better' ? positive : h.predicts.direction === 'worse' ? negative : null;
    if (helps === null && !text) return null;
    const kind = h.facet ? (helps ? 'use-facet' : 'avoid-facet') : 'practice';
    const say = text ?? (helps ? `Apply ${h.facet}: ${h.claim}` : `${h.facet} did not help here: ${verdict.why}`);
    if (words(say) > COGNITION.words) throw new Error(`a lesson is at most ${COGNITION.words} words`);
    return { id: `L-${h.id}`, kind, facet: h.facet ?? null, when: Object.fromEntries(Object.entries(when).filter(([, x]) => x)), do: say, because: [h.id], basis: v === 'supported' || negative ? 'supported' : 'promising', learnedAt: at, model, status: 'active' };
}

const fits = (lesson, ctx) => Object.entries(lesson.when).every(([k, v]) => ctx[k] === undefined || ctx[k] === null || ctx[k] === v);

/** How a lesson has fared since it was learned: applications from the journal (step.start carries `lessons`). */
export function experience(lesson, events) {
    const closed = new Set(closedItems(events));
    let good = 0;
    let bad = 0;
    for (const e of events) {
        if (e.kind !== 'step.start' || !(e.lessons ?? []).includes(lesson.id) || !closed.has(e.item)) continue;
        const blamed = events.some((x) => x.item === e.item && ((x.kind === 'verdict' && (x.fixes ?? []).some((f) => f.agent === e.agent)) || (x.kind === 'escape' && (!x.agent || x.agent === e.agent))));
        if (blamed) bad++;
        else good++;
    }
    return { good, bad };
}

/** Confidence now, in [0, 1], with its parts so that it can be explained. */
export function confidence(lesson, events, { modelNow = null } = {}) {
    if (lesson.status !== 'active') return { value: 0, why: lesson.status };
    const { good, bad } = experience(lesson, events);
    const prior = COGNITION.start[lesson.basis] ?? 0.6;
    const weight = 8; // the verdict counts like eight observed items
    const base = (prior * weight + good) / (weight + good + bad);
    const since = Math.max(0, closedItems(events).length - (lesson.learnedAt ?? 0));
    const idle = good + bad ? 0 : since; // a lesson that is being applied stays fresh; one that is not, fades
    const fade = 0.5 ** (idle / COGNITION.halfLife);
    const moved = lesson.model && modelNow && lesson.model !== modelNow ? 0.5 : 1;
    return { value: +(base * fade * moved).toFixed(3), good, bad, fade: +fade.toFixed(2), moved: moved < 1, why: `${good} applications went well, ${bad} did not${moved < 1 ? `; learned on ${lesson.model}, now ${modelNow}` : ''}${fade < 0.99 ? `; not applied for ${idle} items` : ''}` };
}

/** Lessons that apply to a situation, most trusted first, within a word budget. */
export function recallLessons(lessons, events, ctx = {}, { budgetWords = 120, floor = COGNITION.floor } = {}) {
    const rated = lessons.filter((l) => fits(l, ctx)).map((l) => ({ lesson: l, c: confidence(l, events, { modelNow: ctx.model ?? null }) })).sort((a, b) => b.c.value - a.c.value || Object.keys(b.lesson.when).length - Object.keys(a.lesson.when).length);
    const used = [];
    const dropped = [];
    let left = budgetWords;
    const taken = new Map(); // one lesson per facet: the more trusted (then the more specific) wins a contradiction
    for (const r of rated) {
        if (r.c.value < floor) dropped.push({ ...r, why: `confidence ${r.c.value} is below ${floor}` });
        else if (r.lesson.facet && taken.has(r.lesson.facet)) dropped.push({ ...r, why: `contradicted by ${taken.get(r.lesson.facet)}` });
        else if (words(r.lesson.do) > left) dropped.push({ ...r, why: 'word budget' });
        else {
            used.push(r);
            left -= words(r.lesson.do);
            if (r.lesson.facet) taken.set(r.lesson.facet, r.lesson.id);
        }
    }
    return { used, dropped };
}

/** What the recalled lessons change in a step's rules: facets to add, facets to leave out, text to append. */
export function curriculum(recalled) {
    return {
        add: recalled.used.filter((r) => r.lesson.kind === 'use-facet').map((r) => r.lesson.facet),
        drop: recalled.used.filter((r) => r.lesson.kind === 'avoid-facet').map((r) => r.lesson.facet),
        notes: recalled.used.filter((r) => r.lesson.kind === 'practice').map((r) => r.lesson.do),
        ids: recalled.used.map((r) => r.lesson.id),
    };
}

/** Lessons whose confidence has fallen below the floor: they should be retired or tested again. */
export const faded = (lessons, events, { floor = COGNITION.floor, modelNow = null } = {}) => lessons.filter((l) => l.status === 'active').map((l) => ({ lesson: l, c: confidence(l, events, { modelNow }) })).filter((r) => r.c.value < floor);

const file = (root) => path.join(root, 'trials', 'lessons.json');
export const loadLessons = (root) => (fs.existsSync(file(root)) ? JSON.parse(fs.readFileSync(file(root), 'utf-8')) : []);
export function saveLessons(root, lessons) {
    fs.mkdirSync(path.dirname(file(root)), { recursive: true });
    fs.writeFileSync(file(root), `${JSON.stringify(lessons, null, 2)}\n`);
}
export const renderLessons = (lessons, events, ctx = {}) => (lessons.length ? lessons.map((l) => {
    const c = confidence(l, events, { modelNow: ctx.model ?? null });
    return `${l.id.padEnd(12)} ${String(c.value).padEnd(6)} ${l.status === 'active' ? (c.value >= COGNITION.floor ? 'applied ' : 'FADED   ') : l.status.padEnd(8)} ${l.do}\n${' '.repeat(13)}when ${Object.entries(l.when).map(([k, v]) => `${k}=${v}`).join(', ') || 'always'} · because ${l.because.join(', ')} · ${c.why}`;
}).join('\n') : 'nothing learned yet: lessons come from judged hypotheses (facet learn)');
