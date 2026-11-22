// govern: proof-carrying work. An item is not "done because an agent said so" and not "allowed
// because a runtime guard did not object": it closes when a policy — a list of plain rules over
// the journal — is satisfied by recorded evidence, and it leaves an attestation that anybody can
// recompute. How far to trust the result is stated as an assurance level with its basis, and how
// far to trust the team is stated from its track record, with an interval.
//
//  evidence  an event { name, ok, value } recorded by the tool that measured it (trace, mutate,
//            scan, a configured command), never typed in by the agent whose work it judges;
//  facts     derived from the journal alone: the verdict, who judged, forced steps, waivers;
//  policy    rules: a fact or a piece of evidence, the level it belongs to, block or warn;
//  waiver    a named human decision to close despite a failed rule — recorded, counted, and it
//            caps the level; it never turns a failed rule into a passed one.
//  unknown   a fact nobody established is not a fact in favour: an unverified journal, an unnamed
//            judge or missing evidence fail their rule exactly as a bad result would (fail-closed).
//  source    evidence carries the state of the sources it was measured on; measured on another
//            state, it is stale (see proof.mjs).
import { interval } from './evalx.mjs';
import { itemState } from './flow.mjs';
import { closedItems, ofItem, stateOf } from './journal.mjs';
import { canon } from './canon.mjs';
import { sha, sha256 } from './text.mjs';

export const LEVELS = ['L0 claimed', 'L1 reproduced', 'L2 specified', 'L3 falsified', 'L4 calibrated'];
export const DEFAULT_POLICY = [
    { id: 'verdict', level: 1, fact: 'verdict', equals: 'PASS', why: 'an inspector re-ran the checks and passed the item' },
    { id: 'independent', level: 1, fact: 'independent', equals: true, why: 'the agent that judged did not produce the work' },
    { id: 'no-forced-steps', level: 1, fact: 'forced', max: 0, why: 'no step of the flow was skipped or run out of order, and no verdict was forced' },
    { id: 'journal-intact', level: 1, fact: 'journalIntact', equals: true, why: 'the history of the item was not edited' },
    { id: 'scan', level: 1, evidence: ['scan'], ok: true, why: 'no secret, forbidden path, dangerous command or injected instruction' },
    { id: 'approvals', level: 1, fact: 'missingApprovals', max: 0, why: 'every change that needs a human approval has one' },
    { id: 'specified', level: 2, evidence: ['trace', 'accept'], ok: true, why: 'every requirement is claimed by a test or an acceptance scenario' },
    { id: 'checks', level: 2, fact: 'failedChecks', max: 0, why: 'the configured project checks pass on the final state' },
    { id: 'falsified', level: 3, evidence: ['mutate'], min: 0.8, why: 'at least 80 % of deliberate breakages of the changed code were noticed by tests' },
    { id: 'seams', level: 3, evidence: ['neighbours'], ok: true, why: 'the tests of neighbouring code were run after the change' },
    { id: 'no-waivers', level: 4, fact: 'waivers', max: 0, why: 'nothing was waived' },
    { id: 'calibrated', level: 4, fact: 'guardCatchLow', min: 0.6, why: 'the guards demonstrably catch planted defects (lower bound of the catch rate)' },
];

/** Latest evidence per name for an item; `stale` when recorded before the last producing step ended. */
// Evidence with a scope is judged by its scope (trust decay); without one, by the whole tree.
export function evidenceOf(events, item, { before = ['red', 'plan'], source = null, scopes = null } = {}) {
    const movedOn = (e) => (scopes && e.scope && scopes[e.name] !== undefined ? e.scope.digest !== scopes[e.name] : !!source && !!stateOf(e) && stateOf(e) !== source);
    const mine = ofItem(events, item);
    const state = itemState(events, item);
    const producing = new Set((state?.steps ?? []).filter((s) => s.agent && !s.verdict && !s.bookkeeping && !s.gates).map((s) => s.id));
    const lastChange = mine.filter((e) => e.kind === 'step.end' && producing.has(e.step)).at(-1);
    const at = (e) => mine.indexOf(e);
    const out = {};
    for (const e of mine.filter((x) => x.kind === 'evidence')) out[e.name] = { ok: e.ok, value: e.value ?? null, detail: e.detail ?? null, at: e.at, by: e.by ?? null, stale: (!before.includes(e.name) && !!lastChange && at(e) < at(lastChange)) || movedOn(e), src: stateOf(e) ?? null };
    return out;
}

