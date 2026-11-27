// The research summary (docs/research/RESULTS.md, RESULTS_pl.md) is derived from trials/results.json:
// the per-model table of every tested facet and the evidence counts are written between markers, so the
// summary cannot drift from the records the way "0/3 → 3/3 on three models" did.
//   node scripts/research.mjs          writes them
//   node scripts/research.mjs --check  exits 1 and names the stale file (test/research-results.test.mjs runs it in CI)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { counts } from './counts.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FILES = { 'docs/research/RESULTS.md': 'en', 'docs/research/RESULTS_pl.md': 'pl' };
const BLOCK = /<!-- research:([a-z-]+) -->[\s\S]*?<!-- \/research -->/g;

const WORDS = {
    en: { ceiling: 'ceiling', theatre: 'theatre', partial: 'partial', status: 'Status', of: (c, m) => `confirmed on ${c} of ${m} models` },
    pl: { ceiling: 'sufit', theatre: 'teatr', partial: 'częściowo', status: 'Status', of: (c, m) => `potwierdzone na ${c} z ${m} modeli` },
};

/** The model as a column header: the name before the harness, without "(self-reported)". */
export const modelName = (m) => m.split(',')[0].replace(/\s*\(.*?\)/g, '').trim();
const passed = (s) => s.split(' ')[0];

/** One cell: verdict and both scores; a control already at full marks is a ceiling, not "no difference". */
export function cell(r, lang) {
    const w = WORDS[lang];
    const [without, withRule] = [passed(r.without), passed(r.with)];
    const full = `${r.runs}/${r.runs}`;
    if (r.verdict === 'no difference' && without === full) return `${w.ceiling} ${without} → ${withRule}`;
    const note = (r.note ?? '').toLowerCase();
    const tag = r.verdict === 'no difference' ? (note.includes('theatre') ? ` (${w.theatre})` : note.includes('partial') ? ` (${w.partial})` : '') : '';
    return `${r.verdict === 'confirmed' ? `**${r.verdict}**` : r.verdict} ${without} → ${withRule}${tag}`;
}

/** SUPPORTED when every model confirmed, NOT_SUPPORTED when none did and none hit a ceiling, MIXED otherwise. */
export function status(rows, lang) {
    const confirmed = rows.filter((r) => r.verdict === 'confirmed').length;
    const ceiling = rows.filter((r) => r.verdict === 'no difference' && passed(r.without) === `${r.runs}/${r.runs}`).length;
    const s = confirmed === rows.length ? 'SUPPORTED' : confirmed === 0 && ceiling === 0 ? 'NOT_SUPPORTED' : 'MIXED';
    return `\`${s}\` — ${WORDS[lang].of(confirmed, rows.length)}`;
}

export function table(results, lang) {
    const models = [...new Set(results.map((r) => modelName(r.model)))];
    const facets = [...new Set(results.map((r) => r.facet))];
    const lines = [`| Facet | ${models.join(' | ')} | ${WORDS[lang].status} |`, `|${'---|'.repeat(models.length + 2)}`];
    for (const f of facets) {
        const mine = results.filter((r) => r.facet === f);
        const cells = models.map((m) => {
            const r = mine.filter((x) => modelName(x.model) === m);
            return r.length ? r.map((x) => cell(x, lang)).join('; ') : '—';
        });
        lines.push(`| \`${f}\` | ${cells.join(' | ')} | ${status(mine, lang)} |`);
    }
    return lines.join('\n');
}

export function values(results, root = ROOT) {
    const { hypotheses } = counts(root);
    const tested = new Set(results.map((r) => r.facet)).size;
    return { table: null, hypotheses, tested, e0: hypotheses - tested, e2: tested, records: results.length, models: new Set(results.map((r) => modelName(r.model))).size };
}

/** Rewrites the marked blocks of a text; returns { text, stale: [names] }. Unknown names are errors. */
export function fill(text, results, lang, root = ROOT) {
    const v = values(results, root);
    const stale = [];
    const out = text.replace(BLOCK, (all, name) => {
        if (!(name in v)) throw new Error(`unknown research block "${name}" (known: ${Object.keys(v).join(', ')})`);
        const body = name === 'table' ? `\n${table(results, lang)}\n` : String(v[name]);
        const next = `<!-- research:${name} -->${body}<!-- /research -->`;
        if (next !== all) stale.push(name);
        return next;
    });
    return { text: out, stale };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const results = JSON.parse(fs.readFileSync(path.join(ROOT, 'trials', 'results.json'), 'utf-8'));
    const check = process.argv.includes('--check');
    let stale = 0;
    for (const [f, lang] of Object.entries(FILES)) {
        const file = path.join(ROOT, f);
        const r = fill(fs.readFileSync(file, 'utf-8'), results, lang);
        if (r.stale.length) console.log(`${f}: ${r.stale.join(', ')} out of date with trials/results.json`);
        stale += r.stale.length;
        if (!check && r.stale.length) fs.writeFileSync(file, r.text);
    }
    if (check && stale) {
        console.log('run: npm run research');
        process.exit(1);
    }
    console.log(check ? 'research: RESULTS match trials/results.json' : 'research: RESULTS written from trials/results.json');
}
