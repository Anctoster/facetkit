// thrift: run commands and read files without flooding the agent's context.
//  - run():     executes a command with a timeout, stores the full output in a log file and returns
//               a digest (exit code, duration, the lines that matter, the tail);
//  - excerpt(): prints a bounded range of a file with line numbers;
//  - ledger:    every run and read is recorded; caps on minutes, runs and estimated tokens turn
//               "keep trying" into a hard stop (exit code 3).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { killTree, safeEnv, spawnShell } from './shell.mjs';
import { estimateTokens } from './text.mjs';

export const EXIT_CAP = 3;
const SIGNAL = /\b(\w*error|failed|failure|fatal|exception|cannot|not found|denied|✗|FAIL|ERR!|Traceback)\b|^\s*at .+:\d+|:\d+:\d+/i;

export function readLedger(file) {
    if (!file || !fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
function append(file, entry) {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

/** Totals of a ledger and the first cap that is exceeded (or null). */
export function ledgerStatus(entries, caps = {}) {
    const runs = entries.filter((e) => e.kind === 'run');
    const totals = {
        runs: runs.length,
        minutes: +(runs.reduce((s, e) => s + (e.sec ?? 0), 0) / 60).toFixed(2),
        tokens: entries.reduce((s, e) => s + (e.tokens ?? 0), 0),
        saved: entries.reduce((s, e) => s + (e.saved ?? 0), 0),
        failures: runs.filter((e) => e.exit !== 0).length,
    };
    const exceeded = ['runs', 'minutes', 'tokens'].find((k) => caps[k] !== undefined && totals[k] >= caps[k]) ?? null;
    return { totals, caps, exceeded };
}

/** The same failing command repeated without any change in between is a loop, not progress. */
export function repeatedFailures(entries, command) {
    let n = 0;
    for (const e of [...entries].reverse()) {
        if (e.kind !== 'run') continue;
        if (e.cmd === command && e.exit !== 0) n++;
        else break;
    }
    return n;
}

export function digest(output, { maxSignal = 12, tail = 8 } = {}) {
    const lines = output.split(/\r?\n/);
    while (lines.length && !lines.at(-1).trim()) lines.pop();
    const signal = [];
    let frames = 0; // of a stack trace only the first two frames are signal
    lines.forEach((line, i) => {
        frames = /^\W*at\s/.test(line) ? frames + 1 : 0;
        if (frames > 2) return;
        if (signal.length < maxSignal && SIGNAL.test(line)) signal.push(`${i + 1}: ${line.trim().slice(0, 200)}`);
    });
    const from = Math.max(0, lines.length - tail);
    return { lines: lines.length, signal, tail: lines.slice(from).map((l, i) => `${from + i + 1}: ${l.slice(0, 200)}`) };
}

/**
 * Runs `argv` (no shell), or a command line string through the platform's shell (lib/shell.mjs). Returns { exit, sec, log, text } where text is the digest to show.
 * Refuses to start when a cap is already exceeded or the same command failed `maxRepeat` times in a row.
 */
export async function run(argv, { cwd = process.cwd(), timeoutSec = 300, ledger, logDir, caps = {}, maxRepeat = 3, env = safeEnv() } = {}) {
    const command = typeof argv === 'string' ? argv : argv.join(' ');
    const entries = readLedger(ledger);
    const status = ledgerStatus(entries, caps);
    if (status.exceeded) return { exit: EXIT_CAP, text: `BUDGET EXCEEDED: ${status.exceeded} ${status.totals[status.exceeded]} ≥ ${caps[status.exceeded]}. Stop and report; do not retry.` };
    if (repeatedFailures(entries, command) >= maxRepeat) return { exit: EXIT_CAP, text: `LOOP: "${command}" failed ${maxRepeat} times in a row. Change something or report BLOCKED; the command was not run.` };

    const started = Date.now();
    const chunks = [];
    let timedOut = false;
    const exit = await new Promise((resolve) => {
        const child = typeof argv === 'string' ? spawnShell(argv, { cwd, env }) : spawn(argv[0], argv.slice(1), { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        const timer = setTimeout(() => {
            timedOut = true;
            // the whole tree: a shell's children outlive a killed shell and keep the pipes open
            if (typeof argv === 'string') killTree(child);
            else child.kill('SIGKILL');
        }, timeoutSec * 1000);
        child.stdout.on('data', (d) => chunks.push(d));
        child.stderr.on('data', (d) => chunks.push(d));
        child.on('error', (error) => {
            chunks.push(Buffer.from(String(error.message)));
            clearTimeout(timer);
            resolve(127);
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve(timedOut ? 124 : (code ?? 1));
        });
    });
    const output = Buffer.concat(chunks).toString('utf-8');
    const sec = +((Date.now() - started) / 1000).toFixed(1);
    let log = null;
    if (logDir) {
        fs.mkdirSync(logDir, { recursive: true });
        const n = String(entries.filter((e) => e.kind === 'run').length + 1).padStart(3, '0');
        log = path.join(logDir, `${n}-${(typeof argv === 'string' ? argv.split(/\s+/) : argv).slice(0, 3).join('-').replace(/[^a-z0-9.-]+/gi, '_').slice(0, 40)}.log`);
        fs.writeFileSync(log, output);
    }
    const d = digest(output);
    const text = [
        `$ ${command} → exit ${exit}${timedOut ? ` (timeout ${timeoutSec}s)` : ''} · ${sec}s · ${d.lines} lines${log ? ` · log ${path.relative(cwd, log)}` : ''}`,
        ...(exit !== 0 && d.signal.length ? ['signal:', ...d.signal.map((l) => `  ${l}`)] : []),
        'tail:',
        ...d.tail.map((l) => `  ${l}`),
    ].join('\n');
    append(ledger, { kind: 'run', cmd: command, exit, sec, tokens: estimateTokens(text.length), saved: Math.max(0, estimateTokens(output.length) - estimateTokens(text.length)) });
    return { exit, sec, log, text };
}

/** Lines start..end of a file (1-based, inclusive), at most `max` lines. */
export function excerpt(file, start, end, { max = 80, ledger } = {}) {
    const all = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
    const from = Math.max(1, start || 1);
    const to = Math.min(all.length, end || from + max - 1, from + max - 1);
    const text = all.slice(from - 1, to).map((l, i) => `${String(from + i).padStart(5)}  ${l}`).join('\n');
    append(ledger, { kind: 'read', file, from, to, tokens: estimateTokens(text.length), saved: Math.max(0, estimateTokens(all.join('\n').length) - estimateTokens(text.length)) });
    return { from, to, total: all.length, text, cut: (end || all.length) > to };
}
