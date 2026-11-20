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
 * be got wrong. The id is also given to the command as FACET_ITEM.
 */
export function withItem(cmd, item) {
    if (!cmd.includes('{item}')) return cmd;
    if (!SAFE_ITEM.test(String(item ?? ''))) throw new Error(`the item id ${JSON.stringify(item)} cannot be put into a command line (allowed: ${SAFE_ITEM.source}); read FACET_ITEM in the command instead of {item}`);
    return cmd.replaceAll('{item}', item);
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

/** Spawns a command line through the platform's shell, as its own process group where the platform has them. */
export const spawnShell = (cmd, { cwd, env, stdio = ['ignore', 'pipe', 'pipe'] } = {}) => spawn(cmd, { cwd, env, stdio, shell: true, detached: process.platform !== 'win32', windowsHide: true });

/** Runs a command line through the platform's shell and waits. Returns { status, stdout, stderr, timedOut }. */
export function runShellSync(cmd, { cwd, env = process.env, timeoutSec = 300 } = {}) {
    const r = spawnSync(cmd, { cwd, env, encoding: 'utf-8', shell: true, timeout: timeoutSec * 1000, windowsHide: true, killSignal: 'SIGKILL' });
    const timedOut = r.error?.code === 'ETIMEDOUT';
    return { status: timedOut ? 124 : r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', timedOut };
}
