// criteria: acceptance criteria with a number, a check and an owner (plan 2.8, strategic plan 9.2).
//
// A criterion is a line of the brief that says what "done" means, in a form a tool can hold the work
// to. It lives in a fenced block of the brief (core: the order handoff; domains: brief.md):
//
//   ```criteria
//   [{ "id": "A3", "text": "no holes in the terrain", "check": "scene_checks terrain.holes = 0",
//      "by": "environment", "chain": ["geodata", "scene_index", "scene"] }]
//   ```
//
//  id     a number that does not change until the item closes (A3, C12)
//  text   what is true when it is met, in the requester's words
//  check  a registered tool with a threshold — `<tool> [<measure>] [<op> <number>]` — or "[user]":
//         only the requester can judge. No check and no [user]: refused. More than three [user]: refused.
//  by     the step that must make it true
//  chain  where its value comes from: source → intermediate documents → result (optional; the
//         domain says how each link is read and compared, domain.json "chains")
//
// A list is approved once (`facet criteria approve`), and the approval records its hash: changing the
// list afterwards needs a new approval, and `facet criteria check` says when the brief and the
// approved list differ.
import { canon } from './canon.mjs';
import { ofItem } from './journal.mjs';
import { sha256 } from './text.mjs';

export const MAX_USER = 3;
const ID = /^[A-Z][A-Z0-9]{0,7}$/;
const CHECK = /^(\S+)(?:\s+([^\s<>=!]+))?(?:\s*(<=|>=|==|=|!=|<|>)\s*(-?\d+(?:\.\d+)?)\s*(%|[a-zA-Z]{1,4})?)?$/;
const BLOCK = /^```criteria[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/m;

/** The parts of a check: { user: true } or { tool, measure, op, value, unit }; null when it cannot be read. */
export function parseCheck(check) {
    const text = String(check ?? '').trim();
    if (text === '[user]') return { user: true };
    const m = CHECK.exec(text);
    if (!m) return null;
    return { user: false, tool: m[1], measure: m[2] ?? null, op: m[3] === '==' ? '=' : (m[3] ?? null), value: m[4] !== undefined ? Number(m[4]) : null, unit: m[5] ?? null };
}

/** The criteria block of a brief: { found, criteria, problems }. */
export function readCriteria(markdown) {
    const m = BLOCK.exec(String(markdown ?? ''));
    if (!m) return { found: false, criteria: [], problems: [] };
    let list;
    try {
        list = JSON.parse(m[1]);
    } catch (error) {
        return { found: true, criteria: [], problems: [{ id: null, why: `the criteria block is not JSON: ${error.message}` }] };
    }
    if (!Array.isArray(list)) return { found: true, criteria: [], problems: [{ id: null, why: 'the criteria block is a list: [ { "id": …, "text": …, "check": …, "by": … } ]' }] };
    return { found: true, criteria: list, problems: [] };
}

/**
 * Why a list cannot be accepted, one line per reason. `steps`: the step ids of the item's route
 * (unchecked when null); `tools`: the registered tool names (unchecked when null).
 */
export function gateCriteria(criteria, { steps = null, tools = null } = {}) {
    const problems = [];
    const say = (id, why) => problems.push({ id, why });
    if (!criteria.length) say(null, 'no criteria: "done" is not stated');
    const seen = new Set();
    for (const c of criteria) {
        const id = c?.id ?? null;
        if (!c || typeof c !== 'object') {
            say(null, 'a criterion is an object with id, text, check and by');
            continue;
        }
        if (!ID.test(String(id ?? ''))) say(id, 'the id is a letter and up to seven letters or digits (A3, C12)');
        else if (seen.has(id)) say(id, 'the id is used twice');
        seen.add(id);
        if (!String(c.text ?? '').trim()) say(id, 'no text: say what is true when it is met');
        const parsed = c.check === undefined || c.check === null || !String(c.check).trim() ? undefined : parseCheck(c.check);
        if (parsed === undefined) say(id, 'no check: name the tool and its threshold, or "[user]" when only the requester can judge');
        else if (parsed === null) say(id, `the check "${c.check}" cannot be read: <tool> [<measure>] [<op> <number>]`);
        else if (!parsed.user && tools && !tools.includes(parsed.tool)) say(id, `"${parsed.tool}" is not a registered tool here (known: ${tools.join(', ') || 'none'})`);
        if (!String(c.by ?? '').trim()) say(id, 'no "by": name the step that must make it true');
        else if (steps && !steps.includes(c.by)) say(id, `"by": ${c.by} is not a step of this item (steps: ${steps.join(', ')})`);
        if (c.chain !== undefined && (!Array.isArray(c.chain) || c.chain.some((x) => typeof x !== 'string' || !x.trim()))) say(id, '"chain" is a list of link names, source first');
    }
    const user = criteria.filter((c) => parseCheck(c?.check)?.user).length;
    if (user > MAX_USER) say(null, `${user} criteria are [user]; at most ${MAX_USER} — the rest must be measured`);
    return problems;
}

/** The hash an approval records: over the list as canonical JSON, so the order of keys does not matter (the order of criteria does). */
export const criteriaHash = (criteria) => sha256(canon(criteria));

/** The approved list of an item: the last `criterion` event, or null. */
export function approvedCriteria(events, item) {
    const e = ofItem(events, item).filter((x) => x.kind === 'criterion').at(-1);
    return e ? { criteria: e.criteria, hash: e.hash, by: e.by ?? null, at: e.at ?? null, brief: e.brief ?? null } : null;
}

/** One criterion of an item's approved list, or null. */
export const criterionOf = (events, item, id) => approvedCriteria(events, item)?.criteria.find((c) => c.id === id) ?? null;

export const renderProblems = (problems) => problems.map((p) => `  ✗ ${p.id ? `${p.id}: ` : ''}${p.why}`).join('\n');
