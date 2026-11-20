// Commands configured by a project (checks, decision measures, bug reproductions) are command lines
// written for "the shell". This module runs them through the platform's own shell — /bin/sh on Linux
// and macOS, cmd.exe on Windows — so that one configuration works everywhere, and it stops the whole
// process tree on a timeout, not only the shell that started it.
import { spawn, spawnSync } from 'node:child_process';

/** An item id that may be written into a command line: letters, digits, dot, dash, underscore; no leading dot or dash. */
export const SAFE_ITEM = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/;

/**
 * Puts the item id into a command at `{item}`. An id that could be read by a shell as more than a
 * name is refused rather than quoted: quoting differs between sh and cmd.exe, and a refusal cannot
 * be got wrong.
 */
export function withItem(cmd, item) {
    if (!cmd.includes('{item}')) return cmd;
    if (!SAFE_ITEM.test(String(item ?? ''))) throw new Error(`the item id ${JSON.stringify(item)} cannot be put into a command line: use an id of letters, digits, ".", "_" and "-" (${SAFE_ITEM.source})`);
    return cmd.replaceAll('{item}', item);
}

// ---- environment --------------------------------------------------------------------------------
// A command a project configures (a check, a measure, a reproduction, a test) gets the variables a
// shell and the usual toolchains need, and the ones the project names in govern.env — not everything
// the process holds. Tokens, cloud credentials and keys that happen to be in the environment of the
// person or the CI job stay out of reach of the code under test and of whatever it prints.
/** Variables every command gets: paths, temporary folders, locale, the system folders of Windows, toolchain homes. No secrets. */
export const BASE_ENV = [
    'PATH', 'PATHEXT', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'USER', 'USERNAME', 'LOGNAME', 'SHELL', 'TERM', 'COLORTERM', 'NO_COLOR', 'FORCE_COLOR',
    'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE', 'LC_MESSAGES', 'TZ',
    'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432', 'COMMONPROGRAMFILES', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS',
    'CI', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_RUNTIME_DIR',
    'JAVA_HOME', 'GOPATH', 'GOROOT', 'GOCACHE', 'GOMODCACHE', 'CARGO_HOME', 'RUSTUP_HOME', 'VIRTUAL_ENV', 'CONDA_PREFIX', 'PYTHONPATH', 'PYTHONUTF8', 'PYTHONIOENCODING', 'NODE_PATH', 'NVM_DIR',
    'FACET_WRITER', 'FACET_SESSION', 'FACET_ACTOR',
];
// never handed to a command, whatever govern.env says: where the private key is
const NEVER = new Set(['FACET_KEY', 'FACET_KEYS']);

/**
 * The environment for a configured command. `allow` is govern.env: names, or prefixes ending in `*`
 * (`npm_config_*`), added to BASE_ENV — or the string "inherit" to pass everything, as before.
 * Names compare without case on Windows, where the environment does.
 */
export function safeEnv({ allow = [], env = process.env, platform = process.platform } = {}) {
    if (allow === 'inherit') return Object.fromEntries(Object.entries(env).filter(([k]) => !NEVER.has(k.toUpperCase())));
    const norm = (k) => (platform === 'win32' ? k.toUpperCase() : k);
    const exact = new Set([...BASE_ENV, ...(Array.isArray(allow) ? allow : [])].filter((n) => !n.endsWith('*')).map(norm));
    const prefixes = (Array.isArray(allow) ? allow : []).filter((n) => n.endsWith('*')).map((n) => norm(n.slice(0, -1)));
    return Object.fromEntries(Object.entries(env).filter(([k]) => !NEVER.has(k.toUpperCase()) && (exact.has(norm(k)) || prefixes.some((p) => norm(k).startsWith(p)))));
}

/**
 * The environment of a command run for an item: FACET_ITEM is set only to a safe id. cmd.exe expands
 * %FACET_ITEM% before it parses the line, so an id like "x&calc" would run a second command.
 */
export function itemEnv(item, env = safeEnv()) {
    const out = { ...env };
    if (SAFE_ITEM.test(String(item ?? ''))) out.FACET_ITEM = item;
    else delete out.FACET_ITEM;
    return out;
}

/** Stops a child and everything it started. On POSIX the child must have been started as a group leader (detached). */
export function killTree(child) {
    if (!child?.pid) return;
    try {
        if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        else process.kill(-child.pid, 'SIGKILL');
    } catch {
        try {
            child.kill('SIGKILL');
        } catch {
            // already gone
        }
    }
}

// A child in its own process group does not receive the Ctrl-C typed at facet. So facet stops every
// tree it started when it is interrupted, terminated or exits, rather than leave a check running.
const live = new Set();
let guarded = false;
function guard() {
    if (guarded) return;
    guarded = true;
    const stopAll = () => {
        for (const c of live) killTree(c);
        live.clear();
    };
    process.once('exit', stopAll);
    for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
        process.once(sig, () => {
            stopAll();
            process.exit(code);
        });
    }
}

/** Spawns a command line through the platform's shell, as its own process group where the platform has them. */
export function spawnShell(cmd, { cwd, env, stdio = ['ignore', 'pipe', 'pipe'] } = {}) {
    const child = spawn(cmd, { cwd, env, stdio, shell: true, detached: process.platform !== 'win32', windowsHide: true });
    if (process.platform !== 'win32') {
        guard();
        live.add(child);
        child.once('exit', () => live.delete(child));
    }
    return child;
}

/** Runs a command line through the platform's shell and waits. Returns { status, stdout, stderr, timedOut }. */
export function runShellSync(cmd, { cwd, env = safeEnv(), timeoutSec = 300 } = {}) {
    const r = spawnSync(cmd, { cwd, env, encoding: 'utf-8', shell: true, timeout: timeoutSec * 1000, windowsHide: true, killSignal: 'SIGKILL' });
    const timedOut = r.error?.code === 'ETIMEDOUT';
    return { status: timedOut ? 124 : r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', timedOut };
}
