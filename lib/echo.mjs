// echo: before the first working action, the agent of a step says back what it understood (plan 2.9,
// strategic plan 9.4). A tool compares it with the brief, not a model.
//
// echo.json, in the item's handoff folder:
//   { "step": "build",
//     "criteria": [{ "id": "A3", "value": "wall thickness 25 cm", "action": "…", "check": "spec_compare …" }],
//     "fixed": ["the designed buildings", …],      the brief's Fixed section, named back
//     "unknown": ["…"] }                             what the agent does not know yet
//
//  U1 coverage   every criterion whose `by` is this step is in the echo         < 100 % — the step does not start
//  U2 values     the numbers (with their units), quoted words and identifiers of each criterion's
//                text appear in its `value` as written                           < 100 % — the step does not start
//  U3 bounds     every line of Fixed is named in `fixed`                         < 100 % — the step does not start
//  U4 extra      numbers in the echo the brief does not have                     > 0 — scope-creep: a question to a person, not a refusal
//
// Two failed echoes in a row send the brief back to the step that wrote it: the brief cannot be read,
// and that is the brief's, not the agent's.

const NUMBER = /(?<![\p{L}\p{N}_.-])-?\d+(?:[.,]\d+)?(?:\s?(?:%|°[CF]?|[\p{L}µ²³]{1,4}(?![\p{L}\p{N}])))?/gu;
const QUOTED = /"([^"]+)"|«([^»]+)»|'([^'\s][^']*[^'\s])'|`([^`]+)`/g;
// an identifier: snake_case, dotted names, CamelCase with a capital inside, names with digits and underscores (CAM_aerial_N, D1-02)
const IDENT = /\b(?:[A-Za-z]+[_.][A-Za-z0-9_.]+|[A-Za-z]*[a-z][A-Z][A-Za-z0-9]*|[A-Z]{2,}[A-Z0-9_-]*\d[A-Z0-9_-]*|[A-Za-z]+\d+(?:[-_][A-Za-z0-9]+)+)\b/g;

const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const loose = (s) => squash(s).replace(/(\d)\s(?=[^\d\s])/g, '$1').replace(',', '.').toLowerCase();

/** What must come back as written: numbers with units, quoted words, identifiers. */
export function literals(text) {
    const t = String(text ?? '');
    const out = new Set();
    for (const m of t.matchAll(QUOTED)) out.add(squash(m[1] ?? m[2] ?? m[3] ?? m[4]));
    const bare = t.replace(QUOTED, ' ');
    for (const m of bare.matchAll(NUMBER)) out.add(squash(m[0]));
    for (const m of bare.matchAll(IDENT)) out.add(m[0].replace(/\.$/, ''));
    return [...out].filter(Boolean);
}

/** The lines of the brief's "## Fixed" section (nothing when it has none, or says none). */
export function fixedOf(brief) {
    const lines = String(brief ?? '').split(/\r?\n/);
    const at = lines.findIndex((l) => /^##\s+Fixed\b/i.test(l));
    if (at < 0) return [];
    const out = [];
    for (const l of lines.slice(at + 1)) {
        if (/^##\s/.test(l)) break;
        const s = squash(l.replace(/^[-*]\s*|^\d+[.)]\s*/, ''));
        if (s && !s.startsWith('(') && !/^none\.?$/i.test(s)) out.push(s);
    }
    return out;
}

/** The words of a Fixed line that carry it: an echo names the line when it names all of them. */
const keyWords = (line) => squash(line).toLowerCase().split(/[^\p{L}\p{N}_.-]+/u).map((w) => w.replace(/^[.-]+|[.-]+$/g, '')).filter((w) => w.length > 3);

/**
 * Checks an echo against the step's criteria (those with `by` equal to the step) and the Fixed lines.
 * Returns { ok, problems: [{ u, id?, why }], u1, u2, u3, u4, extra }.
 */
export function checkEcho(echo, { step, criteria = [], all = criteria, fixed = [] }) {
    const problems = [];
    const say = (u, why, id) => problems.push({ u, why, ...(id ? { id } : {}) });
    if (!echo || typeof echo !== 'object' || !Array.isArray(echo.criteria)) {
        say('U1', 'the echo is not a file of the form { step, criteria: [{ id, value, action, check }], fixed: [], unknown: [] }');
        return { ok: false, problems, u1: 0, u2: 0, u3: 0, u4: 0, extra: [] };
    }
    if (echo.step !== undefined && echo.step !== step) say('U1', `the echo is for step ${echo.step}, not ${step}`);
    const mine = criteria.filter((c) => c.by === step);
    const byId = new Map(echo.criteria.filter((c) => c && c.id).map((c) => [c.id, c]));
    const covered = mine.filter((c) => byId.has(c.id));
    for (const c of mine.filter((x) => !byId.has(x.id))) say('U1', `criterion ${c.id} of this step is not in the echo`, c.id);
    let wanted = 0;
    let found = 0;
    for (const c of covered) {
        const said = byId.get(c.id);
        const value = loose(said.value);
        for (const lit of literals(c.text)) {
            wanted++;
            if (value.includes(loose(lit))) found++;
            else say('U2', `criterion ${c.id}: the brief says "${lit}", the echo does not${said.value ? ` (it says: ${squash(said.value).slice(0, 80)})` : ''}`, c.id);
        }
        if (!squash(said.action)) say('U2', `criterion ${c.id}: no action — what will be done`, c.id);
        if (!squash(said.check)) say('U2', `criterion ${c.id}: no check — how it will be shown to hold`, c.id);
    }
    const named = (echo.fixed ?? []).map((f) => squash(f).toLowerCase()).join(' | ');
    const kept = fixed.filter((line) => keyWords(line).every((w) => named.includes(w)) || named.includes(squash(line).toLowerCase()));
    for (const line of fixed.filter((l) => !kept.includes(l))) say('U3', `Fixed: "${line}" is not named as unchangeable`);
    const known = new Set(all.map((c) => c.id));
    const extra = [...byId.keys()].filter((id) => !known.has(id));
    const blocking = problems.filter((p) => p.u !== 'U4');
    return {
        ok: blocking.length === 0,
        problems: [...problems, ...extra.map((id) => ({ u: 'U4', id, why: `${id} is not a criterion of the brief: scope-creep — ask a person before doing it` }))],
        u1: mine.length ? +(covered.length / mine.length).toFixed(3) : 1,
        u2: wanted ? +(found / wanted).toFixed(3) : 1,
        u3: fixed.length ? +(kept.length / fixed.length).toFixed(3) : 1,
        u4: extra.length,
        extra,
    };
}

export const renderEcho = (r) => [`echo: ${r.ok ? 'understood' : 'NOT understood'} — U1 ${Math.round(r.u1 * 100)} % · U2 ${Math.round(r.u2 * 100)} % · U3 ${Math.round(r.u3 * 100)} % · U4 ${r.u4}`, ...r.problems.map((p) => `  ${p.u === 'U4' ? '?' : '✗'} ${p.u} ${p.why}`)].join('\n');
