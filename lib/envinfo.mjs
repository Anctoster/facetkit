// envinfo: a measurement belongs to the machine it was taken on. A commit says which sources were
// measured; it does not say with which interpreter, on which system, against which dependency
// versions. The environment record says that, and its digest travels with every benchmark report
// and every proof pack, so "it passed" can be read as "it passed there".
// Nothing secret is recorded: names of set variables from a short allow-list, never their values.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sha256 } from './text.mjs';

const LOCKS = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'go.sum', 'poetry.lock', 'uv.lock', 'requirements.txt', 'Pipfile.lock', 'Cargo.lock', 'pom.xml', 'gradle.lockfile'];
const TOOLS = { git: ['--version'], npm: ['--version'], python3: ['--version'], go: ['version'], java: ['-version'] };
const WATCHED = ['CI', 'NODE_OPTIONS', 'NODE_ENV', 'LANG', 'LC_ALL', 'TZ', 'FACET_WRITER', 'FACET_SESSION', 'FACET_ACTOR', 'FACET_KEY'];
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
export function environment(root = process.cwd(), { tools = true, kit = null } = {}) {
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
        container: fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv'),
        ci: !!process.env.CI,
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
