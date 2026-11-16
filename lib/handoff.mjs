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
const paths = (lines) => lines.flatMap((l) => [...l.matchAll(/`([^`\s]+\.[A-Za-z0-9]+)(?::\d+(?:-\d+)?)?(?:#[0-9a-f]+)?`|^\s*-\s+([^\s`(]+\.[A-Za-z0-9]+)/g)].map((m) => m[1] ?? m[2]));

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

/** Files the working tree changed since a set of hashes was taken: { before: Map, after: Map } → [paths]. */
export const changedBetween = (before, after) => [...new Set([...before.keys(), ...after.keys()])].filter((f) => before.get(f) !== after.get(f)).sort();
/** Files changed in the working tree against HEAD (tracked) plus untracked ones. */
export function workingChanges(root) {
    const out = spawnSync('git', ['status', '--porcelain', '-z'], { cwd: root, encoding: 'utf-8' }).stdout ?? '';
    return out.split('\0').filter(Boolean).map((l) => l.slice(3));
}
export function findTemplate(dirs, name) {
    for (const d of dirs) if (d && fs.existsSync(path.join(d, `${name}.md`))) return fs.readFileSync(path.join(d, `${name}.md`), 'utf-8');
    return null;
}
export const renderHandoff = (file, problems) => (problems.length ? [`${file}: ${blocking(problems).length} problem(s)${problems.length > blocking(problems).length ? `, ${problems.length - blocking(problems).length} warning(s)` : ''}`, ...problems.map((p) => `  ${p.kind === 'unsealed' ? '·' : '✗'} ${p.kind.padEnd(15)} ${p.what} — ${p.fix}`)].join('\n') : `${file}: matches its template`);
