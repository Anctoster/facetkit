// audit: are the skills well-formed, unique and worth their tokens?
//  structure   — every facet is one rule with Do / Check / Stop / Why and a numeric bound;
//  uniqueness  — no two facets say the same thing; nothing is a rewording of prior art
//                (any folder of other people's skills passed with --prior);
//  optimality  — word budgets per facet, index and loadout; no facet that no loadout uses;
//                no redundant pair inside one loadout; every skill has trials.
import fs from 'node:fs';
import path from 'node:path';
import { compose, loadoutPicks, resolvePicks } from './facets.mjs';
import { MODES } from './skillint.mjs';
import { profile, profileSimilarity, wordCount, words } from './text.mjs';

export const LIMITS = { facetWords: 170, indexWords: 220, duplicate: 0.35, priorError: 0.3, priorWarn: 0.2, redundantInLoadout: 0.3, minTrials: 2 };
const TOOLS = ['run', 'read', 'ledger', 'capsule', 'mutate', 'seams', 'receipt', 'ui', 'trace', 'compose', 'audit', 'flow', 'note', 'mem', 'cost', 'eval', 'retro', 'plan', 'timeline', 'scan', 'check', 'assure', 'waive', 'approve', 'attest', 'trust', 'canary', 'atlas', 'board', 'skill'];

/** Markdown files of other skill collections, cut into ~120-word windows. */
export function loadPrior(dirs) {
    const chunks = [];
    const names = new Set();
    const visit = (root, abs) => {
        for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
            if (entry.name === '.git' || entry.name === 'node_modules') continue;
            const full = path.join(abs, entry.name);
            if (entry.isDirectory()) visit(root, full);
            else if (entry.name.endsWith('.md')) {
                const text = fs.readFileSync(full, 'utf-8');
                const name = /^name:\s*(.+)$/m.exec(text)?.[1]?.trim();
                if (entry.name === 'SKILL.md' && name) names.add(name);
                const w = words(text);
                for (let i = 0; i < w.length; i += 80) chunks.push({ source: path.relative(root, full), profile: profile(w.slice(i, i + 120).join(' ')) });
            }
        }
    };
    for (const dir of dirs) if (fs.existsSync(dir)) visit(path.dirname(dir), dir);
    return { chunks, names };
}

