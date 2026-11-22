// domainlog: the journals of the domain plugins (arch-flow, viz-flow) read into the core journal (plan 2.3).
//
// A domain journal is a JSON-lines file written by the domain engine (archflow.py / vizflow.py): every line
// carries `n`, `prev` and `hash` = sha256(prev + json.dumps(line without hash, sort_keys=True,
// ensure_ascii=False)); lines of versions before 0.3.2 carry the hash cut to 16 characters.
//
// Import is the first of two stages: here the core reads a domain journal, checks its chain and records
// an event of its own for each line, pointing back to it (`src: { journal, n, hash }`). In version 2.2 the
// domains write the core format themselves and this module is no longer needed.
//
// What it refuses: a chain that does not hold (an edited, removed or reordered line), a torn line,
// and an anchor (`ANCHOR n:hash`, printed by the domain at every close) that the journal no longer matches.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { SAFE_ITEM } from './shell.mjs';

// ---- the domain's own serialisation ------------------------------------------------------------
// Numbers are kept as the text they were written in: Python writes 1.0 where JavaScript would write 1,
// and the hash is over Python's text. So the line is parsed into a tree whose numbers are raw tokens.

const RAW = Symbol('raw number');

function parseKeepingNumbers(text) {
    let i = 0;
    const fail = (why) => {
        throw new Error(`${why} at character ${i}`);
    };
    const ws = () => {
        while (i < text.length && ' \t\r\n'.includes(text[i])) i++;
    };
    const value = () => {
        ws();
        const c = text[i];
        if (c === '{') {
            i++;
            const out = [];
            ws();
            if (text[i] === '}') return i++, { obj: out };
            for (;;) {
                ws();
                if (text[i] !== '"') fail('a key must be a string');
                const k = str();
                ws();
                if (text[i++] !== ':') fail('":" expected');
                out.push([k, value()]);
                ws();
                if (text[i] === ',') i++;
                else if (text[i] === '}') return i++, { obj: out };
                else fail('"," or "}" expected');
            }
        }
        if (c === '[') {
            i++;
            const out = [];
            ws();
            if (text[i] === ']') return i++, out;
            for (;;) {
                out.push(value());
                ws();
                if (text[i] === ',') i++;
                else if (text[i] === ']') return i++, out;
                else fail('"," or "]" expected');
            }
        }
        if (c === '"') return str();
        if (text.startsWith('true', i)) return (i += 4), true;
        if (text.startsWith('false', i)) return (i += 5), false;
        if (text.startsWith('null', i)) return (i += 4), null;
        const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
        if (!m) fail('a value expected');
        i += m[0].length;
        return { [RAW]: m[0] };
    };
    const str = () => {
        const m = /^"(?:[^"\\\u0000-\u001f]|\\.)*"/s.exec(text.slice(i));
        if (!m) fail('a string is not closed');
        i += m[0].length;
        return JSON.parse(m[0]);
    };
    const v = value();
    ws();
    if (i !== text.length) fail('text after the value');
    return v;
}

