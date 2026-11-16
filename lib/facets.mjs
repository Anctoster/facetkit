// Skills are folders; a skill is a small index (SKILL.md) plus facets (facets/<id>.md).
// A facet is one rule an agent can apply on its own: Do / Check / Stop / Why.
// compose() merges facets picked from several skills into one loadout under a word budget.
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, wordCount } from './text.mjs';

const SECTION = /^(Do|Check|Stop|Why):/m;

function readFacet(skill, file) {
    const { meta, body } = parseFrontmatter(fs.readFileSync(file, 'utf-8'));
    const title = /^# (.+)$/m.exec(body)?.[1]?.trim() ?? '';
    const part = (name) => new RegExp(`^${name}:\\s*([\\s\\S]*?)(?=^(?:Do|Check|Stop|Why):|(?![\\s\\S]))`, 'm').exec(body)?.[1]?.trim() ?? '';
    return {
        id: meta.id ?? path.basename(file, '.md'),
        skill,
        ref: `${skill}:${meta.id ?? path.basename(file, '.md')}`,
        file,
        title,
        body: body.trim(),
        do: part('Do'),
        check: part('Check'),
        stop: part('Stop'),
        why: part('Why'),
        words: wordCount(body),
        phase: meta.phase ?? [],
        needs: meta.needs ?? [],
        conflicts: meta.conflicts ?? [],
        bounds: meta.bounds ?? {},
        guards: meta.guards ?? [], // failure modes this rule exists to prevent
        footprint: meta.footprint ?? [], // what the journal and the ledger show when the rule was followed
        // May the rule be left out to learn what it is worth? Said explicitly per facet, and nothing is assumed:
        //   no      never — it guards safety, or nothing would catch what it prevents;
        //   replay  only when a finished step is re-run on a copy (facet cf): real work never goes without it;
        //   live    also in real work, and only while every `backstop` — a check a tool enforces — is required by the project.
        // A facet that does not say is treated as `no`.
        withhold: ['no', 'replay', 'live'].includes(meta.ablatable) ? meta.ablatable : null,
        ablatable: meta.ablatable === 'live',
        backstop: meta.backstop ?? [],
        hasSections: SECTION.test(body),
    };
}

/** Loads every skill found in the given directories (later directories may add skills, never replace). */
export function loadSkills(dirs) {
    const skills = [];
    for (const dir of dirs.filter((d) => d && fs.existsSync(d))) {
        for (const name of fs.readdirSync(dir).sort()) {
            const index = path.join(dir, name, 'SKILL.md');
            if (!fs.existsSync(index)) continue;
            if (skills.some((s) => s.name === name)) throw new Error(`skill "${name}" is defined twice (${dir})`);
            const { meta, body } = parseFrontmatter(fs.readFileSync(index, 'utf-8'));
            const facetDir = path.join(dir, name, 'facets');
            const facets = fs.existsSync(facetDir)
                ? fs.readdirSync(facetDir).filter((f) => f.endsWith('.md')).sort().map((f) => readFacet(name, path.join(facetDir, f)))
                : [];
            skills.push({ name, dir: path.join(dir, name), meta, body: body.trim(), words: wordCount(body), facets });
        }
    }
    return skills;
}

/** "skill" or "skill:*" → every facet of the skill; "skill:facet" → one facet. Order is priority. */
export function resolvePicks(skills, picks) {
    const out = [];
    const unknown = [];
    for (const pick of picks) {
        const [skillName, facetId = '*'] = pick.split(':');
        const skill = skills.find((s) => s.name === skillName);
        const found = !skill ? [] : facetId === '*' ? skill.facets : skill.facets.filter((f) => f.id === facetId);
        if (!found.length) unknown.push(pick);
        for (const f of found) if (!out.some((x) => x.ref === f.ref)) out.push(f);
    }
    return { facets: out, unknown };
}

/** Picks configured for a role and phase: `always` first, then the phase list. */
export function loadoutPicks(config, role, phase) {
    const entry = config.roles?.[role];
    if (!entry) throw new Error(`no loadout for role "${role}"`);
    const picks = [...(entry.always ?? []), ...(phase ? (entry.phases?.[phase] ?? []) : Object.values(entry.phases ?? {}).flat())];
    if (phase && !(phase in (entry.phases ?? {}))) throw new Error(`role "${role}" has no phase "${phase}" (has: ${Object.keys(entry.phases ?? {}).join(', ') || 'none'})`);
    return { picks: [...new Set(picks)], budget: entry.budgetWords ?? config.budgetWords ?? 900, model: entry.model ?? null };
}

/**
 * Merges facets into one loadout:
 *  - conflicts: a facet that conflicts with an earlier (higher-priority) one is dropped;
 *  - budget: lowest-priority facets are dropped until the text fits `budget` words;
 *  - bounds: numeric limits declared by facets are merged by taking the strictest value.
 */
export function compose(facets, { budget = 900 } = {}) {
    const used = [];
    const dropped = [];
    for (const facet of facets) {
        const clash = used.find((u) => u.conflicts.includes(facet.ref) || facet.conflicts.includes(u.ref));
        if (clash) dropped.push({ ref: facet.ref, reason: `conflicts with ${clash.ref}` });
        else used.push(facet);
    }
    let total = used.reduce((s, f) => s + f.words, 0);
    while (total > budget && used.length > 1) {
        const last = used.pop();
        total -= last.words;
        dropped.unshift({ ref: last.ref, reason: `over the ${budget}-word budget` });
    }
    const bounds = {};
    for (const f of used) for (const [k, v] of Object.entries(f.bounds)) bounds[k] = k in bounds ? Math.min(bounds[k], v) : v;
    const needs = [...new Set(used.flatMap((f) => f.needs))].sort();
    return { used, dropped, bounds, needs, words: total };
}

/** The loadout as text for the agent: bounds first, then each facet once. */
export function renderLoadout({ used, dropped, bounds, needs, words }, { role, phase, cli = 'facet' } = {}) {
    const lines = [`# Loadout${role ? ` — ${role}` : ''}${phase ? ` / ${phase}` : ''} (${used.length} facets, ${words} words)`, ''];
    if (Object.keys(bounds).length) lines.push(`Bounds (strictest of all facets): ${Object.entries(bounds).map(([k, v]) => `${k} ≤ ${v}`).join(', ')}. Hitting one means stop and report, not try harder.`, '');
    if (needs.length) lines.push(`Tools: ${needs.map((n) => `\`${cli} ${n}\``).join(', ')}.`, '');
    for (const f of used) lines.push(`## ${f.title}  \`${f.ref}\``, '', f.body.replace(/^# .+\n+/, ''), '');
    if (dropped.length) lines.push(`Not loaded: ${dropped.map((d) => `${d.ref} (${d.reason})`).join('; ')}.`);
    return `${lines.join('\n').trimEnd()}\n`;
}
