// The research summary is derived from the primary records, trials/results.json, and checked against them:
//   - RESULTS.md / RESULTS_pl.md and the "First results" paragraph of both READMEs carry generated blocks
//     between <!-- research:NAME --> … <!-- /research --> markers (table, counts, per-rule confirmations);
//   - every record is validated (fields, scores, verdict consistent with the scores, facet exists);
//   - dated snapshots (docs/field-report-*.md) are not rewritten, but every "x/n → y/n" cell in their tables
//     must agree with the record of that facet and model.
// Statuses follow written criteria (STATUS_RULES) and are never raised beyond them.
//   node scripts/research.mjs          validates, then writes the generated blocks
//   node scripts/research.mjs --check  validates and exits 1 on a stale block, an invalid record or a contradiction
//                                      (test/research-results.test.mjs runs this in CI)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FILES = { 'docs/research/RESULTS.md': 'en', 'docs/research/RESULTS_pl.md': 'pl', 'README.md': 'en', 'README.pl.md': 'pl' };
const BLOCK = /<!-- research:([a-z0-9-]+) -->[\s\S]*?<!-- \/research -->/g;
export const VERDICTS = ['confirmed', 'no difference', 'refuted'];

/** The criteria, as written in RESULTS.md §5. A ceiling (control already at full marks) shows nothing either way. */
export const STATUS_RULES = {
    SUPPORTED: 'at least 2 models, every one confirmed',
    NOT_SUPPORTED: 'at least 2 models, none confirmed, no ceiling',
    MIXED: 'at least 2 models, some confirmed and some not',
    INCONCLUSIVE: 'fewer than 2 models, or no model confirmed while some hit a ceiling',
};

const WORDS = {
    en: { ceiling: 'ceiling', theatre: 'theatre', partial: 'partial', of: (c, m) => `confirmed on ${c} of ${m} models`, list: (f, c, m) => `\`${f}\` ${c} of ${m}` },
    pl: { ceiling: 'sufit', theatre: 'teatr', partial: 'częściowo', of: (c, m) => `potwierdzone na ${c} z ${m} modeli`, list: (f, c, m) => `\`${f}\` ${c} z ${m}` },
};

/** The model as a column header: the name before the harness, without "(self-reported)". */
export const modelName = (m) => m.split(',')[0].replace(/\s*\(.*?\)/g, '').trim();
const score = (s) => { const m = /^(\d+)\/(\d+) passed$/.exec(s ?? ''); return m ? { k: Number(m[1]), n: Number(m[2]) } : null; };
export const isCeiling = (r) => r.verdict === 'no difference' && score(r.without)?.k === r.runs;

