// docaudit: what FacetKit's own repository promises in its documents, checked by `facet audit`.
//   SECURITY.md has its threat model (plan 1.1) — a guarantee without one has no meaning;
//   the numbers the READMEs state match their sources (plan 1.10) — "185 tests" drifted while the suite grew.
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

/** Every documentation problem of the repository at `root`, as text lines. */
export async function docProblems(root) {
    const read = (f) => (fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf-8') : null);
    const problems = threatModelProblems(read('SECURITY.md'));
    const script = path.join(root, 'scripts', 'counts.mjs');
    if (fs.existsSync(script)) {
        const { counts, fill, FILES } = await import(pathToFileURL(script).href);
        const values = counts(root);
        for (const f of FILES) for (const s of fill(read(f) ?? '', values).stale) problems.push(`${f}: ${s.name} says ${s.was}, the sources say ${s.now} — run: npm run counts`);
    }
    return problems;
}
