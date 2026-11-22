#!/usr/bin/env node
// release-check: is this tag a release that may be published? (used by .github/workflows/release.yml)
//
//   node scripts/release-check.mjs v0.8.0 [--notes FILE]
//
// The tag must be v<version of package.json>, and CHANGELOG.md must have a dated section for that
// version. At release the READMEs' numbers must be the sources' (scripts/counts.mjs) and no fragment
// may be left in changelog.d/ (scripts/release-prepare.mjs gathers them). With --notes the section is written to FILE, for the GitHub release. Exit 1 with a reason
// otherwise — the 0.7.1 tag once pointed at a commit whose package.json said something else.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The changelog section of one version: { date, body } or null. */
export function changelogSection(text, version) {
    const lines = text.split(/\r?\n/);
    const esc = version.replace(/[.+]/g, '\\$&');
    const start = lines.findIndex((l) => new RegExp(`^## \\[${esc}\\](?:\\s+[—-]\\s+(\\d{4}-\\d{2}-\\d{2}))?\\s*$`).test(l));
    if (start < 0) return null;
    const date = lines[start].match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
    let end = lines.findIndex((l, i) => i > start && /^## \[/.test(l));
    if (end < 0) end = lines.length;
    return { date, body: lines.slice(start + 1, end).join('\n').trim() };
}

/** Reasons the tag cannot be released; an empty list means it can. */
export function releaseProblems({ tag, pkg, changelog }) {
    const problems = [];
    const version = String(tag ?? '').replace(/^v/, '');
    if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag ?? '')) problems.push(`tag ${JSON.stringify(tag)} is not v<major>.<minor>.<patch>`);
    if (pkg.version !== version) problems.push(`the tag says ${version}, package.json says ${pkg.version} — tag the commit that bumped the version`);
    const section = changelogSection(changelog, version);
    if (!section) problems.push(`CHANGELOG.md has no section "## [${version}] — <date>"`);
    else if (!section.date) problems.push(`the CHANGELOG.md section of ${version} has no date ("## [${version}] — YYYY-MM-DD")`);
    else if (!section.body) problems.push(`the CHANGELOG.md section of ${version} is empty`);
    return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [tag] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    const notesAt = process.argv.indexOf('--notes');
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const problems = releaseProblems({ tag, pkg, changelog });
    // what a pull request only warns about blocks a release: numbers that drifted, fragments not gathered
    const { counts, fill, FILES } = await import('./counts.mjs');
    const values = counts(ROOT);
    for (const f of FILES) for (const s of fill(fs.readFileSync(path.join(ROOT, f), 'utf-8'), values).stale) problems.push(`${f}: ${s.name} says ${s.was}, the sources say ${s.now} — run: npm run release:prepare ${tag.replace(/^v/, '')}`);
    const { readFragments, fragmentProblems } = await import('./changelog.mjs');
    const left = readFragments(ROOT);
    if (left.length) problems.push(`changelog.d/ still holds ${left.length} fragment(s) (${left.map((f) => f.file).slice(0, 4).join(', ')}) — run: npm run release:prepare ${tag.replace(/^v/, '')}`);
    problems.push(...fragmentProblems(left));
    if (problems.length) {
        for (const p of problems) console.error(`release-check: ${p}`);
        process.exit(1);
    }
    const version = tag.replace(/^v/, '');
    if (notesAt > 0) fs.writeFileSync(process.argv[notesAt + 1], `${changelogSection(changelog, version).body}\n`);
    console.log(`release-check: ${tag} — package.json and CHANGELOG.md agree`);
}
