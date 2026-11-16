// crosslearn: what one project learned is a hypothesis for the next one — never a fact.
//
//  export   a knowledge pack: per facet the numbers behind its diagnosis (exposures, adherence,
//           effect, counterfactual pairs), the verdicts of judged hypotheses, and the lessons with
//           the situation they hold in. No file names, no handoff text, no journal: nothing that
//           says what the project is about. The context is described by its shape only — the
//           languages, the size, the stack fingerprint — so that a reader can judge similarity.
//  import   lessons from another project enter with a lower starting confidence and a label of
//           origin; they are applied only while they keep proving themselves here, and fade
//           otherwise. Effects from elsewhere are shown next to local ones, never mixed into them.
//  pool     several packs read together: per facet an effect pooled across projects (weighted by
//           the number of observations), the spread between projects, and how many agree in sign.
//           Disagreement is reported, not averaged away.
import { sha256 } from './text.mjs';

export const PACK_SCHEMA = 'facetkit-knowledge/1';
export const IMPORT_START = 0.55; // just above the floor: an imported lesson must be confirmed here to stay

export function exportKnowledge({ project, diagnoses = [], cf = [], hypotheses = [], lessons = [], context = {}, version = null, now = new Date().toISOString() }) {
    const body = {
        schema: PACK_SCHEMA, at: now, facetkit: version,
        source: sha256(String(project), 16), // a stable, anonymous name for the project
        context, // { languages: [...], files: n, items: n, models: [...] }
        facets: diagnoses.filter((d) => d.exposed || d.withheld).map((d) => ({ facet: d.facet, exposed: d.exposed, withheld: d.withheld, adherence: d.adherence?.p ?? null, withRule: d.withRule?.p ?? null, without: d.without?.p ?? null, nWith: d.withRule?.n ?? 0, nWithout: d.without?.n ?? 0, effect: d.effect, verdict: d.verdict })),
        counterfactual: cf.map(({ facet, pairs, helped, hurt, effect, p }) => ({ facet, pairs, helped, hurt, effect, p })),
        hypotheses: hypotheses.map(({ h, v }) => ({ claim: h.claim, facet: h.facet ?? null, metric: h.predicts?.metric, verdict: v.verdict })),
        lessons: lessons.filter((l) => l.status === 'active').map(({ id, kind, facet, when, do: say, basis }) => ({ id, kind, facet, when, do: say, basis })),
    };
    return { ...body, digest: sha256(JSON.stringify(body), 32) };
}

/** Lessons from a pack, ready to be added: renamed, labelled with their origin, started low. */
export function importLessons(pack, existing = [], { by, at = 0 } = {}) {
    if (pack?.schema !== PACK_SCHEMA) throw new Error(`not a ${PACK_SCHEMA} file`);
    if (sha256(JSON.stringify(Object.fromEntries(Object.entries(pack).filter(([k]) => k !== 'digest' && k !== 'signature'))), 32) !== pack.digest) throw new Error('the knowledge pack does not match its own digest: it was changed after export');
    const have = new Set(existing.map((l) => l.id));
    return pack.lessons.map((l) => ({ ...l, id: `X-${pack.source.slice(0, 6)}-${l.id}`, basis: 'imported', origin: { source: pack.source, digest: pack.digest, basis: l.basis }, because: [], status: 'active', learnedAt: at, adoptedBy: by }))
        .filter((l) => !have.has(l.id));
}

/** Facets across packs: pooled effect, spread, agreement. Only rows with observations on both sides count. */
export function pool(packs) {
    const by = new Map();
    for (const p of packs) for (const f of p.facets ?? []) if (f.effect !== null && f.nWith >= 5 && f.nWithout >= 5) by.set(f.facet, [...(by.get(f.facet) ?? []), { source: p.source, effect: f.effect, n: f.nWith + f.nWithout }]);
    for (const p of packs) for (const c of p.counterfactual ?? []) if (c.pairs >= 5) by.set(c.facet, [...(by.get(c.facet) ?? []), { source: `${p.source}:cf`, effect: c.effect, n: c.pairs * 2 }]);
    return [...by.entries()].map(([facet, rows]) => {
        const n = rows.reduce((s, r) => s + r.n, 0);
        const effect = rows.reduce((s, r) => s + r.effect * r.n, 0) / n;
        const positive = rows.filter((r) => r.effect > 0).length;
        const spread = rows.length > 1 ? Math.sqrt(rows.reduce((s, r) => s + r.n * (r.effect - effect) ** 2, 0) / n) : null;
        const agree = Math.max(positive, rows.length - positive);
        return { facet, projects: new Set(rows.map((r) => r.source.split(':')[0])).size, n, effect: +effect.toFixed(3), spread: spread === null ? null : +spread.toFixed(3), agree: `${agree}/${rows.length}`,
            reading: rows.length < 2 ? 'one project: a hypothesis for the others' : agree === rows.length ? (effect > 0 ? 'helps everywhere it was measured' : 'helps nowhere it was measured') : 'projects disagree: the effect depends on the context — read each one' };
    }).sort((a, b) => b.n - a.n);
}
export const renderPool = (rows) => (rows.length ? rows.map((r) => `${r.facet.padEnd(40)} ${r.projects} project(s) · n=${r.n} · effect ${r.effect >= 0 ? '+' : ''}${Math.round(r.effect * 100)} pts${r.spread !== null ? ` ± ${Math.round(r.spread * 100)}` : ''} · same sign ${r.agree}\n${' '.repeat(41)}${r.reading}`).join('\n') : 'no facet has enough observations in any pack');
