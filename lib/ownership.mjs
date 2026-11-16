// ownership: before work starts, every file it will touch has exactly one agent that may change it —
// or is declared shared. A file nobody owns is not handed to whoever touches it first, and two
// equally specific claims are a conflict for a person to settle, not a coin toss.
//
// The manifest (owners.json, or "owners" in the project settings):
//   { "owners": { "src/**": "slice-builder", "test/**": "spec-falsifier" }, "shared": ["package.json"] }
// The most specific pattern wins: more literal characters, then fewer wildcards.

const glob = (pattern) => new RegExp(`^${pattern.replace(/[.+^$()|[\]\\{}]/g, '\\$&').replace(/\*\*/g, '§§').replace(/\*/g, '[^/]*').replaceAll('§§', '.*')}$`);
const specificity = (pattern) => [pattern.replace(/\*/g, '').length, -(pattern.match(/\*/g) ?? []).length];
const cmp = (a, b) => b[0] - a[0] || b[1] - a[1];

/** For each file: { file, owner, pattern } or { file, shared } or { file, unassigned } or { file, conflict: [owners] }. */
export function resolveOwners(files, manifest = {}) {
    const rules = Object.entries(manifest.owners ?? {}).map(([pattern, owner]) => ({ pattern, owner, re: glob(pattern), spec: specificity(pattern) }));
    const shared = (manifest.shared ?? []).map((pattern) => ({ pattern, re: glob(pattern) }));
    return files.map((file) => {
        const f = file.split('\\').join('/');
        const s = shared.find((x) => x.re.test(f));
        if (s) return { file: f, shared: true, pattern: s.pattern };
        const hits = rules.filter((r) => r.re.test(f)).sort((a, b) => cmp(a.spec, b.spec));
        if (!hits.length) return { file: f, unassigned: true };
        const best = hits.filter((h) => cmp(h.spec, hits[0].spec) === 0);
        const owners = [...new Set(best.map((h) => h.owner))];
        return owners.length > 1 ? { file: f, conflict: owners, patterns: best.map((h) => h.pattern) } : { file: f, owner: owners[0], pattern: best[0].pattern };
    });
}

/**
 * A team file that lists territories per agent — { "<agent>": { "paths": ["src/**", …] }, "forbidden": […] } —
 * as an ownership manifest. A path two agents claim stays a conflict, as resolveOwners reports it.
 */
export function ownersFromTerritories(territories = {}) {
    const owners = {};
    for (const [agent, v] of Object.entries(territories)) if (v && Array.isArray(v.paths)) for (const p of v.paths) owners[p] = owners[p] && owners[p] !== agent ? owners[p] : agent;
    return { owners };
}

/** Is the plan workable? `agent` (optional) is who is about to change the files. */
export function checkOwners(files, manifest, { agent = null } = {}) {
    const rows = resolveOwners(files, manifest);
    const unassigned = rows.filter((r) => r.unassigned).map((r) => r.file);
    const conflicts = rows.filter((r) => r.conflict);
    const foreign = agent ? rows.filter((r) => r.owner && r.owner !== agent) : [];
    const byOwner = {};
    for (const r of rows.filter((x) => x.owner)) (byOwner[r.owner] ??= []).push(r.file);
    return { ok: unassigned.length === 0 && conflicts.length === 0 && foreign.length === 0, rows, unassigned, conflicts, foreign, byOwner, shared: rows.filter((r) => r.shared).map((r) => r.file) };
}

export function renderOwners(c, { agent = null } = {}) {
    return [
        ...Object.entries(c.byOwner).map(([owner, list]) => `  ${owner.padEnd(22)} ${list.length} file(s): ${list.slice(0, 4).join(', ')}${list.length > 4 ? ', …' : ''}`),
        c.shared.length ? `  shared                 ${c.shared.join(', ')}` : null,
        ...c.unassigned.map((f) => `  ✗ no owner: ${f} — add a pattern to the owners manifest or declare it shared`),
        ...c.conflicts.map((r) => `  ✗ conflict: ${r.file} is claimed by ${r.conflict.join(' and ')} (${r.patterns.join(', ')})`),
        ...c.foreign.map((r) => `  ✗ ${r.file} belongs to ${r.owner}, not to ${agent}: hand it over instead of editing it`),
        c.ok ? 'ownership: every file has one owner' : 'ownership: NOT workable as planned',
    ].filter(Boolean).join('\n');
}