/** Errors in the primary records: anything the summary could otherwise build on silently. */
export function validate(results, facetIds) {
    const errors = [];
    const seen = new Set();
    results.forEach((r, i) => {
        const at = `trials/results.json[${i}] ${r.facet ?? '?'} / ${r.model ?? '?'}`;
        for (const k of ['facet', 'model', 'runs', 'without', 'with', 'verdict', 'by', 'date', 'link']) if (r[k] === undefined || r[k] === '') errors.push(`${at}: missing "${k}"`);
        if (facetIds && r.facet && !facetIds.has(r.facet)) errors.push(`${at}: no such facet in HYPOTHESES.md`);
        if (r.verdict && !VERDICTS.includes(r.verdict)) errors.push(`${at}: verdict "${r.verdict}" is not one of ${VERDICTS.join(', ')}`);
        if (r.date && !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) errors.push(`${at}: date "${r.date}" is not YYYY-MM-DD`);
        if (r.link && !/^https:\/\//.test(r.link)) errors.push(`${at}: link is not an https URL`);
        const w = score(r.without);
        const t = score(r.with);
        if (!w || !t) errors.push(`${at}: scores must read "k/n passed"`);
        else {
            if (w.n !== r.runs || t.n !== r.runs) errors.push(`${at}: scores out of ${w.n}/${t.n} but runs is ${r.runs}`);
            if (r.verdict === 'confirmed' && t.k <= w.k) errors.push(`${at}: "confirmed" but with the rule ${t.k} is not above ${w.k} without`);
            if (r.verdict === 'refuted' && t.k >= w.k) errors.push(`${at}: "refuted" but with the rule ${t.k} is not below ${w.k} without`);
            if (r.verdict === 'no difference' && Math.abs(t.k - w.k) > 1) errors.push(`${at}: "no difference" but the scores differ by ${Math.abs(t.k - w.k)}`);
        }
        const key = `${r.facet}|${r.model}|${r.link}`;
        if (seen.has(key)) errors.push(`${at}: duplicate of an earlier record (same facet, model and link)`);
        seen.add(key);
    });
    return errors;
}

/** One cell: verdict and both scores; a full control is a ceiling, not "no difference". */
export function cell(r, lang) {
    const w = WORDS[lang];
    const [without, withRule] = [r.without.split(' ')[0], r.with.split(' ')[0]];
    if (isCeiling(r)) return `${w.ceiling} ${without} → ${withRule}`;
    const note = (r.note ?? '').toLowerCase();
    const tag = r.verdict === 'no difference' ? (note.includes('theatre') ? ` (${w.theatre})` : note.includes('partial') ? ` (${w.partial})` : '') : '';
    return `${r.verdict === 'confirmed' ? `**${r.verdict}**` : r.verdict} ${without} → ${withRule}${tag}`;
}

/** Status of one facet across models, by STATUS_RULES. A model counts as confirmed when any of its records confirms. */
export function classify(rows) {
    const byModel = new Map();
    for (const r of rows) byModel.set(modelName(r.model), [...(byModel.get(modelName(r.model)) ?? []), r]);
    const models = byModel.size;
    const confirmed = [...byModel.values()].filter((rs) => rs.some((r) => r.verdict === 'confirmed')).length;
    const ceiling = [...byModel.values()].filter((rs) => rs.every(isCeiling)).length;
    let s;
    if (models < 2) s = 'INCONCLUSIVE';
    else if (confirmed === models) s = 'SUPPORTED';
    else if (confirmed > 0) s = 'MIXED';
    else s = ceiling > 0 ? 'INCONCLUSIVE' : 'NOT_SUPPORTED';
    return { status: s, confirmed, models };
}
export const status = (rows, lang) => { const c = classify(rows); return `\`${c.status}\` — ${WORDS[lang].of(c.confirmed, c.models)}`; };

const facetsOf = (results) => [...new Set(results.map((r) => r.facet))];
const modelsOf = (results) => [...new Set(results.map((r) => modelName(r.model)))];

export function table(results, lang) {
    const models = modelsOf(results);
    const lines = [`| Facet | ${models.join(' | ')} | Status |`, `|${'---|'.repeat(models.length + 2)}`];
    for (const f of facetsOf(results)) {
        const mine = results.filter((r) => r.facet === f);
        const cells = models.map((m) => mine.filter((x) => modelName(x.model) === m).map((x) => cell(x, lang)).join('; ') || '—');
        lines.push(`| \`${f}\` | ${cells.join(' | ')} | ${status(mine, lang)} |`);
    }
    return lines.join('\n');
}

/** E3: a confirmation reproduced by a second contributor on the same facet and model. Never assumed. */
export function replicated(results) {
    const out = new Set();
    for (const f of facetsOf(results)) for (const m of modelsOf(results)) {
        const by = new Set(results.filter((r) => r.facet === f && modelName(r.model) === m && r.verdict === 'confirmed').map((r) => r.by));
        if (by.size >= 2) out.add(f);
    }
    return out;
}

export function facetIdsFrom(root = ROOT) {
    const ids = new Set();
    let skill = null;
    for (const line of fs.readFileSync(path.join(root, 'HYPOTHESES.md'), 'utf-8').split('\n')) {
        const h = /^## (\S+)$/.exec(line);
        if (h) skill = h[1];
        const row = /^\| `([a-z0-9-]+)` \|/.exec(line);
        if (row && skill) ids.add(`${skill}:${row[1]}`);
    }
    return ids;
}

export function values(results, lang, root = ROOT) {
    const hypotheses = facetIdsFrom(root).size;
    const tested = facetsOf(results).length;
    const e3 = replicated(results).size;
    const models = modelsOf(results);
    const confirmedList = facetsOf(results)
        .map((f) => ({ f: f.split(':')[1], c: classify(results.filter((r) => r.facet === f)) }))
        .sort((a, b) => b.c.confirmed - a.c.confirmed)
        .map(({ f, c }) => WORDS[lang].list(f, c.confirmed, c.models)).join(', ');
    return { table: `\n${table(results, lang)}\n`, hypotheses, tested, e0: hypotheses - tested, e2: tested - e3, e3, replications: e3, records: results.length, models: models.length, 'model-list': models.join(', '), confirmed: confirmedList };
}

/** Rewrites the marked blocks of a text; returns { text, stale: [names] }. Unknown names are errors. */
export function fill(text, results, lang, root = ROOT) {
    const v = values(results, lang, root);
    const stale = [];
    const out = text.replace(BLOCK, (all, name) => {
        if (!(name in v)) throw new Error(`unknown research block "${name}" (known: ${Object.keys(v).join(', ')})`);
        const next = `<!-- research:${name} -->${v[name]}<!-- /research -->`;
        if (next !== all) stale.push(name);
        return next;
    });
    return { text: out, stale };
}

/** Cells of a hand-written or dated table that disagree with the records. Cells without "x → y" are not claims. */
export function contradictions(text, results, file = 'text') {
    const out = [];
    let models = null;
    for (const line of text.split('\n')) {
        if (/^\| Facet \|/.test(line)) { models = line.split('|').slice(2, -1).map((s) => s.trim()); continue; }
        if (!line.startsWith('|')) { models = null; continue; }
        const row = /^\| `(?:[a-z0-9-]+:)?([a-z0-9-]+)` \|/.exec(line);
        if (!models || !row) continue;
        const cells = line.split('|').slice(2, -1).map((s) => s.trim());
        cells.forEach((c, i) => {
            const m = /(\d+)(?:\/\d+)? → (\d+)(?:\/\d+)?/.exec(c);
            const model = models[i];
            if (!m || !model || model === 'Status') return;
            const recs = results.filter((r) => r.facet.endsWith(`:${row[1]}`) && modelName(r.model) === model);
            const ok = recs.some((r) => score(r.without).k === Number(m[1]) && score(r.with).k === Number(m[2]));
            if (!ok) out.push(`${file}: ${row[1]} on ${model} says ${m[1]} → ${m[2]}, the records say ${recs.map((r) => `${score(r.without).k} → ${score(r.with).k}`).join(' / ') || 'nothing'}`);
        });
    }
    return out;
}

export const snapshots = (root = ROOT) => fs.readdirSync(path.join(root, 'docs')).filter((f) => /^field-report-.*\.md$/.test(f)).map((f) => `docs/${f}`);

/** Everything --check reports: invalid records, stale blocks, contradicting snapshots. */
export function audit(root = ROOT) {
    const results = JSON.parse(fs.readFileSync(path.join(root, 'trials', 'results.json'), 'utf-8'));
    const problems = validate(results, facetIdsFrom(root));
    const writes = [];
    for (const [f, lang] of Object.entries(FILES)) {
        const text = fs.readFileSync(path.join(root, f), 'utf-8');
        if (!/<!-- research:/.test(text)) problems.push(`${f}: has no research blocks`);
        const r = fill(text, results, lang, root);
        if (r.stale.length) writes.push({ f, text: r.text, stale: r.stale });
    }
    for (const f of snapshots(root)) problems.push(...contradictions(fs.readFileSync(path.join(root, f), 'utf-8'), results, f));
    return { problems, writes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const check = process.argv.includes('--check');
    const { problems, writes } = audit();
    for (const p of problems) console.log(`✗ ${p}`);
    for (const w of writes) console.log(`${w.f}: ${w.stale.join(', ')} out of date with trials/results.json`);
    if (problems.length) process.exit(1);
    if (check && writes.length) {
        console.log('run: npm run research');
        process.exit(1);
    }
    if (!check) for (const w of writes) fs.writeFileSync(path.join(ROOT, w.f), w.text);
    console.log(check ? 'research: records valid; RESULTS and READMEs match trials/results.json; no snapshot contradicts it' : 'research: written from trials/results.json');
}