export function audit(skills, config, { prior = { chunks: [], names: new Set() }, limits = LIMITS } = {}) {
    const errors = [];
    const warnings = [];
    const facets = skills.flatMap((s) => s.facets);
    const profiles = new Map(facets.map((f) => [f.ref, profile(`${f.title}\n${f.body}`)]));

    for (const skill of skills) {
        const at = `${skill.name}/SKILL.md`;
        if (skill.meta.name !== skill.name) errors.push(`${at}: frontmatter name must equal the folder name`);
        const d = skill.meta.description ?? '';
        if (!/^Use when\b/.test(d)) errors.push(`${at}: description must start with "Use when" — it is the trigger, not a summary`);
        if (d.length > 300) errors.push(`${at}: description is ${d.length} characters (limit 300)`);
        if (skill.words > limits.indexWords) errors.push(`${at}: ${skill.words} words (limit ${limits.indexWords}) — the index is read every time`);
        if (prior.names.has(skill.name)) errors.push(`${at}: a skill with this name exists in the prior art`);
        if (!skill.facets.length) errors.push(`${at}: no facets`);
        for (const f of skill.facets) if (!skill.body.includes(`\`${f.id}\``)) errors.push(`${at}: facet \`${f.id}\` is not listed in the index`);
        const trials = (skill.body.split(/^## Trials\s*$/m)[1] ?? '').split('\n').filter((l) => /^\d+\./.test(l.trim()));
        if (trials.length < limits.minTrials) errors.push(`${at}: needs at least ${limits.minTrials} numbered trials under "## Trials" (a pressure situation and what passing looks like)`);
        for (const f of skill.facets) {
            const fa = `${skill.name}/facets/${path.basename(f.file)}`;
            if (`${f.id}.md` !== path.basename(f.file)) errors.push(`${fa}: id must equal the file name`);
            if (!f.title) errors.push(`${fa}: no "# Title"`);
            for (const part of ['do', 'check', 'stop', 'why']) if (!f[part]) errors.push(`${fa}: missing "${part[0].toUpperCase()}${part.slice(1)}:"`);
            if (f.words > limits.facetWords) errors.push(`${fa}: ${f.words} words (limit ${limits.facetWords}) — split it`);
            if (f.stop && !/\d/.test(f.stop)) errors.push(`${fa}: Stop has no number — a bound must be countable`);
            if (f.check && wordCount(f.check) < 4) errors.push(`${fa}: Check is too vague to verify`);
            if (f.why && wordCount(f.why) > 40) errors.push(`${fa}: Why is longer than 40 words`);
            for (const tool of f.needs) if (!TOOLS.includes(tool)) errors.push(`${fa}: needs unknown tool "${tool}"`);
            for (const tool of f.needs) if (!f.body.includes(`facet ${tool}`)) warnings.push(`${fa}: declares tool "${tool}" but never shows the command`);
            for (const c of f.conflicts) if (!facets.some((x) => x.ref === c)) errors.push(`${fa}: conflicts with unknown facet ${c}`);
            for (const g of f.guards) if (!MODES.includes(g)) errors.push(`${fa}: guards unknown failure mode "${g}" (see: facet skill modes)`);
            for (const atom of f.footprint) if (!/^(tool:.+|evidence:.+|event:.+|note|runs|red-first)$/.test(atom)) errors.push(`${fa}: footprint atom "${atom}" is not tool:<command>, evidence:<name>, event:<kind>, note, runs or red-first`);
        }
    }

    // uniqueness inside the collection
    const pairs = [];
    for (let i = 0; i < facets.length; i++) for (let j = i + 1; j < facets.length; j++) {
        const s = profileSimilarity(profiles.get(facets[i].ref), profiles.get(facets[j].ref));
        pairs.push({ a: facets[i].ref, b: facets[j].ref, s });
        if (s >= limits.duplicate) errors.push(`duplicate: ${facets[i].ref} and ${facets[j].ref} overlap ${(s * 100).toFixed(0)}% — merge or delete one`);
    }
    // uniqueness against prior art
    const nearest = [];
    for (const f of facets) {
        let best = { s: 0, source: null };
        for (const chunk of prior.chunks) {
            const s = profileSimilarity(profiles.get(f.ref), chunk.profile);
            if (s > best.s) best = { s, source: chunk.source };
        }
        nearest.push({ ref: f.ref, ...best });
        if (best.s >= limits.priorError) errors.push(`not original: ${f.ref} overlaps ${(best.s * 100).toFixed(0)}% with ${best.source}`);
        else if (best.s >= limits.priorWarn) warnings.push(`close to prior art: ${f.ref} ${(best.s * 100).toFixed(0)}% with ${best.source}`);
    }

    // optimality of loadouts
    const usedRefs = new Set();
    const loadouts = [];
    for (const [role, entry] of Object.entries(config.roles ?? {})) {
        for (const phase of Object.keys(entry.phases ?? { '': [] })) {
            const { picks, budget } = loadoutPicks(config, role, phase || undefined);
            const { facets: resolved, unknown } = resolvePicks(skills, picks);
            for (const u of unknown) errors.push(`loadout ${role}/${phase}: unknown pick "${u}"`);
            const result = compose(resolved, { budget });
            for (const d of result.dropped) errors.push(`loadout ${role}/${phase}: ${d.ref} dropped — ${d.reason}`);
            result.used.forEach((f) => usedRefs.add(f.ref));
            for (let i = 0; i < result.used.length; i++) for (let j = i + 1; j < result.used.length; j++) {
                const s = profileSimilarity(profiles.get(result.used[i].ref), profiles.get(result.used[j].ref));
                if (s >= limits.redundantInLoadout) warnings.push(`loadout ${role}/${phase}: ${result.used[i].ref} and ${result.used[j].ref} are ${(s * 100).toFixed(0)}% alike — the agent reads both`);
            }
            loadouts.push({ role, phase, facets: result.used.length, words: result.words, budget, model: entry.model?.[phase] ?? entry.model?.default ?? null });
        }
    }
    const blind = facets.filter((f) => !f.footprint.length);
    if (facets.length && blind.length / facets.length > 0.5) warnings.push(`${blind.length} of ${facets.length} facets have no footprint — whether they are followed cannot be seen (facet skill report)`);
    const aimless = facets.filter((f) => !f.guards.length);
    if (aimless.length) warnings.push(`${aimless.length} facet(s) name no failure mode they guard: ${aimless.slice(0, 4).map((f) => f.ref).join(', ')}${aimless.length > 4 ? ', …' : ''}`);
    for (const f of facets) if (config.roles && !usedRefs.has(f.ref)) errors.push(`dead weight: ${f.ref} is in no loadout — use it or delete it`);

    const maxPair = pairs.reduce((m, p) => (p.s > m.s ? p : m), { s: 0 });
    const maxPrior = nearest.reduce((m, p) => (p.s > m.s ? p : m), { s: 0 });
    return { errors, warnings, stats: { skills: skills.length, facets: facets.length, words: facets.reduce((s, f) => s + f.words, 0), avgWords: facets.length ? Math.round(facets.reduce((s, f) => s + f.words, 0) / facets.length) : 0, maxPair, maxPrior, priorChunks: prior.chunks.length }, loadouts, nearest };
}

export function renderAudit(result, { priorDirs = [] } = {}) {
    const { stats, loadouts, errors, warnings, nearest } = result;
    const pct = (s) => `${(s * 100).toFixed(0)}%`;
    const lines = [
        '# Skill audit', '',
        `- ${stats.skills} skills, ${stats.facets} facets, ${stats.words} words in total, ${stats.avgWords} words per facet on average`,
        `- most similar pair inside the collection: ${stats.maxPair.a ?? '—'} ↔ ${stats.maxPair.b ?? '—'} (${pct(stats.maxPair.s)}; limit ${pct(LIMITS.duplicate)})`,
        stats.priorChunks ? `- closest to prior art: ${stats.maxPrior.ref} ↔ ${stats.maxPrior.source} (${pct(stats.maxPrior.s)}; limit ${pct(LIMITS.priorError)}), compared with ${stats.priorChunks} passages from ${priorDirs.length} collection(s)` : '- prior art: not compared (pass --prior <folder> for each collection)',
        '', '## Loadouts', '', '| Role | Phase | Facets | Words | Budget | Model |', '|---|---|---|---|---|---|',
        ...loadouts.map((l) => `| ${l.role} | ${l.phase || '—'} | ${l.facets} | ${l.words} | ${l.budget} | ${l.model ?? '—'} |`),
    ];
    if (stats.priorChunks) lines.push('', '## Nearest prior art per facet', '', '| Facet | Similarity | Nearest passage |', '|---|---|---|', ...[...nearest].sort((a, b) => b.s - a.s).slice(0, 12).map((n) => `| ${n.ref} | ${pct(n.s)} | ${n.source ?? '—'} |`));
    lines.push('', `## Result: ${errors.length ? 'FAILED' : 'PASSED'}`, '', ...errors.map((e) => `- ✗ ${e}`), ...warnings.map((w) => `- ! ${w}`));
    return `${lines.join('\n')}\n`;
}
