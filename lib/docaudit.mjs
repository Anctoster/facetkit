// docaudit: what FacetKit's own repository promises in its documents, checked by `facet audit`.
//   SECURITY.md has its threat model (plan 1.1) — a guarantee without one has no meaning;
//   the numbers the READMEs state match their sources (plan 1.10) — "185 tests" drifted while the suite grew.
//   Those numbers are written at release (scripts/release-prepare.mjs), not by every pull request, so that
//   parallel pull requests do not edit the same lines: a drift is a warning here and an error at release
//   (scripts/release-check.mjs).
// Run on the kit itself only: these are statements of this repository, not rules for a project.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const THREAT_MODEL = ['An agent that errs', 'An agent that games the record', 'Foreign content', 'Accidents'];

/** Problems with SECURITY.md's threat model: [] when it names the four sources of harm and what is out of scope. */
export function threatModelProblems(text) {
    if (text === null) return ['SECURITY.md is missing'];
    if (!/^## Threat model$/m.test(text)) return ['SECURITY.md has no "## Threat model" section'];
    const missing = THREAT_MODEL.filter((s) => !text.includes(s));
    return [...missing.map((s) => `SECURITY.md: the threat model does not name "${s}"`), ...(/Out of scope:/.test(text) ? [] : ['SECURITY.md: the threat model does not say what is out of scope'])];
}

/** Every documentation problem of the repository at `root`, as text lines: errors. */
export async function docProblems(root) {
    const read = (f) => (fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf-8') : null);
    return threatModelProblems(read('SECURITY.md'));
}

/** README numbers that differ from their sources: warnings in a pull request, errors at release (countDrift). */
export async function docWarnings(root) {
    return countDrift(root);
}

/** The README numbers that differ from their sources, as text lines. */
export async function countDrift(root) {
    const read = (f) => (fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf-8') : null);
    const problems = [];
    const script = path.join(root, 'scripts', 'counts.mjs');
    if (fs.existsSync(script)) {
        const { counts, fill, FILES } = await import(pathToFileURL(script).href);
        const values = counts(root);
        for (const f of FILES) for (const s of fill(read(f) ?? '', values).stale) problems.push(`${f}: ${s.name} says ${s.was}, the sources say ${s.now} — written at release (npm run counts)`);
    }
    return problems;
}

// ---- A5 (plan 2.11): no rating in an agent's context -----------------------------------------------
// An agent that reads its own trust score, a share, a rating, writes for the number instead of the work.
// The definitions of agents, the loadouts and the handoff templates hold none: numbers of trust stay in
// facet's reports, where people read them. Text in `backticks` is a command or a name and is left out.
const RATING = [/\btrust\s*scores?\b/i, /\b(?:trust|confidence)\s*(?:rating|level)\b\s*[:=]?\s*\d/i, /\btrust(?:ed)?\b[^.\n]{0,30}?\d+(?:\.\d+)?\s*%/i, /\d+(?:\.\d+)?\s*%[^.\n]{0,25}\btrust/i, /\b(?:your|agent'?s?)\s+(?:rating|ranking|score)\b/i, /довери[еяюй]/i, /рейтинг/i, /\bocena zaufania\b|\branking\b/i];
const stripCode = (text) => text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');

/** A5: lines of agent definitions, loadouts and handoff templates that put a rating in the agent's context. */
export function ratingFindings(files) {
    const out = [];
    for (const [file, text] of Object.entries(files)) {
        stripCode(String(text ?? '')).split('\n').forEach((line, i) => {
            const hit = RATING.find((re) => re.test(line));
            if (hit) out.push(`${file}:${i + 1}: a rating in the agent's context ("${line.trim().slice(0, 80)}") — keep trust numbers in facet's reports, out of what agents read (plan 2.11, A5)`);
        });
    }
    return out;
}

/** The files A5 reads in a repository: agent definitions (core, project, domains), loadouts, handoff templates. */
export function ratingSources(root) {
    const files = {};
    const add = (rel) => {
        const abs = path.join(root, rel);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) files[rel.split(path.sep).join('/')] = fs.readFileSync(abs, 'utf-8');
    };
    const dir = (rel, ext) => fs.existsSync(path.join(root, rel)) && fs.readdirSync(path.join(root, rel)).filter((f) => f.endsWith(ext)).forEach((f) => add(path.join(rel, f)));
    for (const d of ['agents', '.claude/agents', 'templates', '.facet/templates']) dir(d, '.md');
    if (fs.existsSync(path.join(root, 'domains'))) for (const d of fs.readdirSync(path.join(root, 'domains'))) dir(path.join('domains', d, 'agents'), '.md');
    for (const f of ['loadouts.json', 'docs/agents/loadouts.json']) add(f);
    return files;
}
