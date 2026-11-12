// secscan: deterministic security checks on what an item changed and did. No model is asked
// whether something "looks safe": the diff, the run ledger and the text stores agents read are
// matched against explicit rules, and every finding names its place. Secrets are never echoed.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SECRETS = [
    ['private key block', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
    ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
    ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
    ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
    ['Stripe live key', /\b[sr]k_live_[A-Za-z0-9]{16,}\b/],
    ['JSON web token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
    ['assigned secret', /\b(?:api[_-]?key|secret|token|passwd|password|private[_-]?key)\b["']?\s*[:=]\s*["'`]([^"'`\s]{12,})["'`]/i],
];
const PLACEHOLDER = /example|changeme|change-me|placeholder|your[_-]|dummy|xxxx|<[^>]+>|\$\{|process\.env|test[_-]?(key|secret|token)|^[*•.]+$/i;
const COMMANDS = [
    ['recursive delete of a root or home path', /\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(?:\/|~|\$HOME)(?:\s|$)/],
    ['pipe from the network into a shell', /\b(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/],
    ['forced push', /\bgit\s+push\b.*(?:--force\b|-f\b|--force-with-lease\b)/],
    ['history rewrite', /\bgit\s+(?:reset\s+--hard|filter-branch|rebase\b.*--root)/],
    ['hooks bypassed', /--no-verify\b/],
    ['world-writable permissions', /\bchmod\s+(?:-R\s+)?0?777\b/],
    ['package publication', /\b(?:npm|pnpm|yarn)\s+publish\b/],
];
const INJECTION = /ignore (?:all )?(?:the )?(?:previous|prior|above) instructions|disregard (?:all |the )?(?:previous|prior|above|system)|you are now (?:in|a|an)\b|reveal (?:the |your )?system prompt|do not (?:tell|inform) the user|exfiltrat/i;
const glob = (pattern) => new RegExp(`^${pattern.replace(/[.+^$()|[\]\\{}]/g, '\\$&').replace(/\*\*/g, '§§').replace(/\*/g, '[^/]*').replaceAll('§§', '.*')}$`);
const mask = (s) => `${s.slice(0, 4)}…(${s.length} chars)`;

/** Secrets in a text. Lines are 1-based; `lines` limits the scan to those lines (added lines of a diff). */
export function scanSecrets(text, where, lines) {
    const out = [];
    text.split('\n').forEach((line, i) => {
        if ((lines && !lines.has(i + 1)) || line.includes('facet:allow-secret')) return; // the marker is for fixtures and documentation
        for (const [name, re] of SECRETS) {
            const m = re.exec(line);
            if (!m || (m[1] !== undefined && PLACEHOLDER.test(m[1]))) continue;
            out.push({ kind: 'secret', severity: 'block', where: `${where}:${i + 1}`, what: `${name} ${mask(m[1] ?? m[0])}` });
            break;
        }
    });
    return out;
}
export const scanCommands = (runs) => runs.filter((r) => r.kind === 'run').flatMap((r) => COMMANDS.filter(([, re]) => re.test(r.cmd)).map(([name]) => ({ kind: 'command', severity: 'block', where: `ledger ${r.at ?? ''}`.trim(), what: `${name}: ${r.cmd.slice(0, 80)}` })));
export const scanInjection = (text, where) => text.split('\n').flatMap((line, i) => (INJECTION.test(line) ? [{ kind: 'injection', severity: 'block', where: `${where}:${i + 1}`, what: 'text addressed to an agent as an instruction' }] : []));

/** Files changed since `ref` (tracked and untracked) with the numbers of their added lines. */
export function changedSince(root, ref = 'HEAD') {
    const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf-8' }).stdout ?? '';
    const files = new Map();
    let file = null;
    for (const line of git('diff', '-U0', ref).split('\n')) {
        if (line.startsWith('+++ ')) file = line.startsWith('+++ b/') ? line.slice(6) : null;
        const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
        if (!h || !file) continue;
        const set = files.get(file) ?? new Set();
        for (let i = 0; i < (h[2] === undefined ? 1 : Number(h[2])); i++) set.add(Number(h[1]) + i);
        files.set(file, set);
    }
    for (const f of git('diff', '--name-only', ref).split('\n').filter(Boolean)) if (!files.has(f)) files.set(f, new Set());
    for (const f of git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) files.set(f, null);
    return files;
}

/** New dependency names in a package.json compared with `ref`. */
export function newDependencies(root, ref = 'HEAD', file = 'package.json') {
    const read = (text) => {
        try {
            const p = JSON.parse(text);
            return new Set(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'].flatMap((k) => Object.keys(p[k] ?? {})));
        } catch {
            return new Set();
        }
    };
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) return [];
    const before = read(spawnSync('git', ['show', `${ref}:${file}`], { cwd: root, encoding: 'utf-8' }).stdout ?? '');
    return [...read(fs.readFileSync(abs, 'utf-8'))].filter((d) => !before.has(d));
}

/**
 * The whole scan of an item. Findings with severity `block` fail the check; `approve` needs a
 * recorded human approval of that name; `warn` is reported. `ignore` lists globs whose content is
 * not searched for secrets (test fixtures); a single line can carry the marker `facet:allow-secret`.
 */
export function scan(root, { ref = 'HEAD', forbidden = [], ignore = [], runs = [], stores = [], maxBytes = 400000 } = {}) {
    const findings = [];
    const changed = changedSince(root, ref);
    // removing a path from the repository (git rm, or git rm --cached with the file ignored) is what a forbidden path
    // asks for, not a change of it; a file left untracked and not ignored would be added back, so it still counts
    const removed = new Set((spawnSync('git', ['diff', '--name-only', '--diff-filter=D', ref], { cwd: root, encoding: 'utf-8' }).stdout ?? '').split('\n').filter(Boolean));
    for (const [file, lines] of changed) {
        if (removed.has(file) && lines !== null) continue;
        if (forbidden.some((g) => glob(g).test(file))) findings.push({ kind: 'forbidden-path', severity: 'block', where: file, what: 'a path that must never be changed or added' });
        const abs = path.join(root, file);
        if (ignore.some((g) => glob(g).test(file)) || !fs.existsSync(abs) || fs.statSync(abs).size > maxBytes) continue; // ignored files are still checked against forbidden paths
        const text = fs.readFileSync(abs, 'utf-8');
        if (text.includes('\u0000')) continue;
        findings.push(...scanSecrets(text, file, lines ?? undefined));
    }
    for (const dep of newDependencies(root, ref)) findings.push({ kind: 'new-dependency', severity: 'approve', where: 'package.json', what: dep, approval: `dependency:${dep}` });
    findings.push(...scanCommands(runs));
    for (const store of stores) {
        const abs = path.join(root, store);
        if (!fs.existsSync(abs)) continue;
        const files = fs.statSync(abs).isDirectory() ? fs.readdirSync(abs).filter((f) => /\.(md|json|jsonl|txt)$/.test(f)).map((f) => path.join(store, f)) : [store];
        for (const f of files) findings.push(...scanInjection(fs.readFileSync(path.join(root, f), 'utf-8'), f));
    }
    return { files: changed.size, findings, blocking: findings.filter((f) => f.severity === 'block').length, approvals: findings.filter((f) => f.severity === 'approve').map((f) => f.approval) };
}
