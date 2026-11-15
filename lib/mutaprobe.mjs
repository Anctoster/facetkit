// mutaprobe: a small, bounded mutation probe. After tests are green it breaks the code under test
// one line at a time and re-runs the tests. A mutant the tests do not notice ("survivor") is
// evidence of a false positive: the tests pass without checking that behaviour.
// Bounded on purpose: changed lines first, a fixed number of mutants, a wall-clock limit.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { langOf } from './lang.mjs';

/** Replaces string contents and line comments with spaces so operators are found in code only. */
export function maskNonCode(line, lang = langOf('x.js')) {
    let out = '';
    let quote = null;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quote) {
            if (c === '\\') {
                out += '  ';
                i++;
                continue;
            }
            if (c === quote) {
                quote = null;
                out += c;
            } else out += ' ';
        } else if (lang.quotes.includes(c)) {
            quote = c;
            out += c;
        } else if (line.startsWith(lang.comment, i)) {
            out += ' '.repeat(line.length - i);
            break;
        } else out += c;
    }
    return out;
}

const swap = (pairs) => (m) => pairs[m];
const COMPARE = { '===': '!==', '!==': '===', '==': '!=', '!=': '==', '<': '>=', '>': '<=', '<=': '>', '>=': '<' };
export const OPERATORS = [
    { id: 'compare', re: / (===|!==|==|!=|<=|>=|<|>) /, to: (m) => ` ${swap(COMPARE)(m.trim())} ` },
    { id: 'logic', re: /&&|\|\|/, to: swap({ '&&': '||', '||': '&&' }) },
    { id: 'py-logic', re: / (and|or) /, to: (m) => ` ${swap({ and: 'or', or: 'and' })(m.trim())} ` },
    { id: 'boolean', re: /\b(true|false)\b/, to: swap({ true: 'false', false: 'true' }) },
    { id: 'py-boolean', re: /\b(True|False)\b/, to: swap({ True: 'False', False: 'True' }) },
    { id: 'arith', re: / (\+|-|\*) (?!=)/, to: (m) => ` ${swap({ '+': '-', '-': '+', '*': '/' })(m.trim())} ` },
    // typed languages: leave `+` alone on lines with a string (concatenation) and never turn `*` into `/` on integers' behalf
    { id: 'arith-safe', re: / (\+|-) (?!=)/, to: (m) => ` ${swap({ '+': '-', '-': '+' })(m.trim())} `, unless: /["'`]/ },
    { id: 'number', re: /(?<![\w.$])\d+(?![\w.])/, to: (m) => String(Number(m) + 1) },
    { id: 'negate', re: /!(?=[\w(])/, to: () => '' },
    { id: 'py-negate', re: /\bnot /, to: () => '' },
    { id: 'return', re: /\breturn\s+[^;]+;/, to: () => 'return undefined;' },
    { id: 'py-return', re: /\breturn\s+\S.*$/, to: () => 'return None' },
    { id: 'statement', re: /^\s*(?:await\s+)?[\w.$]+\([^;]*\);\s*$/, to: () => ';' },
];

/** Every single-edit mutant of one line, with the operators of the file's language. */
export function mutateLine(line, file = 'x.js') {
    const lang = langOf(file) ?? langOf('x.js');
    if (lang.skipLine.test(line)) return [];
    const masked = maskNonCode(line, lang);
    const out = [];
    for (const op of OPERATORS.filter((o) => lang.operators.includes(o.id))) {
        const m = op.re.exec(masked);
        if (!m || (op.unless && op.unless.test(line))) continue;
        const after = line.slice(0, m.index) + op.to(m[0]) + line.slice(m.index + m[0].length);
        if (after !== line) out.push({ op: op.id.replace(/^py-|-safe$/g, ''), after });
    }
    return out;
}

/** Line numbers (1-based) added or changed in `file` relative to `ref`; null when git cannot tell. */
export function changedLines(cwd, ref, file) {
    const r = spawnSync('git', ['diff', '-U0', ref, '--', file], { cwd, encoding: 'utf-8' });
    if (r.status !== 0) return null;
    const lines = new Set();
    for (const m of r.stdout.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
        const start = Number(m[1]);
        const count = m[2] === undefined ? 1 : Number(m[2]);
        for (let i = 0; i < count; i++) lines.add(start + i);
    }
    return lines;
}

/** Candidate mutants of the given files, changed lines first, operators interleaved, at most `max`. */
export function planMutants(cwd, files, { ref, max = 12 } = {}) {
    const all = [];
    for (const file of files) {
        const lines = fs.readFileSync(path.join(cwd, file), 'utf-8').split('\n');
        const changed = ref ? changedLines(cwd, ref, file) : null;
        lines.forEach((line, i) => {
            if (changed && changed.size && !changed.has(i + 1)) return;
            for (const m of mutateLine(line, file)) all.push({ file, line: i + 1, before: line.trim(), ...m, after: m.after.trim(), raw: m.after });
        });
    }
    // interleave operators so a small sample still covers different kinds of mistakes
    const byOp = new Map();
    for (const m of all) byOp.set(m.op, [...(byOp.get(m.op) ?? []), m]);
    const picked = [];
    for (let round = 0; picked.length < max; round++) {
        let took = false;
        for (const list of byOp.values()) {
            if (list[round] && picked.length < max) {
                picked.push(list[round]);
                took = true;
            }
        }
        if (!took) break;
    }
    return { picked, total: all.length };
}

/**
 * Runs the probe. `test` is a shell command that exits 0 when the tests pass.
 * Result: { baseline, killed, survived[], equivalent[], invalid[], notRun, total, score } — files are always restored.
 * Five outcomes, never merged: detected (a test failed), survived (no test noticed), equivalent (declared
 * beforehand in `equivalents`: the change cannot alter behaviour), invalid (the mutant does not even load,
 * so its "failure" says nothing about the tests), not executed (the time budget ran out).
 */
export function probe({ cwd = process.cwd(), files, test, ref, max = 12, timeoutSec = 120, maxMinutes = 10, log = () => {}, equivalents = [] }) {
    const declared = new Set(equivalents.map((e) => `${e.file}:${e.line}:${e.op}`));
    const loads = (file) => !/\.(mjs|cjs|js)$/.test(file) || spawnSync(process.execPath, ['--check', path.join(cwd, file)], { encoding: 'utf-8' }).status === 0;
    const equivalent = [];
    const invalid = [];
    const runTests = () => spawnSync(test, { cwd, shell: true, encoding: 'utf-8', timeout: timeoutSec * 1000, stdio: ['ignore', 'pipe', 'pipe'] });
    const baseline = runTests();
    if (baseline.status !== 0) return { baseline: 'red', message: 'tests are not green before mutation — nothing to probe' };

    const { picked, total } = planMutants(cwd, files, { ref, max });
    const started = Date.now();
    const originals = new Map(files.map((f) => [f, fs.readFileSync(path.join(cwd, f), 'utf-8')]));
    const restore = () => originals.forEach((text, f) => fs.writeFileSync(path.join(cwd, f), text));
    const onSignal = () => {
        restore();
        process.exit(130);
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    const survived = [];
    let killed = 0;
    let notRun = 0;
    try {
        for (const m of picked) {
            if ((Date.now() - started) / 60000 > maxMinutes) {
                notRun++;
                continue;
            }
            if (declared.has(`${m.file}:${m.line}:${m.op}`)) {
                equivalent.push({ file: m.file, line: m.line, op: m.op });
                continue;
            }
            const lines = originals.get(m.file).split('\n');
            lines[m.line - 1] = m.raw;
            fs.writeFileSync(path.join(cwd, m.file), lines.join('\n'));
            if (!loads(m.file)) {
                fs.writeFileSync(path.join(cwd, m.file), originals.get(m.file));
                invalid.push({ file: m.file, line: m.line, op: m.op });
                log(`invalid   ${m.file}:${m.line} ${m.op}`);
                continue;
            }
            const r = runTests();
            fs.writeFileSync(path.join(cwd, m.file), originals.get(m.file));
            if (r.status === 0) survived.push({ file: m.file, line: m.line, op: m.op, before: m.before, after: m.after });
            else killed++;
            log(`${r.status === 0 ? 'SURVIVED' : 'killed  '} ${m.file}:${m.line} ${m.op}`);
        }
    } finally {
        restore();
        process.removeListener('SIGINT', onSignal);
        process.removeListener('SIGTERM', onSignal);
    }
    const ran = killed + survived.length;
    return { baseline: 'green', total, planned: picked.length, killed, survived, equivalent, invalid, notRun, outcomes: { detected: killed, survived: survived.length, equivalent: equivalent.length, invalid: invalid.length, notExecuted: notRun }, score: ran ? killed / ran : null, minutes: +((Date.now() - started) / 60000).toFixed(2) };
}
