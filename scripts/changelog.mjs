#!/usr/bin/env node
// changelog: every pull request writes its entry as a file of its own in changelog.d/, so that
// parallel pull requests never edit the same lines of CHANGELOG.md. A release gathers them.
//
//   node scripts/changelog.mjs check [--base origin/main]   the fragments are well formed; with --base,
//                                                          the change adds one and leaves CHANGELOG.md alone
//   node scripts/changelog.mjs release <version> [--date YYYY-MM-DD]
//                                                          the Unreleased entries and every fragment become
//                                                          the section of <version>; the fragments are removed
//                                                          only after CHANGELOG.md was written and read back
//
// A fragment: changelog.d/<id>-<slug>.md — <id> the pull request number or another unique token — with
// one or more of the sections ### Added, Changed, Deprecated, Removed, Fixed, Security, each with bullets.
// A change with nothing for users says so instead: a fragment holding only `skip: <reason>`.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIR = 'changelog.d';
export const SECTIONS = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];
const NAME = /^([A-Za-z0-9]+)-[a-z0-9][a-z0-9-]*\.md$/;

/** One fragment's text read: { skip, entries: { Added: [bullet, …] }, problems }. A bullet keeps its continuation lines. */
export function parseFragment(text) {
    const problems = [];
    const entries = {};
    const body = String(text ?? '').replace(/\r\n/g, '\n').trim();
    if (!body) return { skip: null, entries, problems: ['the fragment is empty'] };
    const skip = /^skip:\s*(.+)$/i.exec(body);
    if (skip && !body.includes('\n')) return { skip: skip[1].trim(), entries, problems: [] };
    let section = null;
    for (const line of body.split('\n')) {
        const h = /^###\s+(.+?)\s*$/.exec(line);
        if (h) {
            section = h[1];
            if (!SECTIONS.includes(section)) problems.push(`"### ${section}" is not a section (${SECTIONS.join(', ')})`);
            entries[section] ??= [];
            continue;
        }
        if (/^#{1,2}\s/.test(line)) {
            problems.push(`"${line.trim()}": a fragment holds ### sections only — the version heading is written at release`);
            continue;
        }
        if (/^-\s+\S/.test(line)) {
            if (!section) problems.push('a bullet before any ### section');
            else entries[section].push(line);
        } else if (line.trim() && section && entries[section]?.length) entries[section][entries[section].length - 1] += `\n${line}`;
        else if (line.trim()) problems.push(`"${line.trim().slice(0, 60)}" is neither a ### section nor a bullet`);
    }
    for (const [s, list] of Object.entries(entries)) if (SECTIONS.includes(s) && !list.length) problems.push(`"### ${s}" has no bullet`);
    if (!Object.values(entries).some((l) => l.length)) problems.push('no entry: write at least one bullet under a ### section, or `skip: <reason>`');
    return { skip: null, entries, problems };
}

/** Every fragment of a folder: [{ file, id, skip, entries, problems }], README.md left out. */
export function readFragments(root = ROOT) {
    const dir = path.join(root, DIR);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort().map((file) => {
        const m = NAME.exec(file);
        const parsed = parseFragment(fs.readFileSync(path.join(dir, file), 'utf-8'));
        return { file, id: m?.[1] ?? null, ...parsed, problems: [...(m ? [] : [`the name is <id>-<slug>.md (a number or token, then lowercase words with -)`]), ...parsed.problems] };
    });
}

const norm = (bullet) => bullet.replace(/\s+/g, ' ').trim().toLowerCase();

/** What is wrong with the fragments: their own problems, two fragments with one id, the same entry twice. */
export function fragmentProblems(fragments) {
    const out = fragments.flatMap((f) => f.problems.map((p) => `${DIR}/${f.file}: ${p}`));
    const ids = new Map();
    for (const f of fragments) if (f.id) ids.set(f.id, [...(ids.get(f.id) ?? []), f.file]);
    for (const [id, files] of ids) if (files.length > 1) out.push(`${DIR}: the id ${id} is used by ${files.join(' and ')} — one fragment per change`);
    const seen = new Map();
    for (const f of fragments) for (const [s, list] of Object.entries(f.entries)) for (const b of list) {
        const k = `${s}|${norm(b)}`;
        if (seen.has(k)) out.push(`${DIR}/${f.file}: the same entry is already in ${seen.get(k)}`);
        else seen.set(k, f.file);
    }
    return out;
}

/** The files a change touches against a base: [{ status, file }]. */
const changedAgainst = (base, root) => {
    const r = spawnSync('git', ['diff', '--name-status', `${base}...HEAD`], { cwd: root, encoding: 'utf-8' });
    if (r.status !== 0) throw new Error(`git diff ${base}...HEAD: ${r.stderr.trim()}`);
    return r.stdout.split('\n').filter(Boolean).map((l) => ({ status: l[0], file: l.split('\t').at(-1) }));
};

/**
 * What a pull request must satisfy: no edit of CHANGELOG.md (a release does that), and a fragment added —
 * an entry or an explicit skip. `release: true` lets a release pull request write CHANGELOG.md.
 */
export function changeProblems(changes, { release = false } = {}) {
    const out = [];
    if (!release && changes.some((c) => c.file === 'CHANGELOG.md')) out.push('CHANGELOG.md is written at release only: put the entry in changelog.d/<id>-<slug>.md');
    if (!release && !changes.some((c) => c.status === 'A' && c.file.startsWith(`${DIR}/`) && c.file !== `${DIR}/README.md`)) out.push(`no fragment added: add ${DIR}/<pr number>-<slug>.md with the entry, or with "skip: <reason>" when nothing changes for users`);
    return out;
}

