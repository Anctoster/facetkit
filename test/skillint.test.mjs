import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { audit } from '../lib/audit.mjs';
import { loadSkills } from '../lib/facets.mjs';
import { readJournal } from '../lib/journal.mjs';
import { adhered, coverage, diagnose, exposures, MODES, withheldFor } from '../lib/skillint.mjs';
import { tmp, write } from './helpers.mjs';

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(KIT, 'bin', 'facet.mjs');
const F = (ref, footprint = [], guards = [], ablatable = true) => ({ ref, footprint, guards, ablatable });

test('withholding: off by default, seeded, one rule at most, never a safety rule', () => {
    const facets = [F('a:one'), F('a:two'), F('a:safety', [], [], false)];
    assert.deepEqual(withheldFor(facets, { item: 'P1', step: 'build' }), []);
    const all = withheldFor(facets, { item: 'P1', step: 'build', rate: 1 });
    assert.equal(all.length, 1);
    assert.notEqual(all[0], 'a:safety');
    assert.deepEqual(withheldFor(facets, { item: 'P1', step: 'build', rate: 1 }), all, 'the same step gives the same draw');
    const share = Array.from({ length: 400 }, (_, i) => withheldFor(facets, { item: `P${i}`, step: 'build', rate: 0.1 }).length).reduce((s, n) => s + n, 0) / 400;
    assert.ok(share > 0.1 && share < 0.3, `about one step in five loses one of two rules at 10 %: ${share}`);
});

test('adherence: a footprint is read from the ledger and the journal; no footprint means unknown', () => {
    const runs = [{ kind: 'run', cmd: 'npm test', exit: 1 }, { kind: 'run', cmd: 'npm test', exit: 0 }, { kind: 'tool', cmd: 'capsule verify' }];
    const events = [{ kind: 'evidence', name: 'trace' }, { kind: 'note' }];
    assert.equal(adhered([], { runs, events }), null);
    assert.equal(adhered(['red-first', 'runs', 'note'], { runs, events }), true);
    assert.equal(adhered(['tool:capsule verify', 'evidence:trace'], { runs, events }), true);
    assert.equal(adhered(['tool:capsule seal'], { runs, events }), false);
    assert.equal(adhered(['red-first'], { runs: [{ kind: 'run', cmd: 'x', exit: 0 }, { kind: 'run', cmd: 'x', exit: 1 }], events }), false, 'a failure after the first green run is not a red-first');
    assert.equal(adhered(['nonsense'], { runs, events }), false);
});

/** A journal of items in which `build` reads the given facets; `spec` tells what happened per item. */
function team(n, spec) {
    const events = [];
    const ledgers = {};
    let t = Date.parse('2026-01-05T09:00:00Z');
    const at = () => new Date((t += 60000)).toISOString();
    for (let i = 0; i < n; i++) {
        const item = `P${i}`;
        const s = spec(i);
        events.push({ at: at(), kind: 'item.open', item, steps: [{ id: 'build', agent: 'builder' }, { id: 'proof', agent: 'inspector', verdict: true }] });
        events.push({ at: at(), kind: 'step.start', item, step: 'build', agent: 'builder', model: s.model ?? 'sonnet', facets: s.facets, withheld: s.withheld });
        ledgers[item] = (s.tools ?? []).map((cmd) => ({ at: at(), kind: 'tool', cmd }));
        events.push({ at: at(), kind: 'step.end', item, step: 'build', agent: 'builder', status: 'DONE', tokens: s.tokens ?? 1000 });
        if (s.blame) events.push({ at: at(), kind: 'verdict', item, verdict: 'REWORK', fixes: [{ agent: 'builder', mode: s.blame, note: 'a green test that could not fail' }] });
        events.push({ at: at(), kind: 'verdict', item, verdict: 'PASS', fixes: [] });
        events.push({ at: at(), kind: 'item.close', item });
    }
    return { events, ledgerOf: (item) => ledgers[item] ?? [] };
}
const verdictOf = (rows, ref) => rows.find((r) => r.facet === ref);