/** What the journal alone says about an item. `project` carries cross-item facts (journal integrity, guard calibration). */
/**
 * The judge is independent when it is another agent AND, where runs are recorded, another run: one
 * session playing two roles is one mind. With `identity: "required"` a missing run id is unknown, not fine.
 */
function independence(mine, steps, judge, producers, project) {
    if (judge === null) return false;
    if (producers.has(judge)) return false;
    const verdictSteps = new Set(steps.filter((s) => s.verdict).map((s) => s.id));
    const starts = mine.filter((e) => e.kind === 'step.start');
    const runOf = (e) => e.run ?? e.s ?? null;
    const judgeRuns = new Set(starts.filter((e) => verdictSteps.has(e.step)).map(runOf).filter(Boolean));
    const producerStarts = starts.filter((e) => !verdictSteps.has(e.step) && producers.has(e.agent));
    if (producerStarts.some((e) => runOf(e) && judgeRuns.has(runOf(e)))) return false;
    if (project.identity === 'required' && (!judgeRuns.size || producerStarts.some((e) => !runOf(e)))) return null;
    return true;
}

export function factsOf(events, item, { project = {}, checks = [], source = null, scopes = null } = {}) {
    const mine = ofItem(events, item);
    const state = itemState(events, item);
    const steps = state?.steps ?? [];
    const judge = steps.find((s) => s.verdict)?.agent ?? null;
    const producers = new Set(steps.filter((s) => s.agent && !s.verdict && !s.bookkeeping && !s.gates).map((s) => s.agent));
    const ev = evidenceOf(events, item, { source, scopes });
    const needed = new Set(mine.filter((e) => e.kind === 'evidence' && e.name === 'scan').at(-1)?.approvals ?? []);
    const granted = new Set(mine.filter((e) => e.kind === 'approval').map((e) => e.what));
    return {
        verdict: mine.filter((e) => e.kind === 'verdict').at(-1)?.verdict ?? null,
        independent: independence(mine, steps, judge, producers, project),
        forced: mine.filter((e) => (e.kind === 'step.start' || e.kind === 'verdict') && e.forced).length,
        // a step ended DONE over a failed handoff check: not a skipped step, so not a failed rule, but never hidden
        forcedEnds: mine.filter((e) => e.kind === 'step.end' && e.forced).map((e) => ({ step: e.step, reason: e.reason ?? null })),
        waivers: mine.filter((e) => e.kind === 'waiver').length,
        cycles: state?.cycles ?? 0,
        journalIntact: project.journalIntact ?? null, // null = nobody verified the journal: unknown, and unknown does not pass
        guardCatchLow: project.guardCatchLow ?? 0,
        missingApprovals: [...needed].filter((a) => !granted.has(a)).length,
        failedChecks: checks.filter((name) => !ev[name] || !ev[name].ok || ev[name].stale).length,
    };
}

const applies = (rule, route) => !rule.when?.route || route.includes(rule.when.route);