/** The text of a section from entries grouped by kind, in the order Keep a Changelog uses. */
const sectionText = (groups) => SECTIONS.filter((s) => groups[s]?.length).map((s) => `### ${s}\n${groups[s].join('\n')}`).join('\n\n');

/** The entries of the Unreleased section of a changelog, grouped; text before its first ### is kept as a lead. */
function unreleasedOf(text) {
    const m = /^## \[Unreleased\][^\n]*\n([\s\S]*?)(?=^## \[)/m.exec(text);
    if (!m) return null;
    const groups = {};
    let lead = [];
    let section = null;
    for (const line of m[1].split('\n')) {
        const h = /^###\s+(.+?)\s*$/.exec(line);
        if (h) {
            section = h[1];
            groups[section] ??= [];
        } else if (/^-\s+\S/.test(line) && section) groups[section].push(line);
        else if (line.trim() && section && groups[section].length) groups[section][groups[section].length - 1] += `\n${line}`;
        else if (line.trim() && !section) lead.push(line);
    }
    return { start: m.index, end: m.index + m[0].length, groups, lead: lead.join('\n').trim() };
}

/**
 * The changelog with a section for `version`: the Unreleased entries and the fragments' entries, each
 * once. Run again on its own result it changes nothing; run when the section exists, it adds only what
 * that section does not hold yet.
 */
export function release(text, fragments, version, date) {
    const un = unreleasedOf(text);
    if (!un) throw new Error('CHANGELOG.md has no "## [Unreleased]" section followed by a released one');
    const head = new RegExp(`^## \\[${version.replace(/[.+]/g, '\\$&')}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[)`, 'm');
    const existing = head.exec(text);
    const groups = {};
    const have = new Set();
    const add = (s, b) => {
        if (have.has(`${s}|${norm(b)}`)) return;
        have.add(`${s}|${norm(b)}`);
        (groups[s] ??= []).push(b);
    };
    let lead = un.lead;
    if (existing) {
        const parsed = unreleasedOf(`## [Unreleased]\n${existing[1]}## [`);
        lead = parsed.lead || lead;
        for (const [s, list] of Object.entries(parsed.groups)) for (const b of list) add(s, b);
    }
    for (const [s, list] of Object.entries(un.groups)) for (const b of list) add(s, b);
    for (const f of fragments) for (const [s, list] of Object.entries(f.entries)) for (const b of list) add(s, b);
    const section = `## [${version}] — ${date}\n\n${lead ? `${lead}\n\n` : ''}${sectionText(groups)}\n\n`;
    const emptied = `${text.slice(0, un.start)}## [Unreleased]\n\n${text.slice(un.end)}`;
    if (existing) return emptied.replace(head, section);
    return emptied.replace(/^## \[(?!Unreleased)/m, `${section}## [`);
}

/** Every entry of the fragments is in the section of the version (read back after writing). */
export function holdsAll(text, fragments, version) {
    const head = new RegExp(`^## \\[${version.replace(/[.+]/g, '\\$&')}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[)`, 'm');
    const body = norm(head.exec(text)?.[1] ?? '');
    return fragments.every((f) => Object.values(f.entries).flat().every((b) => body.includes(norm(b))));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [cmd, version] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !/^\d{4}-\d{2}-\d{2}$/.test(a) && !a.includes('/'));
    const opt = (name) => {
        const i = process.argv.indexOf(`--${name}`);
        return i > 0 ? process.argv[i + 1] : null;
    };
    const fragments = readFragments(ROOT);
    const problems = fragmentProblems(fragments);
    if (cmd === 'check') {
        if (opt('base')) problems.push(...changeProblems(changedAgainst(opt('base'), ROOT), { release: process.argv.includes('--release') }));
        if (problems.length) {
            for (const p of problems) console.error(`changelog: ${p}`);
            process.exit(1);
        }
        console.log(`changelog: ${fragments.length} fragment(s), well formed${opt('base') ? `; the change against ${opt('base')} adds its own and leaves CHANGELOG.md alone` : ''}`);
    } else if (cmd === 'release' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
        if (problems.length) {
            for (const p of problems) console.error(`changelog: ${p}`);
            process.exit(1);
        }
        const file = path.join(ROOT, 'CHANGELOG.md');
        const text = release(fs.readFileSync(file, 'utf-8'), fragments, version, opt('date') ?? new Date().toISOString().slice(0, 10));
        fs.writeFileSync(file, text);
        // the fragments go only once CHANGELOG.md, read back from disk, holds every one of their entries
        if (!holdsAll(fs.readFileSync(file, 'utf-8'), fragments, version)) {
            console.error('changelog: CHANGELOG.md does not hold every fragment after writing — the fragments are kept');
            process.exit(1);
        }
        for (const f of fragments) fs.rmSync(path.join(ROOT, DIR, f.file));
        console.log(`changelog: ${version} — ${fragments.filter((f) => !f.skip).length} fragment(s) gathered, ${fragments.filter((f) => f.skip).length} skip(s); ${fragments.length} file(s) removed`);
    } else {
        console.error('usage: node scripts/changelog.mjs check [--base origin/main] | release <version> [--date YYYY-MM-DD]');
        process.exit(2);
    }
}