// Python's json.dumps(..., sort_keys=True, ensure_ascii=False) with its default separators.
const byCodePoint = (a, b) => {
    const x = [...a];
    const y = [...b];
    for (let k = 0; k < Math.min(x.length, y.length); k++) if (x[k] !== y[k]) return x[k].codePointAt(0) - y[k].codePointAt(0);
    return x.length - y.length;
};
function pyDumps(v) {
    if (v === null) return 'null';
    if (v === true) return 'true';
    if (v === false) return 'false';
    if (typeof v === 'string') return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(pyDumps).join(', ')}]`;
    if (v[RAW] !== undefined) return v[RAW];
    const entries = [...v.obj].sort(([a], [b]) => byCodePoint(a, b));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}: ${pyDumps(x)}`).join(', ')}}`;
}
// the raw tree back into plain values, for the core event
function plain(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(plain);
    if (v[RAW] !== undefined) return Number(v[RAW]);
    return Object.fromEntries(v.obj.map(([k, x]) => [k, plain(x)]));
}

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * Reads and checks a domain journal. Returns { lines: [{ n, hash, event }], head: { n, hash } } or throws
 * with the number of the first line that does not hold — never a partial list.
 */
export function readDomainJournal(file, { anchor } = {}) {
    const text = fs.readFileSync(file, 'utf-8');
    const lines = [];
    let prev = '';
    text.split('\n').forEach((raw, k) => {
        const line = raw.replace(/\r$/, '');
        if (!line.trim()) return;
        const at = lines.length + 1;
        let tree;
        try {
            tree = parseKeepingNumbers(line);
        } catch (error) {
            throw new Error(`line ${k + 1} is not a whole event (${error.message}) — torn or edited; the import stops`);
        }
        if (!tree || !tree.obj) throw new Error(`line ${k + 1} is not an event`);
        const hashEntry = tree.obj.find(([key]) => key === 'hash');
        const hash = typeof hashEntry?.[1] === 'string' ? hashEntry[1] : '';
        const body = { obj: tree.obj.filter(([key]) => key !== 'hash') };
        const event = plain(body);
        const expected = sha256(prev + pyDumps(body));
        if (event.prev !== prev || ![16, 64].includes(hash.length) || expected.slice(0, hash.length) !== hash || event.n !== at)
            throw new Error(`line ${k + 1} (event ${event.n ?? '?'}) does not hold in the chain: it was edited, removed, reordered or added by hand — the import stops`);
        lines.push({ n: at, hash, event });
        prev = hash;
    });
    const head = lines.length ? { n: lines.at(-1).n, hash: lines.at(-1).hash } : { n: 0, hash: '' };
    if (anchor) {
        const m = /^(?:ANCHOR\s+)?(\d+):([0-9a-f]{16,64})$/.exec(String(anchor).trim());
        if (!m) throw new Error(`anchor ${JSON.stringify(anchor)}: expected n:hash as the domain prints it (ANCHOR n:hash)`);
        const at = lines[Number(m[1]) - 1];
        if (!at || !at.hash.startsWith(m[2]) || m[2].length < 16) throw new Error(`anchor ${m[1]}:${m[2].slice(0, 16)}… does not match the journal: its history was rewritten after the anchor was written`);
    }
    return { lines, head };
}

// ---- domain event → core event ------------------------------------------------------------------
// One table, so that what an imported item means is the same as what a core item means.
const MAP = {
    open: (e, o) => ({ kind: 'item.open', item: e.item, route: e.route, title: e.title || undefined, forced: e.forced || undefined, origin: e.origin || undefined, steps: o.stepsOf(e) }),
    start: (e) => ({ kind: 'step.start', item: e.item, step: e.step, agent: e.agent, model: e.model, forced: e.forced || undefined }),
    end: (e) => ({ kind: 'step.end', item: e.item, step: e.step, agent: e.agent, status: e.status, tokens: e.tokens ?? undefined }),
    evidence: (e) => ({ kind: 'evidence', item: e.item, name: e.check, ok: e.status === 'OK', value: e.value ?? undefined, status: e.status, receipt: e.receipt ?? undefined, by: e.by ?? undefined, reason: e.reason ?? undefined, scope: e.scope ?? undefined }),
    waive: (e) => ({ kind: 'waiver', item: e.item, rule: e.check, reason: e.reason, by: e.by }),
    verdict: (e) => ({ kind: 'verdict', item: e.item, verdict: e.verdict, fixes: e.fix ?? undefined, question: e.question ?? undefined }),
    close: (e) => ({ kind: 'item.close', item: e.item, forced: e.forced || undefined, waived: e.waived ?? undefined }),
    sign: (e) => ({ kind: 'approval', item: e.item ?? undefined, what: `sign:${e.name}:${e.sha}`, by: e.by, note: e.what ?? undefined }),
    accept: (e) => ({ kind: 'approval', item: e.item, what: 'accept', by: e.by }),
    answer: (e) => ({ kind: 'answer', item: e.item, step: e.step, text: e.text }),
    // the echo of understanding (plan 2.9), and a brief sent back after two failed echoes: against the brief, not the agent
    echo: (e) => ({ kind: 'echo', item: e.item, step: e.step, ok: !!e.ok, u1: e.u1, u2: e.u2, u3: e.u3, u4: e.u4, problems: e.problems ?? undefined }),
    'echo.return': (e) => ({ kind: 'origin', item: e.item, criterion: e.criterion ?? undefined, from: 'return', step: e.to, method: 'human', cause: 'brief-unreadable', charged: false, foundAt: e.step }),
    // an approved brief with a criteria block is the item's approved criteria (plan 2.8); without one it stays a domain event
    'brief.ok': (e) => (Array.isArray(e.list) ? { kind: 'criterion', item: e.item, hash: e.list_hash, criteria: e.list, by: e.by, brief: e.brief } : null),
};
const drop = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// The steps of an imported item, so that the core sees its steps and the step of its verdict:
// the route as the domain project defines it (routes.json beside the journal), else the steps the
// item actually started, in order. The step of an inspector (arch-inspector, viz-inspector) judges.
const judges = (agent) => /-inspector$/.test(agent ?? '');
const asSteps = (list) => list.map((s) => drop({ id: s.id, agent: s.agent, phase: s.mode, model: s.model, verdict: judges(s.agent) || undefined }));
export function stepsFrom(lines, { routes = null } = {}) {
    return (open) => {
        const defined = routes?.routes?.[open.route];
        const list = Array.isArray(defined) ? defined : defined?.steps;
        if (Array.isArray(list) && list.length) return asSteps(list);
        const seen = new Map();
        for (const l of lines) if (l.event.type === 'start' && l.event.item === open.item && !seen.has(l.event.step)) seen.set(l.event.step, { id: l.event.step, agent: l.event.agent, model: l.event.model });
        return asSteps([...seen.values()]);
    };
}

/** The core event for one domain line: a mapped kind, or `domain.<type>` with the line's fields; always with `src`. */
export function coreEvent(line, { domain, journal, prefix = '', stepsOf = () => [] }) {
    const e = { ...line.event };
    const raw = line.event;
    // with a prefix the core id differs from the domain one; the domain id is kept, it names the item's folder there
    const domainItem = prefix && e.item ? e.item : undefined;
    if (prefix && e.item) e.item = `${prefix}${e.item}`;
    // an unmapped line keeps its fields under `data`, so that none of them can stand in for a core field (its own `kind`, say)
    const mapped = (MAP[e.type] && MAP[e.type](e, { stepsOf: () => stepsOf(raw) })) || (({ n, ts, type, prev, item, ...rest }) => ({ kind: `domain.${type}`, item, data: rest }))(e);
    return drop({ ...mapped, domain, domainItem, domainAt: e.ts, src: { journal, n: line.n, hash: line.hash } });
}

/** The core events still to write: lines not imported before (by their hash), in order. */
export function toImport(lines, coreEvents, options) {
    // an item id becomes a folder name in the core: one that could leave its folder is refused, whatever the chain says
    if (options.prefix && !SAFE_ITEM.test(options.prefix)) throw new Error(`prefix ${JSON.stringify(options.prefix)} is not usable: letters, digits, ".", "_" and "-" only`);
    const unsafe = lines.find((l) => l.event.item !== undefined && !SAFE_ITEM.test(`${options.prefix ?? ''}${l.event.item}`));
    if (unsafe) throw new Error(`line ${unsafe.n} names item ${JSON.stringify(unsafe.event.item)}, which is not usable as an item id — the import stops`);
    const seen = new Set(coreEvents.filter((e) => e.src?.hash).map((e) => `${e.src.journal}#${e.src.hash}`));
    const stepsOf = stepsFrom(lines, { routes: options.routes ?? null });
    return lines.filter((l) => !seen.has(`${options.journal}#${l.hash}`)).map((l) => coreEvent(l, { ...options, stepsOf }));
}
