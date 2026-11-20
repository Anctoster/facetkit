// The numbers the READMEs state — tests, benchmark cases, hypotheses — are counted from their sources
// and written between markers, so that they cannot drift the way "185 tests" did while the suite grew.
//   node scripts/counts.mjs          writes them
//   node scripts/counts.mjs --check  exits 1 and names what differs (test/readme-counts.test.mjs runs this in CI)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FILES = ['README.md', 'README.pl.md'];
const MARK = /<!-- count:([a-z-]+) -->(\d+)<!-- \/count -->/g;

/** What the sources say: top-level test() calls, benchmark expectations, and the summary line HYPOTHESES.md is generated with. */
export function counts(root = ROOT) {
    const dir = path.join(root, 'test');
    const tests = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).reduce((n, f) => n + (fs.readFileSync(path.join(dir, f), 'utf-8').match(/^test\(/gm) ?? []).length, 0);
    const benchmark = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'benchmark', 'expected.json'), 'utf-8'))).length;
    const h = /\*\*(\d+) hypotheses · (\d+) with at least one reported trial · (\d+) untested\*\*/.exec(fs.readFileSync(path.join(root, 'HYPOTHESES.md'), 'utf-8'));
    if (!h) throw new Error('HYPOTHESES.md has no summary line: regenerate it with facet hypotheses --write HYPOTHESES.md');
    return { tests, benchmark, hypotheses: Number(h[1]), untested: Number(h[3]) };
}

/** Rewrites the marked numbers of a text. Returns { text, stale: [{ name, was, now }] }; an unknown name is an error. */
export function fill(text, values) {
    const stale = [];
    const out = text.replace(MARK, (all, name, was) => {
        if (!(name in values)) throw new Error(`unknown count "${name}" (known: ${Object.keys(values).join(', ')})`);
        if (Number(was) !== values[name]) stale.push({ name, was: Number(was), now: values[name] });
        return `<!-- count:${name} -->${values[name]}<!-- /count -->`;
    });
    return { text: out, stale };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const values = counts();
    const check = process.argv.includes('--check');
    let stale = 0;
    for (const f of FILES) {
        const file = path.join(ROOT, f);
        const r = fill(fs.readFileSync(file, 'utf-8'), values);
        for (const s of r.stale) console.log(`${f}: ${s.name} says ${s.was}, the sources say ${s.now}`);
        stale += r.stale.length;
        if (!check && r.stale.length) fs.writeFileSync(file, r.text);
    }
    if (check && stale) {
        console.log('run: npm run counts');
        process.exit(1);
    }
    console.log(check ? 'counts: the READMEs match the sources' : `counts: ${JSON.stringify(values)}`);
}
