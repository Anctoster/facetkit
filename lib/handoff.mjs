// handoff: the shape of a handoff is checked by a tool when the step ends, not by the inspector at
// the end of the item. On the first eight items of the project this kit grew up in, most rework
// rounds were about handoffs — a missing section, a file that was changed and not listed, an anchor
// that no longer pointed at the code it quoted. Each of those is found here in milliseconds, while
// the agent that wrote the handoff is still in the room, instead of an hour later by the inspector.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { verify as verifyAnchors } from './capsule.mjs';

/** Which template a step's handoff follows. Bookkeeping steps write none. */
export const TEMPLATE_OF = { open: 'order', map: 'context', design: 'design', spec: 'verify', probe: 'verify', red: 'red', build: 'build', ops: 'ops', proof: 'proof' };

/** { maxLines, sections: [names] } from a template: `<!-- max-lines: N -->` and its `## ` headings. */
export function parseTemplate(text) {
    return { maxLines: Number(/max-lines:\s*(\d+)/.exec(text)?.[1] ?? 0) || null, sections: [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim()) };
}
const sectionsOf = (text) => {
    const out = new Map();
    let name = null;
    for (const line of text.split('\n')) {
        const h = /^## (.+)$/.exec(line);
        if (h) out.set((name = h[1].trim()), []);
        else if (name) out.get(name).push(line);
    }
    return out;
};
const PLACEHOLDER = /^\s*(-\s*)?(…|\.\.\.|<[^>]+>|TODO|TBD)?\s*$/;
// a path has an extension or is a dotfile (.gitignore, .env.example): the part before the dot may be empty
const paths = (lines) => lines.flatMap((l) => [...l.matchAll(/`([^`\s]*\.[A-Za-z0-9]+)(?::\d+(?:-\d+)?)?(?:#[0-9a-f]+)?`|^\s*-\s+([^\s`(]*\.[A-Za-z0-9]+)/g)].map((m) => m[1] ?? m[2]));

/**
 * What is wrong with a handoff, most serious first. `changed` (optional) are the files the working
 * tree changed during the step: each must appear under "Files changed".
 * Problems: { kind, what, fix } — kind is one of too-long, missing-section, empty-section,
 * no-evidence, stale-anchor, unlisted-file, unsealed (the last one is a warning).
 */
export function checkHandoff(text, template, { root = null, changed = null } = {}) {
    const t = parseTemplate(template);
    const lines = text.split('\n');
    const got = sectionsOf(text);
    const out = [];
    for (const s of t.sections) {
        if (!got.has(s)) out.push({ kind: 'missing-section', what: `## ${s}`, fix: `add the section "## ${s}" as in the template (write "none" when there is nothing to say)` });
        else if (got.get(s).every((l) => PLACEHOLDER.test(l))) out.push({ kind: 'empty-section', what: `## ${s}`, fix: `fill "## ${s}" or write "none"` });
    }
    if (t.maxLines && lines.filter((l) => l.trim()).length > t.maxLines) out.push({ kind: 'too-long', what: `${lines.filter((l) => l.trim()).length} lines, the limit is ${t.maxLines}`, fix: 'cut repetition; point to files instead of quoting them' });
    if (got.has('Evidence') && !got.get('Evidence').some((l) => /^\s*\$\s+\S.*→\s*exit\s+\d+/.test(l))) out.push({ kind: 'no-evidence', what: '## Evidence has no line "$ <command> → exit <code>"', fix: 'copy the command you ran and its exit code' });
    if (root) for (const a of verifyAnchors(text, root)) {
        if (a.state === 'drifted' || a.state === 'missing') out.push({ kind: 'stale-anchor', what: `${a.ref} ${a.state}`, fix: 'read the range again and run facet capsule seal on the handoff' });
        else if (a.state === 'moved') out.push({ kind: 'stale-anchor', what: `${a.ref} moved to ${a.to}`, fix: 'run facet capsule seal on the handoff' });
        else if (a.state === 'unsealed') out.push({ kind: 'unsealed', what: a.ref, fix: 'facet capsule seal <handoff>' });
    }
    if (changed && got.has('Files changed')) {
        const listed = new Set(paths(got.get('Files changed')));
        const none = got.get('Files changed').some((l) => /\bnone\b/i.test(l));
        for (const f of changed) if (!listed.has(f) && ![...listed].some((x) => f.endsWith(x))) out.push({ kind: 'unlisted-file', what: f, fix: `list ${f} under "## Files changed"${none ? ' (the section says none)' : ''}` });
    }
    const order = ['missing-section', 'unlisted-file', 'stale-anchor', 'no-evidence', 'empty-section', 'too-long', 'unsealed'];
    return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}
export const blocking = (problems) => problems.filter((p) => p.kind !== 'unsealed');

/** The files a handoff lists under "## Files changed". */
export const listedFiles = (text) => (sectionsOf(text).has('Files changed') ? paths(sectionsOf(text).get('Files changed')) : []);

/**
 * Which changed files this step must account for: not the ones another handoff of the item already
 * lists, and — with an ownership manifest — not the ones that belong to another agent. Without this,
 * a step that may not name another agent's files (its territory rule) could never end DONE.
 * `owners` is resolveOwners() output for `changed`; `agent` is the step's agent.
 */
export function filesForStep(changed, { claimedElsewhere = [], owners = null, agent = null } = {}) {
    const elsewhere = new Set(claimedElsewhere);
    const ownerOf = new Map((owners ?? []).map((o) => [o.file, o.owner ?? null]));
    return changed.filter((f) => !elsewhere.has(f) && ![...elsewhere].some((x) => f.endsWith(x)) && !(agent && ownerOf.get(f) && ownerOf.get(f) !== agent));
}

/** Files the working tree changed since a set of hashes was taken: { before: Map, after: Map } → [paths]. */
export const changedBetween = (before, after) => [...new Set([...before.keys(), ...after.keys()])].filter((f) => before.get(f) !== after.get(f)).sort();
/** Files changed in the working tree against HEAD (tracked) plus untracked ones, each file of a new folder by name. */
export function workingChanges(root) {
    // -uall: without it git reports a new folder as one line "dir/", which no handoff can list as a file
    const out = spawnSync('git', ['status', '--porcelain', '-z', '-uall'], { cwd: root, encoding: 'utf-8' }).stdout ?? '';
    return out.split('\0').filter(Boolean).map((l) => l.slice(3));
}
export function findTemplate(dirs, name) {
    for (const d of dirs) if (d && fs.existsSync(path.join(d, `${name}.md`))) return fs.readFileSync(path.join(d, `${name}.md`), 'utf-8');
    return null;
}
export const renderHandoff = (file, problems) => (problems.length ? [`${file}: ${blocking(problems).length} problem(s)${problems.length > blocking(problems).length ? `, ${problems.length - blocking(problems).length} warning(s)` : ''}`, ...problems.map((p) => `  ${p.kind === 'unsealed' ? '·' : '✗'} ${p.kind.padEnd(15)} ${p.what} — ${p.fix}`)].join('\n') : `${file}: matches its template`);

// ---- gates against work declared done without being done (plan 2.10, strategic plan 9.5) -----------
//  H1 every OK a criterion rests on carries a receipt from the tool that measured it, and that tool is
//     the registered one (its command's hash is the one configured now)
//  H2 a working step does not change the checks it is judged by — tests, check scripts, thresholds,
//     the policy; only a record of another role (a person's approval) lifts it
//  H4 no placeholder where the work should be (TODO, FIXME, not implemented, an empty body)
//  H9 the handoff names every criterion of the step with done | blocked | partial, and a reason for the last two

/** Files that hold the checks a step is judged by, unless the project names its own (govern.checkFiles). */
export const CHECK_FILES = ['test/**', 'tests/**', '**/__tests__/**', '**/*.test.*', '**/*.spec.*', '**/test_*.py', '**/*_test.go', 'scripts/checks/**', 'benchmark/**', 'facet.json', '.facet/policy.json', 'domain.json', '**/domain.json'];
/** What a placeholder looks like in an added line, unless the project names its own (govern.placeholders). */
export const PLACEHOLDERS = ['\\bTODO\\b', '\\bFIXME\\b', '\\bXXX\\b', 'NotImplemented(Error)?\\b', "throw new Error\\(\\s*['\"`]not implemented", '\\bunimplemented!\\(', '\\btodo!\\(', '^\\s*pass\\s*(#.*)?$', '\\)\\s*(=>\\s*)?\\{\\s*\\}\\s*;?\\s*$'];
const globRe = (g) => new RegExp(`^${g.replace(/[.+^$()|[\]\\{}]/g, '\\$&').replace(/\*\*\//g, '\u0001').replace(/\*\*/g, '\u0002').replace(/\*/g, '[^/]*').replaceAll('\u0001', '(?:.*/)?').replaceAll('\u0002', '.*')}$`);

/** The files the working tree changed since `base` (a snapshot commit): tracked and new, not ignored. */
export function changedSince(root, base) {
    const tracked = spawnSync('git', ['diff', '--name-only', base], { cwd: root, encoding: 'utf-8' }).stdout.split('\n').filter(Boolean);
    const had = new Set(spawnSync('git', ['ls-tree', '-r', '--name-only', base], { cwd: root, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }).stdout.split('\n').filter(Boolean));
    const fresh = spawnSync('git', ['ls-files', '-o', '--exclude-standard'], { cwd: root, encoding: 'utf-8' }).stdout.split('\n').filter((f) => f && !had.has(f));
    return [...new Set([...tracked, ...fresh])].sort();
}

/** H2: the changed files that hold checks. */
export const checkFileChanges = (changed, patterns = CHECK_FILES) => changed.filter((f) => patterns.map(globRe).some((re) => re.test(f)));

/** H4: added lines that look like a placeholder: [{ file, line, text }]. `added` is { file: [lines added] }. */
export function placeholderLines(added, patterns = PLACEHOLDERS) {
    const res = patterns.map((p) => new RegExp(p, 'i'));
    const out = [];
    for (const [file, lines] of Object.entries(added)) lines.forEach((text, i) => res.some((re) => re.test(text)) && out.push({ file, line: i + 1, text: text.trim().slice(0, 100) }));
    return out;
}

/** The lines the working tree adds to each file against `base` (a commit; HEAD by default) — the whole of a file `base` does not have. */
export function addedLines(root, files, base = 'HEAD') {
    const out = {};
    for (const f of files) {
        const tracked = spawnSync('git', ['cat-file', '-e', `${base}:${f}`], { cwd: root, encoding: 'utf-8' }).status === 0;
        if (!tracked) {
            const abs = path.join(root, f);
            if (fs.existsSync(abs) && fs.statSync(abs).isFile() && fs.statSync(abs).size < 400000) out[f] = fs.readFileSync(abs, 'utf-8').split(/\r?\n/);
            continue;
        }
        const d = spawnSync('git', ['diff', '-U0', base, '--', f], { cwd: root, encoding: 'utf-8' }).stdout;
        out[f] = d.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));
    }
    return out;
}