/** Every rule with its outcome and the reason in words. */
export function evaluate(events, item, { policy = DEFAULT_POLICY, project = {}, checks = [], source = null, scopes = null } = {}) {
    const facts = factsOf(events, item, { project, checks, source, scopes });
    const ev = evidenceOf(events, item, { source, scopes });
    const route = (itemState(events, item)?.steps ?? []).map((s) => s.agent).filter(Boolean);
    const waived = new Map(ofItem(events, item).filter((e) => e.kind === 'waiver').map((e) => [e.rule, e]));
    const results = policy.filter((r) => applies(r, route)).map((rule) => {
        let pass;
        let got;
        if (rule.fact) {
            got = facts[rule.fact];
            if (got === null || got === undefined) return { id: rule.id, level: rule.level ?? 1, severity: rule.severity ?? 'block', pass: false, unknown: true, got: 'unknown', why: rule.why ?? '', waived: waived.has(rule.id) ? waived.get(rule.id).reason : null };
            pass = rule.equals !== undefined ? got === rule.equals : rule.max !== undefined ? got <= rule.max : rule.min !== undefined ? got >= rule.min : !!got;
        } else {
            const found = rule.evidence.map((n) => [n, ev[n]]).filter(([, e]) => e);
            const good = found.find(([, e]) => !e.stale && (rule.min !== undefined ? Number(e.value) >= rule.min : e.ok === (rule.ok ?? true)));
            pass = !!good;
            got = good ? `${good[0]}${good[1].value !== null ? ` ${good[1].value}` : ''}` : found.length ? found.map(([n, e]) => `${n} ${e.stale ? 'stale' : e.value !== null ? e.value : e.ok ? 'ok' : 'failed'}`).join(', ') : 'no evidence';
        }
        return { id: rule.id, level: rule.level ?? 1, severity: rule.severity ?? 'block', pass, got, why: rule.why ?? '', waived: !pass && waived.has(rule.id) ? waived.get(rule.id).reason : null };
    });
    let level = 0;
    for (let l = 1; l < LEVELS.length; l++) {
        if (results.filter((r) => r.level === l).every((r) => r.pass)) level = l;
        else break;
    }
    return { item, level, label: LEVELS[level], results, facts, evidence: ev };
}

/** May the item close? Rules up to `required` level must pass or be waived. */
export function gate(evaluation, { required = 1 } = {}) {
    // a waiver is a person accepting a known failure; an unknown cannot be accepted, only established
    const failing = evaluation.results.filter((r) => r.level <= required && r.severity === 'block' && !r.pass && (!r.waived || r.unknown));
    return { allow: failing.length === 0, required, failing, waived: evaluation.results.filter((r) => r.waived) };
}

/** A self-describing record of why the item was allowed to close. Recomputable from the journal. */
export function attest(events, item, options = {}) {
    const e = evaluate(events, item, options);
    const mine = ofItem(events, item);
    const body = {
        item,
        level: e.label,
        rules: e.results.map(({ id, level, pass, got, waived }) => ({ id, level, pass, got, waived })),
        evidence: Object.fromEntries(Object.entries(e.evidence).map(([k, v]) => [k, { ok: v.ok, value: v.value, stale: v.stale }])),
        waivers: mine.filter((x) => x.kind === 'waiver').map(({ rule, reason, by }) => ({ rule, reason, by: by ?? null })),
        approvals: mine.filter((x) => x.kind === 'approval').map(({ what, by }) => ({ what, by: by ?? null })),
        commits: mine.find((x) => x.kind === 'item.close')?.commits ?? [],
        events: mine.length,
        policy: policyHash(options.policy ?? DEFAULT_POLICY),
    };
    return { ...body, digest: digestOf(body) };
}
/**
 * The hash of a policy: SHA-256 of its canonical text. A proof compares it with the hash of the policy
 * the verifier holds, so it must resist a deliberate match — before 0.7.1 it was 12 characters of
 * SHA-1, and a weaker policy with the same 48 bits could be searched for. Those are not accepted.
 */
export const policyHash = (policy) => sha256(canon(policy));
export const LEGACY_POLICY_HASH = /^[0-9a-f]{12}$/;
/** The policy hash a proof made before 0.7.1 carries (12 characters of SHA-1): such a proof is legacy and is checked by this, its own rule. */
export const legacyPolicyHash = (policy) => sha(JSON.stringify(policy ?? DEFAULT_POLICY), 12);
/**
 * The digest of an attestation body (everything except the digest itself): SHA-256 of its canonical
 * text. A digest is not a signature — whoever edits the file can recompute it — so an attestation
 * written before 0.7.1 (16 characters of SHA-1) is still checked by its own rule.
 */
export const digestOf = ({ digest, ...body }) => (/^[0-9a-f]{16}$/.test(digest ?? '') ? sha(JSON.stringify(body), 16) : sha256(canon(body)));

