// evalx: how well each agent does its part, per model — from real work, not from a benchmark.
// Every closed item is an observation for each agent on its route: did the item pass without
// rework addressed to that agent, was the agent blocked, what did the inspector score, what did it
// cost. Small samples are reported as intervals and labelled thin, never as a ranking.
// When real work cannot answer "would a cheaper model do?", a step can be replayed: its exact
// starting state is kept as a hidden git commit and re-run on another model in a worktree.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { itemState } from './flow.mjs';
import { closedItems, minutesBetween, ofItem } from './journal.mjs';
import { safeEnv } from './shell.mjs';

const median = (xs) => {
    const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
/** Wilson score interval for k successes in n trials (z = 1.28 → about 80 %). */
export function interval(k, n, z = 1.28) {
    if (!n) return { low: 0, high: 1 };
    const p = k / n;
    const d = 1 + (z * z) / n;
    const c = p + (z * z) / (2 * n);
    const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    return { low: +Math.max(0, (c - m) / d).toFixed(2), high: +Math.min(1, (c + m) / d).toFixed(2) };
}

/** One observation per agent per closed item. `tokensOf(item, step)` may supply measured usage. */
export function observations(events, { tokensOf } = {}) {
    const out = [];
    for (const item of closedItems(events)) {
        const mine = ofItem(events, item);
        const state = itemState(events, item);
        const verdicts = mine.filter((e) => e.kind === 'verdict');
        const blamed = new Set(verdicts.flatMap((v) => (v.fixes ?? []).map((f) => f.agent)));
        const scores = verdicts.at(-1)?.scores ?? {};
        const agents = new Map();
        for (const e of mine) {
            if (e.kind === 'step.start' && e.agent && !e.assist) {
                const a = agents.get(e.agent) ?? { model: e.model ?? 'unknown', minutes: 0, tokens: 0, blocked: false, starts: 0, open: {} };
                a.starts++;
                a.open[e.step] = e.at;
                agents.set(e.agent, a);
            } else if (e.kind === 'step.end') {
                const a = [...agents.values()].find((x) => x.open[e.step]);
                if (!a) continue;
                a.minutes += minutesBetween(a.open[e.step], e.at);
                a.tokens += tokensOf?.(item, e.step) ?? e.tokens ?? 0;
                if (e.status === 'BLOCKED') a.blocked = true;
                delete a.open[e.step];
            }
        }
        for (const [agent, a] of agents) out.push({ item, tier: state.tier, agent, model: a.model, firstPass: !blamed.has(agent), blocked: a.blocked, score: scores[agent] ?? null, tokens: a.tokens || null, minutes: +a.minutes.toFixed(1) });
    }
    return out;
}

/** Agent × model rows. `replays` (eval.replay events) are folded in as observations of their own kind. */
export function matrix(obs, { minN = 5, scoreMax = 10 } = {}) {
    const groups = new Map();
    for (const o of obs) {
        const key = `${o.agent}|${o.model}`;
        groups.set(key, [...(groups.get(key) ?? []), o]);
    }
    return [...groups.entries()]
        .map(([key, rows]) => {
            const [agent, model] = key.split('|');
            const pass = rows.filter((r) => r.firstPass).length;
            const scored = rows.filter((r) => r.score !== null);
            return { agent, model, n: rows.length, thin: rows.length < minN, firstPass: +(pass / rows.length).toFixed(2), ...interval(pass, rows.length), blocked: +(rows.filter((r) => r.blocked).length / rows.length).toFixed(2), score: scored.length ? +(scored.reduce((s, r) => s + r.score, 0) / scored.length / scoreMax).toFixed(2) : null, tokens: median(rows.map((r) => r.tokens)), minutes: median(rows.map((r) => r.minutes)) };
        })
        .sort((a, b) => a.agent.localeCompare(b.agent) || a.model.localeCompare(b.model));
}

/** For one agent: what the evidence says about each cheaper/dearer pair of models. */
export function compareModels(rows, agent, { ladder = ['haiku', 'sonnet', 'opus'], minN = 5 } = {}) {
    const mine = rows.filter((r) => r.agent === agent).sort((a, b) => ladder.findIndex((m) => a.model.includes(m)) - ladder.findIndex((m) => b.model.includes(m)));
    const out = [];
    for (let i = 0; i < mine.length - 1; i++) {
        const cheap = mine[i];
        const dear = mine[i + 1];
        let verdict;
        if (cheap.n < minN || dear.n < minN) verdict = `thin: ${cheap.model} n=${cheap.n}, ${dear.model} n=${dear.n} — need ${minN} each, or a replay`;
        else if (cheap.high < dear.low) verdict = `${cheap.model} is worse (${cheap.low}–${cheap.high} vs ${dear.low}–${dear.high}): keep ${dear.model}`;
        else if (cheap.low >= dear.low - 0.05) verdict = `no evidence that ${dear.model} is better (${cheap.low}–${cheap.high} vs ${dear.low}–${dear.high}): candidate to run on ${cheap.model}`;
        else verdict = `undecided (${cheap.low}–${cheap.high} vs ${dear.low}–${dear.high}): keep collecting`;
        out.push({ agent, cheap: cheap.model, dear: dear.model, verdict, saving: cheap.tokens && dear.tokens ? +(1 - cheap.tokens / dear.tokens).toFixed(2) : null });
    }
    return out;
}

export function renderMatrix(rows) {
    const k = (n) => (n === null ? '—' : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
    return ['agent                  model     n  first-pass (80% interval)  blocked  score  tokens  minutes', ...rows.map((r) => `${r.agent.padEnd(22)} ${r.model.padEnd(8)} ${String(r.n).padStart(2)}  ${String(r.firstPass).padEnd(4)} (${r.low}–${r.high})${r.thin ? ' thin' : '     '}       ${String(r.blocked).padEnd(7)}  ${String(r.score ?? '—').padEnd(5)}  ${k(r.tokens).padStart(6)}  ${r.minutes ?? '—'}`)].join('\n');
}

// ---- replay: the same step, the same starting state, another model -------------------------

// core.autocrlf=false: a snapshot must give back the bytes it took; with git's Windows default a restored
// worktree would come back with CRLF where the working tree had LF
const git = (cwd, args, env) => spawnSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf-8', env: env ? { ...process.env, ...env } : process.env });

/**
 * Keeps the exact working tree (tracked and untracked, not ignored) as a hidden commit under
 * refs/facet/snap/, without touching the index or the branch, plus the handoffs of the item.
 */
export function snapshot(root, { item, step, workDir }) {
    const index = path.join(root, '.git', 'facet-index'); // a private index: the real one is never touched
    const env = { GIT_INDEX_FILE: index };
    try {
        if (git(root, ['read-tree', 'HEAD'], env).status !== 0) return { ok: false, reason: 'not a git repository with a commit' };
        git(root, ['add', '-A'], env);
        const tree = git(root, ['write-tree'], env).stdout.trim();
        const commit = git(root, ['commit-tree', tree, '-p', 'HEAD', '-m', `facet snapshot ${item}/${step}`], { ...env, GIT_AUTHOR_NAME: 'facet', GIT_AUTHOR_EMAIL: 'facet@localhost', GIT_COMMITTER_NAME: 'facet', GIT_COMMITTER_EMAIL: 'facet@localhost' }).stdout.trim();
        if (!commit) return { ok: false, reason: 'could not write the snapshot commit' };
        git(root, ['update-ref', `refs/facet/snap/${item}/${step}`, commit]);
        const from = path.join(workDir, item);
        const to = path.join(from, 'snap', step);
        fs.mkdirSync(to, { recursive: true });
        const handoffs = fs.existsSync(from) ? fs.readdirSync(from).filter((f) => f.endsWith('.md') || f === 'caps.json') : [];
        for (const f of handoffs) fs.copyFileSync(path.join(from, f), path.join(to, f));
        return { ok: true, commit, handoffs };
    } finally {
        try {
            fs.rmSync(index, { force: true });
        } catch {
            // left behind on file systems that refuse deletion; it is rebuilt from HEAD on the next snapshot
        }
    }
}

/** The commit of the snapshot taken when `step` of `item` started, or null. */
export const snapshotRef = (root, { item, step }) => git(root, ['rev-parse', '--verify', '-q', `refs/facet/snap/${item}/${step}`]).stdout.trim() || null;

/** A worktree at the snapshot with the handoffs restored: the place to re-run the step. */
export function replaySetup(root, { item, step, model, workDir, workName = '.work' }) {
    const commit = git(root, ['rev-parse', '--verify', '-q', `refs/facet/snap/${item}/${step}`]).stdout.trim();
    if (!commit) return { ok: false, reason: `no snapshot of ${item}/${step} — snapshots are taken when a step starts` };
    const dir = path.join(workDir, 'replay', `${item}-${step}-${model}`);
    if (fs.existsSync(dir)) return { ok: false, reason: `${path.relative(root, dir)} already exists` };
    const added = git(root, ['worktree', 'add', '--detach', dir, commit]);
    if (added.status !== 0) return { ok: false, reason: added.stderr.trim() };
    const snap = path.join(workDir, item, 'snap', step);
    const into = path.join(dir, workName, item);
    fs.mkdirSync(into, { recursive: true });
    for (const f of fs.existsSync(snap) ? fs.readdirSync(snap) : []) fs.copyFileSync(path.join(snap, f), path.join(into, f));
    return { ok: true, dir, commit };
}

/** Runs the configured checks in a directory; the vector of exit codes is the judgement. */
export function judge(dir, checks = {}, { env = safeEnv() } = {}) {
    const results = {};
    for (const [name, command] of Object.entries(checks)) {
        const started = Date.now();
        const r = spawnSync(command, { cwd: dir, shell: true, encoding: 'utf-8', timeout: 600000, env });
        results[name] = { exit: r.status ?? 124, sec: +((Date.now() - started) / 1000).toFixed(1) };
    }
    return { results, passed: Object.values(results).filter((r) => r.exit === 0).length, total: Object.keys(results).length };
}