/** H9: the status the handoff gives each criterion: { id: { status, reason } }; problems for the missing and the unexplained. */
export function criteriaStatus(text, ids) {
    const found = {};
    const problems = [];
    for (const id of ids) {
        const m = new RegExp(`^\\s*[-*]?\\s*\`?${id}\`?\\s*[:—–-]\\s*(done|blocked|partial)\\b\\s*[:—–-]?\\s*(.*)$`, 'im').exec(text);
        if (!m) {
            problems.push({ kind: 'H9', what: `criterion ${id}`, fix: `say "${id}: done", or "${id}: blocked — <why>" / "${id}: partial — <what is left>"` });
            continue;
        }
        found[id] = { status: m[1].toLowerCase(), reason: m[2].trim() || null };
        if (found[id].status !== 'done' && !found[id].reason) problems.push({ kind: 'H9', what: `criterion ${id} is ${found[id].status}`, fix: 'give the reason on the same line' });
    }
    return { found, problems };
}

/**
 * H1: the OKs the criteria rest on, held to their receipts. `evidence`: the latest evidence per name;
 * `commands`: name → configured command (a receipt's `cmd` must be its hash); `builtin`: names facet
 * itself records (scan, trace, …) — measured by facet, they need no receipt.
 */
export function receiptProblems(criteria, evidence, { commands = {}, builtin = [], hash = null } = {}) {
    const out = [];
    for (const c of criteria) {
        const tool = String(c.check ?? '').trim().split(/\s+/)[0];
        if (!tool || tool.startsWith('[')) continue;
        const e = evidence[tool];
        if (!e || !e.ok || builtin.includes(tool)) continue;
        if (!e.receipt) out.push({ kind: 'H1', what: `${c.id}: the OK of ${tool} has no receipt`, fix: `run it with facet check ${tool} (or the domain's tool), which records the receipt` });
        else if (commands[tool] && hash && e.receipt.cmd && e.receipt.cmd !== hash(commands[tool])) out.push({ kind: 'H1', what: `${c.id}: the OK of ${tool} was measured by another command than the registered one`, fix: `run facet check ${tool} again` });
    }
    return out;
}
