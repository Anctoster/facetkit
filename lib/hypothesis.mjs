// hypothesis: a belief about how the team works, written so that the journal can prove it wrong.
//
//  claim       one sentence a person would argue about ("with an independent oracle, fewer false passes");
//  prediction  an outcome, a direction and the smallest effect worth having — fixed before any data;
//  test        a design of the intelligence engine (lib/intelligence.mjs) whose analysis is the only judge;
//  verdict     untested → testing → promising → supported, or contradicted → refuted, or
//              no-effect (the interval rules out an effect of the claimed size), or inconclusive.
// A verdict is a function of (hypothesis, analysis): nobody sets it by hand, and it moves when the data does.
import fs from 'node:fs';
import path from 'node:path';

export const VERDICTS = ['untested', 'testing', 'promising', 'supported', 'contradicted', 'refuted', 'no-effect', 'inconclusive'];
const LOWER_IS_BETTER = new Set(['errors', 'falsePasses', 'retries', 'tokens', 'minutes']);

export function newHypothesis({ id, claim, facet = null, metric = 'clean', direction = 'better', margin = 0.05, arm = 'B', against = 'A', design = null, now = new Date().toISOString() }) {
    if (!id || !claim) throw new Error('a hypothesis needs an id and a claim');
    if (!['better', 'worse', 'none'].includes(direction)) throw new Error('direction is better, worse or none');
    if (!(margin > 0)) throw new Error('give the smallest effect worth having (margin > 0): without it "no effect" can never be shown');
    return { schemaVersion: 1, id, claim, facet, predicts: { metric, direction, margin, arm, against }, design, createdAt: now };
}

/** The verdict the data supports. `analysis` is analyseDesign(...) of the hypothesis' design, or null. */
export function judge(h, analysis) {
    if (!analysis) return { verdict: 'untested', why: 'no experiment tests it yet' };
    const row = analysis.arms.find((a) => a.arm === h.predicts.arm) ?? analysis.arms[0];
    const stat = h.predicts.metric === analysis.primary ? row.primary : row.secondary?.find((s) => s.metric === h.predicts.metric);
    if (!row || !stat) return { verdict: 'untested', why: `the design does not measure ${h.predicts.metric} for arm ${h.predicts.arm}` };
    if (/invalid/.test(analysis.verdict)) return { verdict: 'inconclusive', why: analysis.verdict };
    if (!row.enough) return { verdict: 'testing', why: `${row.n ?? 'too few'} comparable units so far` };
    // "better" in the units of the metric: more clean closes, fewer errors
    const sign = LOWER_IS_BETTER.has(h.predicts.metric) ? -1 : 1;
    const [low, high] = [stat.low * sign, stat.high * sign].sort((a, b) => a - b);
    const seen = low > 0 ? 'better' : high < 0 ? 'worse' : 'none';
    const confirmed = analysis.stage === 'confirmed';
    const m = h.predicts.margin;
    if (h.predicts.direction === 'none') return seen === 'none' && low > -m && high < m ? { verdict: confirmed ? 'supported' : 'promising', why: `the effect lies within ±${m}` } : seen === 'none' ? { verdict: 'inconclusive', why: `an effect of ${m} is not ruled out (${low.toFixed(3)}…${high.toFixed(3)})` } : { verdict: confirmed ? 'refuted' : 'contradicted', why: `an effect was found (${seen})` };
    if (seen === h.predicts.direction) return { verdict: confirmed ? 'supported' : 'promising', why: confirmed ? 'found, and found again on an independent sample' : 'found once: repeat it on an independent sample' };
    if (seen !== 'none') return { verdict: confirmed ? 'refuted' : 'contradicted', why: `the opposite was found (${seen})` };
    const best = h.predicts.direction === 'better' ? high : -low; // the largest effect in the predicted direction the data still allows
    return best < m ? { verdict: 'no-effect', why: `any effect is smaller than ${m}, the smallest worth having` } : { verdict: 'inconclusive', why: `neither shown nor ruled out (${low.toFixed(3)}…${high.toFixed(3)}): more units are needed` };
}

const dir = (root) => path.join(root, 'trials', 'hypotheses');
export const loadHypotheses = (root) => (fs.existsSync(dir(root)) ? fs.readdirSync(dir(root)).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir(root), f), 'utf-8'))) : []);
export function saveHypothesis(root, h) {
    fs.mkdirSync(dir(root), { recursive: true });
    fs.writeFileSync(path.join(dir(root), `${h.id}.json`), `${JSON.stringify(h, null, 2)}\n`);
}
export const renderHypotheses = (rows) => (rows.length ? rows.map(({ h, v }) => `${h.id.padEnd(10)} ${v.verdict.padEnd(13)} ${h.claim}\n${' '.repeat(11)}predicts ${h.predicts.metric} ${h.predicts.direction} by ≥ ${h.predicts.margin} · ${h.design ? `design ${h.design}` : 'no design'} · ${v.why}`).join('\n') : 'no hypotheses: facet hypo new <ID> --claim "…" [--facet skill:facet] [--metric clean] [--margin 0.05]');