test('diagnosis: works, works-but-ignored, no effect, ignored, unobservable and thin are told apart', () => {
    const facets = [F('t:probe', ['tool:mutate'], ['false-green']), F('t:rare', ['tool:seams'], ['false-green']), F('t:habit', ['tool:ledger'], ['budget-burn']), F('t:unread', ['tool:trace'], ['spec-gap']), F('t:faith', [], ['scope-creep']), F('t:new', ['tool:ui'], ['regression'])];
    const { events, ledgerOf } = team(24, (i) => {
        const probe = i % 2 === 0; // followed on every second item
        const rare = i % 5 === 0; // followed on one item in five
        const noHabit = i % 3 === 0; // the habit rule is withheld on every third item
        return {
            facets: ['t:probe', 't:rare', ...(noHabit ? [] : ['t:habit']), 't:unread', 't:faith', ...(i < 2 ? ['t:new'] : [])],
            withheld: noHabit ? ['t:habit'] : [],
            tools: [...(probe ? ['mutate'] : []), ...(rare ? ['seams'] : []), 'ledger'],
            blame: probe || rare ? null : 'false-green', // either rule, when followed, prevents the failure
        };
    });
    const rows = diagnose(exposures(events, { ledgerOf, facets }), facets);
    const probe = verdictOf(rows, 't:probe');
    assert.deepEqual([probe.exposed, probe.adherence.p, probe.withRule.p, probe.without.p, probe.verdict], [24, 0.5, 1, 0.17, 'works']);
    assert.equal(probe.effect, 0.83);
    const rare = verdictOf(rows, 't:rare');
    assert.equal(rare.verdict, 'works when followed, mostly ignored');
    assert.match(rare.action, /graduate it/);
    const habit = verdictOf(rows, 't:habit');
    assert.deepEqual([habit.exposed, habit.withheld, habit.verdict], [16, 8, 'followed, no measurable effect']);
    assert.match(habit.action, /retire it/);
    assert.equal(verdictOf(rows, 't:unread').verdict, 'ignored');
    assert.equal(verdictOf(rows, 't:faith').verdict, 'unobservable');
    assert.equal(verdictOf(rows, 't:new').verdict, 'thin');
});

test('diagnosis: a rule followed on one model and not on another is a loadout problem, not a wording problem', () => {
    const facets = [F('t:notes', ['note'], ['lost-work'])];
    const { events, ledgerOf } = team(12, (i) => ({ facets: ['t:notes'], model: i % 2 ? 'haiku' : 'sonnet' }));
    for (const e of [...events]) if (e.kind === 'step.start' && e.model === 'sonnet') events.push({ at: new Date(Date.parse(e.at) + 1000).toISOString(), kind: 'note', item: e.item, step: 'build', text: 'done: x; next: y' });
    events.sort((a, b) => a.at.localeCompare(b.at));
    const [r] = diagnose(exposures(events, { ledgerOf, facets }), facets);
    assert.deepEqual(r.byModel, { sonnet: 1, haiku: 0 });
    assert.equal(r.verdict, 'model-dependent');
});

test('coverage: a failure with no loaded guard is a gap with a trial from the real incident; a guarded one that returns is recurring', () => {
    const facets = [F('t:probe', ['tool:mutate'], ['false-green']), F('t:shelf', [], ['seam-break'])];
    const { events } = team(4, (i) => ({ facets: ['t:probe'], blame: i < 3 ? 'false-green' : 'doc-drift' }));
    events.push({ at: '2026-02-01T00:00:00Z', kind: 'escape', item: 'P1', fix: 'abc1234', mode: 'seam-break' });
    const c = coverage(events, facets, { loaded: new Set(['t:probe']) });
    const by = Object.fromEntries(c.map((x) => [x.mode, x]));
    assert.deepEqual([by['false-green'].incidents, by['false-green'].gap, by['false-green'].recurring], [3, false, true]);
    assert.deepEqual([by['doc-drift'].gap, by['doc-drift'].guards], [true, []]);
    assert.match(by['doc-drift'].trial, /Trial harvested from P3: builder produced "doc-drift" — a green test that could not fail/);
    assert.deepEqual([by['seam-break'].gap, by['seam-break'].guards, by['seam-break'].active], [true, ['t:shelf'], []], 'a guard that exists but is in no loadout does not guard');
    assert.ok(MODES.includes('false-green'));
});

