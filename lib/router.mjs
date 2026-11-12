// router: the model of a step is chosen from the team's own results, not from a table of
// opinions. Start from the configured model of the role; go cheaper only where a cheaper model
// has shown, with enough observations, that it holds the line; try a cheaper model on probation
// now and then so the evidence can exist at all; never explore on hard tiers.
export const DEFAULT_ROUTING = { minN: 5, minLow: 0.7, exploreEvery: 0, exploreTiers: ['normal'] };

/**
 * `rows` is the agent × model matrix (see evalx.matrix). Returns { model, reason }.
 * `seen` is the number of closed items this agent has worked on (drives exploration).
 */
export function route({ agent, base, tier = 'normal', rows = [], ladder = ['haiku', 'sonnet', 'opus'], seen = 0, options = {} }) {
    const o = { ...DEFAULT_ROUTING, ...options };
    const rank = (m) => ladder.findIndex((l) => String(m).includes(l));
    if (!base || rank(base) < 0) return { model: base ?? null, reason: 'configured' };
    const mine = rows.filter((r) => r.agent === agent);
    const proven = mine.filter((r) => rank(r.model) >= 0 && rank(r.model) < rank(base) && r.n >= o.minN && r.low >= o.minLow).sort((a, b) => rank(a.model) - rank(b.model))[0];
    if (proven) return { model: ladder[rank(proven.model)], reason: `evidence: ${proven.n} items on ${proven.model}, first-pass at least ${proven.low}` };
    const failed = mine.find((r) => rank(r.model) === rank(base) - 1 && r.n >= o.minN && r.high < o.minLow);
    if (!failed && o.exploreEvery > 0 && o.exploreTiers.includes(tier) && rank(base) > 0 && seen % o.exploreEvery === o.exploreEvery - 1) return { model: ladder[rank(base) - 1], reason: `probation: every ${o.exploreEvery}th item tries one step cheaper to gather evidence`, probation: true };
    return { model: base, reason: failed ? `configured: ${failed.model} was tried and fell short (${failed.low}–${failed.high})` : 'configured' };
}