/** Guard calibration from planted defects: how often did each guard notice? */
export function calibration(events) {
    const by = new Map();
    for (const e of events.filter((x) => x.kind === 'canary')) {
        const g = by.get(e.guard) ?? { guard: e.guard, n: 0, caught: 0 };
        g.n++;
        if (e.caught) g.caught++;
        by.set(e.guard, g);
    }
    return [...by.values()].map((g) => ({ ...g, rate: +(g.caught / g.n).toFixed(2), ...interval(g.caught, g.n) }));
}

/** The track record of the team: what was closed at which level, what escaped, what was waived. */
export function trust(events, options = {}) {
    const closed = closedItems(events);
    const cal = calibration(events);
    const project = { ...options.project, guardCatchLow: cal.length ? Math.min(...cal.map((c) => c.low)) : 0 };
    const levels = LEVELS.map(() => 0);
    const perItem = closed.map((item) => {
        const e = evaluate(events, item, { ...options, project });
        levels[e.level]++;
        return { item, level: e.level };
    });
    const escaped = new Set(events.filter((e) => e.kind === 'escape').map((e) => e.item));
    const escapes = closed.filter((id) => escaped.has(id)).length;
    const esc = interval(escapes, closed.length);
    const firstPass = closed.filter((id) => (itemState(events, id)?.cycles ?? 0) === 0).length;
    return {
        closed: closed.length,
        levels: Object.fromEntries(LEVELS.map((l, i) => [l, levels[i]])),
        escapes: { n: escapes, rate: closed.length ? +(escapes / closed.length).toFixed(2) : null, atMost: closed.length ? esc.high : null },
        firstPass: closed.length ? +(firstPass / closed.length).toFixed(2) : null,
        waivers: events.filter((e) => e.kind === 'waiver').length,
        forced: events.filter((e) => (e.kind === 'step.start' || e.kind === 'verdict') && e.forced).length,
        forcedEnds: events.filter((e) => e.kind === 'step.end' && e.forced).length,
        calibration: cal,
        perItem,
    };
}

export function renderEvaluation(e, g) {
    return [
        `${e.item}: ${e.label}${g ? ` · gate (needs L${g.required}): ${g.allow ? 'ALLOW' : 'DENY'}` : ''}`,
        ...e.results.map((r) => `  ${r.pass ? '✓' : r.waived ? '~' : '✗'} L${r.level} ${r.id.padEnd(16)} ${String(r.got).padEnd(18)} ${r.pass ? r.why : r.unknown ? `UNKNOWN, so not met — ${r.why}` : r.waived ? `waived: ${r.waived}` : `NOT MET — ${r.why}`}`),
        ...(e.facts?.forcedEnds?.length ? [`  ! ${e.facts.forcedEnds.length} step(s) ended DONE with --force over a failed handoff check: ${e.facts.forcedEnds.map((f) => `${f.step}${f.reason ? ` (${f.reason})` : ''}`).join(', ')}`] : []),
    ].join('\n');
}

export function renderTrust(t) {
    const pct = (x) => (x === null ? '—' : `${Math.round(x * 100)}%`);
    const lines = [
        `closed items: ${t.closed} — ${Object.entries(t.levels).filter(([, n]) => n).map(([l, n]) => `${l}: ${n}`).join(' · ') || 'none yet'}`,
        t.closed ? `defects found after closing: ${t.escapes.n} of ${t.closed} (${pct(t.escapes.rate)}); with about 80 % confidence at most ${pct(t.escapes.atMost)} of closed items carry a defect that gets found later` : 'no track record yet: the statements below need closed items',
        `passed without rework: ${pct(t.firstPass)} · waivers: ${t.waivers} · forced steps: ${t.forced}${t.forcedEnds ? ` · steps ended with --force: ${t.forcedEnds}` : ''}`,
        t.calibration.length ? 'guards against planted defects:' : 'guards have not been calibrated: plant defects with `facet canary` to learn how much a PASS is worth',
        ...t.calibration.map((c) => `  ${c.guard.padEnd(20)} caught ${c.caught} of ${c.n} (${c.low}–${c.high})`),
        'This is a record of what was checked, not a guarantee: defects nobody found are not counted, and a level says which evidence exists, not that the evidence is sufficient for your risk.',
    ];
    return lines.join('\n');
}