test('the shipped collection: every facet names what it guards, and most can be seen being followed', () => {
    const skills = loadSkills([path.join(KIT, 'skills')]);
    const facets = skills.flatMap((s) => s.facets);
    assert.ok(facets.every((f) => f.guards.length && f.guards.every((g) => MODES.includes(g))));
    assert.ok(facets.filter((f) => f.footprint.length).length / facets.length >= 0.5);
    assert.ok(facets.filter((f) => !f.ablatable).length >= 6, 'safety rules are exempt from withholding');
    const r = audit(skills, JSON.parse(fs.readFileSync(path.join(KIT, 'loadouts.json'), 'utf-8')));
    assert.deepEqual(r.errors, []);
});

test('cli: a step records what it was given; withholding writes a rules file without the rule; tools leave a footprint; a rework needs a cause', () => {
    const root = tmp();
    // the policy enforces "neighbours", so the rules whose backstop it is may go missing from real work; caps-backed rules always may
    write(root, 'policy.json', JSON.stringify([{ id: 'seams', level: 1, evidence: ['neighbours'], ok: true }]));
    write(root, 'package.json', JSON.stringify({ facetkit: { skillint: { ablate: { rate: 1, seed: 'w' } , requireCause: true }, govern: { policy: 'policy.json', required: 1 } } }));
    write(root, 'routing.json', JSON.stringify({ items: { A: { deps: [], route: [], gates: [] } } }));
    const f = (...args) => spawnSync('node', [CLI, ...args], { cwd: root, encoding: 'utf-8' });
    assert.match(f('flow', 'open', 'A').stdout, /this item goes without \S+ \(seeded draw, p=/);
    const journal = () => readJournal(path.join(root, '.work', 'journal.jsonl'));
    const gone = journal().find((e) => e.kind === 'item.open').withheld.ref;
    assert.ok(!['thrift-loop:hard-caps', 'claim-ledger:reproduce-not-quote'].includes(gone), 'a safety rule is never drawn');
    let starts = [];
    for (const step of ['open', 'map', 'red', 'build', 'proof']) {
        const out = f('flow', 'start', step);
        const start = journal().filter((e) => e.kind === 'step.start').at(-1);
        starts.push(start);
        if (start.withheld?.length) {
            assert.deepEqual(start.withheld, [gone], 'the step goes without the rule drawn for the item, and only that one');
            assert.ok(!start.facets.includes(gone));
            assert.match(out.stdout, new RegExp(`rules for this step.*rules-${step}\\.md`));
            assert.ok(!fs.readFileSync(path.join(root, '.work', 'A', `rules-${step}.md`), 'utf-8').includes(`\`${gone}\``));
        } else assert.ok(!(start.facets ?? []).includes(gone) || false, 'a step that had the rule in its loadout must go without it');
        if (step === 'map') f('seams', '--changed', 'x.js', '--item', 'A');
        f('flow', 'end', step, '--status', 'DONE');
    }
    assert.ok(starts.some((x) => x.withheld?.length), 'the drawn rule belongs to some step of the route');
    assert.ok(fs.readFileSync(path.join(root, '.work', 'A', 'ledger.jsonl'), 'utf-8').includes('"kind":"tool","cmd":"seams"'));
    assert.match(f('flow', 'verdict', 'REWORK', '--fix', 'slice-builder').stderr, /name the cause/);
    assert.match(f('flow', 'verdict', 'REWORK', '--fix', 'slice-builder:nonsense').stderr, /unknown cause/);
    assert.equal(f('flow', 'verdict', 'REWORK', '--fix', 'slice-builder:seam-break').status, 0);
    assert.match(f('skill', 'coverage').stdout, /seam-break +incidents +1/);
    assert.equal(f('skill', 'report').status, 0);
    assert.match(f('skill', 'modes').stdout, /false-green/);
});
