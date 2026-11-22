// envinfo: a measurement belongs to the machine it was taken on. A commit says which sources were
// measured; it does not say with which interpreter, on which system, against which dependency
// versions. The environment record says that, and its digest travels with every benchmark report
// and every proof pack, so "it passed" can be read as "it passed there".
// Nothing secret is recorded: names of set variables from a short allow-list, never their values.
//
// isolation (plan 2.7): how far the process that measured was kept from the developer's machine —
//   ci           the environment says it is a CI run (CI is set);
//   container    the process runs in a container (/.dockerenv, /run/.containerenv, or a container
//                runtime named in /proc/1/cgroup);
//   declared:<n> neither is visible, and the project says it runs in <n> (govern.isolation) — for a
//                sandbox that does not show itself, such as Claude Code's. Declared, not observed;
//   none         nothing of the above.
// Observed means "what the environment says": a CI variable can be set by hand. A policy that needs more
// than this asks for a witness in CI (plan 2.4), whose record is signed.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sha256 } from './text.mjs';

const LOCKS = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'go.sum', 'poetry.lock', 'uv.lock', 'requirements.txt', 'Pipfile.lock', 'Cargo.lock', 'pom.xml', 'gradle.lockfile'];
const TOOLS = { git: ['--version'], npm: ['--version'], python3: ['--version'], go: ['version'], java: ['-version'] };
const WATCHED = ['CI', 'NODE_OPTIONS', 'NODE_ENV', 'LANG', 'LC_ALL', 'TZ', 'FACET_WRITER', 'FACET_SESSION', 'FACET_ACTOR', 'FACET_KEY'];
const RUNTIMES = /\b(docker|containerd|kubepods|lxc|podman|libpod|buildkit)\b/;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
/** In a container? The marker files container runtimes leave, or a runtime in the init process's cgroup. */
export function inContainer({ exists = fs.existsSync, read = (f) => fs.readFileSync(f, 'utf-8') } = {}) {
    if (exists('/.dockerenv') || exists('/run/.containerenv')) return true;
    try {
        return RUNTIMES.test(read('/proc/1/cgroup'));
    } catch {
        return false;
    }
}
/** The isolation of this process: ci, container, declared:<name> or none (see the header). */
export function isolationOf({ env = process.env, container = inContainer(), declared = null } = {}) {
    if (declared !== null && declared !== undefined && !SAFE_NAME.test(String(declared))) throw new Error(`govern.isolation must be a short name (letters, digits, ".", "_", "-"), not ${JSON.stringify(declared)}`);
    if (env.CI && env.CI !== 'false' && env.CI !== '0') return 'ci';
    if (container) return 'container';
    return declared ? `declared:${declared}` : 'none';
}
const versionOf = (cmd, args) => {
    const r = spawnSync(cmd, args, { encoding: 'utf-8', timeout: 5000 });
    if (r.error || r.status !== 0) return null;
    const text = `${r.stdout}${r.stderr}`;
    return (/version[ "]+v?(\d+(?:\.\d+)+)/i.exec(text) ?? /(\d+(?:\.\d+)+)/.exec(text))?.[1] ?? null;
};

/** Does this file system tell `a` from `A`? null when the folder holds nothing to test with. */
function caseSensitive(root) {
    const names = fs.existsSync(root) ? fs.readdirSync(root) : [];
    const probe = names.find((n) => n !== n.toUpperCase() && !names.includes(n.toUpperCase()));
    return probe ? !fs.existsSync(path.join(root, probe.toUpperCase())) : null;
}
/** The environment of this process and project. `tools: false` skips the external version probes (five short processes). */
export function environment(root = process.cwd(), { tools = true, kit = null, declared = null } = {}) {
    const locks = Object.fromEntries(LOCKS.filter((f) => fs.existsSync(path.join(root, f))).map((f) => [f, sha256(fs.readFileSync(path.join(root, f)), 16)]));
    const body = {
        node: process.versions.node,
        v8: process.versions.v8,
        platform: process.platform,
        arch: process.arch,
        os: os.release(),
        cpus: os.cpus().length,
        memoryGb: Math.round(os.totalmem() / 2 ** 30),
        endianness: os.endianness(),
        locale: Intl.DateTimeFormat().resolvedOptions().locale,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        // which machine, as a hash: a second run on the same machine is repeatability, not independence (proof.mjs, witnessed)
        host: sha256(os.hostname(), 16),
        container: inContainer(),
        ci: !!process.env.CI,
        isolation: isolationOf({ declared }),
        caseSensitive: caseSensitive(root),
        tools: tools ? Object.fromEntries(Object.entries(TOOLS).map(([cmd, args]) => [cmd, versionOf(cmd, args)])) : null,
        locks,
        variablesSet: WATCHED.filter((k) => process.env[k] !== undefined).sort(),
        facetkit: kit,
    };
    // what decides whether a result is comparable: the runtime, the system family and the dependencies — not how much memory the machine has
    const comparable = { node: body.node.split('.')[0], platform: body.platform, arch: body.arch, tools: body.tools, locks: body.locks, facetkit: body.facetkit };
    return { ...body, digest: sha256(JSON.stringify(body), 16), comparable: sha256(JSON.stringify(comparable), 16) };
}
/** In what two environments differ, in words: [] when a result of one can be compared with the other. */
export function environmentDiff(a, b) {
    if (!a || !b) return ['one of the two records has no environment'];
    const out = [];
    const say = (what, x, y) => x !== y && out.push(`${what}: ${x ?? 'none'} → ${y ?? 'none'}`);
    say('node', a.node?.split('.')[0], b.node?.split('.')[0]);
    say('platform', `${a.platform}/${a.arch}`, `${b.platform}/${b.arch}`);
    say('facetkit', a.facetkit, b.facetkit);
    for (const t of new Set([...Object.keys(a.tools ?? {}), ...Object.keys(b.tools ?? {})])) say(t, a.tools?.[t], b.tools?.[t]);
    for (const l of new Set([...Object.keys(a.locks ?? {}), ...Object.keys(b.locks ?? {})])) say(`dependencies (${l})`, a.locks?.[l], b.locks?.[l]);
    return out;
}
