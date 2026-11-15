// The journal-based commands of `facet`: flow, note, mem, cost, eval, retro, plan, timeline, journal.
// Kept apart from facet.mjs so that neither file grows past what a person reads in one sitting.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { attribute, costReport, fold, parseTranscript, renderCost, totalTokens } from '../lib/cost.mjs';
import { compareModels, judge, matrix, observations, renderMatrix, replaySetup, snapshot } from '../lib/evalx.mjs';
import { DEFAULT_FLOW, itemState, modelFor, next, planSteps, resumeCard, statusLines, verdictBlocker } from '../lib/flow.mjs';
import { buildAtlas, card, findSymbol, hiddenCoupling, hotspots, pathBetween, stats as atlasStats } from '../lib/atlas.mjs';
import { boardData, renderBoard } from '../lib/board.mjs';
import { attest, calibration, DEFAULT_POLICY, digestOf, evaluate, gate, renderEvaluation, renderTrust, trust } from '../lib/govern.mjs';
import { closedItems, holderOf, isSegmented, ofItem, openItems, readJournal, record, repairJournal, verifyJournal, writerId } from '../lib/journal.mjs';
import { benchmarkReport, regressions, renderBenchmark, runBenchmark } from '../lib/benchmark.mjs';
import { analyse, assertAblatable, assign, loadExperiments, newExperiment, renderAnalysis, saveExperiment, unitOf } from '../lib/experiments.mjs';
import { designFor, diagnosePattern, loadProposals, mayAdopt, patterns, propose, renderProposals, saveProposal } from '../lib/evolve.mjs';
import { curriculum, faded, lessonFrom, loadLessons, recallLessons, renderLessons, saveLessons } from '../lib/cognition.mjs';
import { allocate, hire, itemsClosed, priceFacets, renderEconomy, reworkCost } from '../lib/economy.mjs';
import { followUp, overrides, plan as healPlan, renderHeal, weaknesses } from '../lib/heal.mjs';
import { judge as judgeHypothesis, loadHypotheses, newHypothesis, renderHypotheses, saveHypothesis } from '../lib/hypothesis.mjs';
import { buildTrustGraph, renderTrustGraph } from '../lib/trustgraph.mjs';
import { analyseDesign, armFor, armOfUnit, fourArms, newDesign, renderDesign, stratumOf, unitsNeeded, unitsSoFar } from '../lib/intelligence.mjs';
import { DEFAULT_PLANNING, discover, planRoute, renderPlan as renderRoute, stepsOf } from '../lib/planner.mjs';
import { buildGraph } from '../lib/seams.mjs';
import { checkOwners, renderOwners } from '../lib/ownership.mjs';
import { createProof, decay, fileHashes, proofPath, renderDecay, renderProof, scopesNow, sourceState, verifyProof } from '../lib/proof.mjs';
import { planMutants, probe } from '../lib/mutaprobe.mjs';
import { route } from '../lib/router.mjs';
import { scan } from '../lib/secscan.mjs';
import { coverage, diagnose, exposures, MODES, renderCoverage, renderDiagnosis, withheldFor } from '../lib/skillint.mjs';
import { compose, loadoutPicks, renderLoadout, resolvePicks } from '../lib/facets.mjs';
import { condition, credit, loadMemory, recall, remember, renderRecall, retire, utility } from '../lib/memory.mjs';
import { anomalies, timeline } from '../lib/observe.mjs';
import { beliefs, hindsight, proposals, renderBeliefs, reviewChanges, signals } from '../lib/retro.mjs';
import { plan, renderPlan, sessionPlan } from '../lib/schedule.mjs';
import { readLedger, run } from '../lib/thrift.mjs';

export function opsCommands({ CWD, project, opt, flag, list, fail, positional, work, readJson, loadoutsFile, extensions = [], skills = () => [] }) {
    const journal = path.resolve(CWD, opt('journal', project.journal ?? path.join(work, 'journal.jsonl')));
    const me = isSegmented(journal) ? writerId() : undefined; // in a segmented journal every writer has its own file and its own open item
    const usageFile = path.resolve(CWD, project.usage ?? (isSegmented(journal) ? path.join(journal, `${me}.usage`) : path.join(path.dirname(journal), 'usage.jsonl')));
    const memoryFile = path.resolve(CWD, opt('memory', project.memory ?? '.facet/memory.jsonl'));
    const flowDef = { ...DEFAULT_FLOW, ...readJson(path.resolve(CWD, project.flow ?? 'flow.json'), {}) };
    const routing = () => readJson(path.resolve(CWD, opt('routing', project.routing ?? 'routing.json')), { items: {} }).items ?? {};
    const loadouts = () => readJson(loadoutsFile, {});
    const events = () => readJournal(journal);
    const say = (e) => record(journal, e, { team: project.team });
    const theItem = (required = true) => {
        const open = openItems(events(), me);
        const item = opt('item', process.env.FACET_ITEM) ?? (open.length === 1 ? open[0] : null);
        if (!item && required) fail(open.length ? `several items are open (${open.join(', ')}): pass --item` : 'no open item: facet plan next, then facet flow open ITEM', 2);
        return item;
    };
    const ledgerOf = (item) => readLedger(path.join(work, item, 'ledger.jsonl'));
    const usageFiles = () => (isSegmented(journal) && fs.existsSync(journal) ? fs.readdirSync(journal).filter((f) => f.endsWith('.usage')).map((f) => path.join(journal, f)) : fs.existsSync(usageFile) ? [usageFile] : []);
    const usage = () => usageFiles().flatMap((f) => fs.readFileSync(f, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    const ownUsage = () => (fs.existsSync(usageFile) ? fs.readFileSync(usageFile, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
    const tokensOf = () => {
        const rows = usage();
        return rows.length ? (item, step) => rows.filter((r) => r.item === item && r.step === step).reduce((s, r) => s + totalTokens(r), 0) || undefined : undefined;
    };
    const changedFiles = () => (spawnSync('git', ['status', '--short'], { cwd: CWD, encoding: 'utf-8' }).stdout ?? '').split('\n').filter(Boolean).map((l) => l.slice(3));
    const rendered = project.rendered ?? 'loadouts';

    // ---- governance: policy, evidence, model routing --------------------------------------
    const govern = project.govern ?? {};
    const policy = () => [...(govern.policy ? readJson(path.resolve(CWD, govern.policy), DEFAULT_POLICY) : DEFAULT_POLICY), ...extensions.flatMap((x) => x.rules ?? [])];
    const checkNames = () => [...Object.keys(govern.checks ?? {}), ...extensions.flatMap((x) => Object.keys(x.checks ?? {}))];
    const projectFacts = () => {
        const v = verifyJournal(journal);
        return { journalIntact: v.intact };
    };
    // evidence belongs to the state of the sources it was measured on; "off" restores time-only staleness
    const sourceIgnore = () => [...(govern.sourceIgnore ?? []), `${path.relative(CWD, journal).split(path.sep).join('/')}${isSegmented(journal) ? '/**' : ''}`, `${path.relative(CWD, journal).split(path.sep).join('/')}.lock`];
    let sourceMemo;
    let hashMemo;
    let graphMemo;
    const hashesNow = () => (hashMemo ??= fileHashes(CWD, { ignore: sourceIgnore(), cache: path.join(work, '.hashcache.json') }));
    const sourceNow = () => (govern.source === 'off' ? null : (sourceMemo ??= sourceState(CWD, { ignore: sourceIgnore(), hashes: hashesNow() }).state));
    const sourceDirs = () => (project.dirs ?? ['src', 'server', 'lib', 'bin', 'tests', 'test', 'e2e']).filter((d) => fs.existsSync(path.join(CWD, d)));
    const graphNow = () => (graphMemo ??= buildGraph(CWD, sourceDirs()));
    // trust decay: what each check stands for. A check declares "covers"; one that does not covers everything.
    const coversOf = (name) => (typeof govern.checks?.[name] === 'object' ? govern.checks[name].covers : null) ?? govern.covers?.[name] ?? ['**'];
    const scopesFor = (names) => (govern.source === 'off' ? null : scopesNow(hashesNow(), Object.fromEntries(names.map((n) => [n, coversOf(n)])), graphNow()));
    const evidenceNames = (item) => [...new Set([...checkNames(), ...events().filter((e) => e.kind === 'evidence' && e.item === item).map((e) => e.name)])];
    const digestsFor = (item) => {
        const sc = scopesFor(evidenceNames(item));
        return sc ? Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, v.digest])) : null;
    };
    const snapshotFile = (item, src) => path.join(work, item, 'states', `${src}.json`);
    /** What is stored with a piece of evidence so that it can decay precisely: its scope, and the tree it was measured on. */
    const bound = (item, name) => {
        const src = sourceNow();
        if (!src) return {};
        const file = snapshotFile(item, src);
        if (!fs.existsSync(file)) {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, JSON.stringify(Object.fromEntries(hashesNow())));
        }
        const sc = scopesFor([name])[name];
        return { src, scope: { digest: sc.digest, files: sc.files } };
    };
    const judged = (item) => {
        const cal = calibration(events());
        return evaluate(events(), item, { policy: policy(), checks: checkNames(), source: sourceNow(), scopes: digestsFor(item), project: { ...projectFacts(), guardCatchLow: cal.length ? Math.min(...cal.map((c) => c.low)) : 0 } });
    };
    const evidence = (name, ok, value, detail, extra = {}) => {
        const item = opt('item', process.env.FACET_ITEM) ?? (openItems(events(), me).length === 1 ? openItems(events(), me)[0] : null);
        if (!item || !openItems(events()).includes(item)) return false;
        say({ kind: 'evidence', item, name, ok, value, detail, ...bound(item, name), ...extra });
        return true;
    };
    const baseOf = (item) => ofItem(events(), item).find((e) => e.kind === 'item.open')?.base ?? 'HEAD';
    const runScan = (item) => {
        const r = scan(CWD, { ref: baseOf(item), forbidden: govern.forbidden ?? ['.env', '**/.env', '**/*.pem', '**/id_rsa*'], ignore: govern.scanIgnore ?? [], runs: ledgerOf(item), stores: [path.relative(CWD, path.join(work, item)), ...(govern.stores ?? [])] });
        say({ kind: 'evidence', item, name: 'scan', ok: r.blocking === 0, value: r.findings.length, ...bound(item, 'scan'), approvals: r.approvals, detail: r.findings.slice(0, 5).map((f) => `${f.kind} ${f.where}`).join('; ') || undefined });
        return r;
    };
    const pickModel = (step, state) => {
        const base = modelFor(step, { loadouts: loadouts(), flow: flowDef, tier: state.tier });
        const r = project.router?.enabled && step.agent && !base.escalated ? route({ agent: step.agent, base: base.model, tier: state.tier, rows: matrix(observations(events()), { minN: project.router.minN ?? 5 }), ladder: flowDef.ladder, seen: observations(events()).filter((o) => o.agent === step.agent).length, options: project.router }) : null;
        const ext = extensions.map((x) => x.route?.(step, { state, base: base.model, events: events() })).find(Boolean);
        const healed = step.agent ? overrides(events()).models[step.agent] : null; // a weak agent on probation one model up (facet heal)
        const ladder = flowDef.ladder ?? [];
        if (healed && !ext && ladder.indexOf(healed) > ladder.indexOf((r ?? base).model)) return { model: healed, reason: 'on probation one model up: its record on the smaller model was weak (facet heal)' };
        return ext ? { model: ext, reason: 'extension' } : (r ?? { model: base.model, reason: base.escalated ? 'one step up after repeated failure' : 'configured' });
    };

    // ---- what the record says about the team itself ---------------------------------------------
    const judgedHypotheses = () => loadHypotheses(CWD).map((h) => {
        const designs = loadExperiments(CWD).filter((m) => m.arms);
        const design = designs.find((d) => d.confirms === h.design) ?? designs.find((d) => d.id === h.design) ?? null; // the repetition, when there is one
        const first = design?.confirms ? designs.find((d) => d.id === design.confirms) : null;
        const analysis = design ? analyseDesign(events(), design, { prior: first ? analyseDesign(events(), first) : null }) : null;
        return { h, design, analysis, v: judgeHypothesis(h, analysis) };
    });
    const trustGraphNow = () => {
        const suspect = new Set(overrides(events()).suspect); // a check marked suspect vouches for nothing until it is repaired
        return buildTrustGraph(events().filter((e) => !(e.kind === 'evidence' && suspect.has(e.name))));
    };
    const weaknessesNow = () => {
        const proposed = new Set(loadProposals(CWD).map((p) => `${p.mode}|${p.agent ?? '*'}`));
        return weaknesses({ events: events(), graph: trustGraphNow(), fadedLessons: faded(loadLessons(CWD), events()), openPatterns: patterns(events()).filter((p) => !proposed.has(`${p.mode}|${p.agent ?? '*'}`)), ladder: flowDef.ladder });
    };
    // ---- skill intelligence: what each step was given to read ------------------------------
    const allFacets = () => skills().flatMap((s) => s.facets);
    const loadedRefs = () => new Set(Object.keys(loadouts().roles ?? {}).flatMap((role) => loadoutPicks(loadouts(), role).picks).flatMap((pick) => resolvePicks(skills(), [pick]).facets.map((f) => f.ref)));
    const rulesFor = (step, item) => {
        if (!step.agent || !step.phase || !loadouts().roles?.[step.agent]?.phases?.[step.phase]) return { facets: [], withheld: [], file: null, experiments: [], lessons: [] };
        const lo = loadoutPicks(loadouts(), step.agent, step.phase);
        const used = compose(resolvePicks(skills(), lo.picks).facets, { budget: lo.budget }).used;
        const withheld = withheldFor(used, { item, step: step.id, rate: project.skillint?.ablate?.rate ?? 0, seed: project.skillint?.ablate?.seed });
        // running experiments decide their own facet for this unit: the arm is a function of the seed, not of anybody's choice
        const experiments = [];
        for (const x of loadExperiments(CWD).filter((m) => m.status === 'running')) {
            const facet = used.find((f) => f.ref === x.facet);
            if (!facet || !facet.ablatable) continue;
            const arm = assign(x, unitOf(item, step.id));
            experiments.push({ id: x.id, facet: x.facet, arm, taskClass: routing()[item]?.class ?? null });
            if (arm === 'treatment' && !withheld.includes(x.facet)) withheld.push(x.facet);
            if (arm === 'control' && withheld.includes(x.facet)) withheld.splice(withheld.indexOf(x.facet), 1);
        }
        // designs (schema 2): several arms, dealt in blocks inside strata that are known before the work starts
        let given = used;
        let model = null;
        for (const d of loadExperiments(CWD).filter((m) => m.status === 'running' && m.arms)) {
            const facet = used.find((f) => f.ref === d.facet);
            if (!facet || !facet.ablatable) continue;
            const known = armOfUnit(events(), d, item, step.id); // a rework or a resume keeps the arm it was dealt
            const stratum = known?.stratum ?? stratumOf(d, { agent: step.agent, taskClass: routing()[item]?.class ?? null, difficulty: routing()[item]?.difficulty ?? itemState(events(), item)?.tier ?? null });
            const armId = known?.arm ?? armFor(d, stratum, unitsSoFar(events(), d, stratum));
            const arm = d.arms.find((a) => a.id === armId);
            experiments.push({ id: d.id, facet: d.facet, arm: armId, stratum });
            if (arm.facet === 'off' && !withheld.includes(d.facet)) withheld.push(d.facet);
            if (arm.facet === 'variant') given = given.map((f) => (f.ref === d.facet ? { ...f, body: fs.readFileSync(path.resolve(CWD, arm.variant), 'utf-8').replace(/^---[\s\S]*?---\n/, '') } : f));
            if (arm.order) given = arm.order === 'first' ? [...given.filter((f) => f.ref === d.facet), ...given.filter((f) => f.ref !== d.facet)] : [...given.filter((f) => f.ref !== d.facet), ...given.filter((f) => f.ref === d.facet)];
            if (arm.model) model = arm.model;
        }
        // what the team has learned for this situation changes what the agent is given; a running experiment outranks a lesson
        const learned = curriculum(recallLessons(loadLessons(CWD), events(), { agent: step.agent, taskClass: routing()[item]?.class ?? null, difficulty: routing()[item]?.difficulty ?? null, model: model ?? modelFor(step, { loadouts: loadouts(), flow: flowDef }).model }, { budgetWords: project.cognition?.words ?? 120 }));
        const underTest = new Set(experiments.map((x) => x.facet));
        for (const ref of learned.drop) if (!underTest.has(ref) && used.find((f) => f.ref === ref)?.ablatable && !withheld.includes(ref)) withheld.push(ref);
        for (const ref of learned.add) {
            const f = !underTest.has(ref) && !given.some((x) => x.ref === ref) ? allFacets().find((x) => x.ref === ref) : null;
            if (f) given = [...given, f];
        }
        let file = null;
        if (withheld.length || given !== used || learned.notes.length) {
            file = path.join(work, item, `rules-${step.id}.md`);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, renderLoadout(compose(given.filter((f) => !withheld.includes(f.ref)), { budget: lo.budget }), { role: step.agent, phase: step.phase }) + (learned.notes.length ? `\n## Learned on this project\n${learned.notes.map((n) => `- ${n}`).join('\n')}\n` : ''));
        }
        return { facets: given.map((f) => f.ref).filter((r) => !withheld.includes(r)), withheld, file, experiments, model, lessons: learned.ids };
    };

    function describe(n) {
        const at = `--item ${n.item}`;
        if (n.action === 'open') return 'OPEN an item: facet plan next shows what is ready; then facet flow open ITEM';
        if (n.action === 'complete') return `${n.item} is closed.`;
        if (n.action === 'close') return `CLOSE ${n.item}: every step is done → facet flow close ${at}`;
        if (n.action === 'ask') return `ASK THE USER (${n.item} / ${n.step}): ${n.question}\nafter the answer: facet flow answer ${n.step} ${at}`;
        if (n.action === 'manual') return `DO IT YOURSELF (${n.item} / ${n.step}): ${n.what}\nbefore: facet flow start ${n.step} ${at}   after: facet flow end ${n.step} ${at} --status DONE`;
        if (n.action === 'gates') return `CALL IN PARALLEL (${n.item} / ${n.step}): ${n.agents.join(', ')} — save each report to the item folder\nbefore: facet flow start ${n.step} ${at}   after: facet flow end ${n.step} ${at} --status DONE|BLOCKED --for <agent that must fix>`;
        if (n.action === 'resume') {
            const state = itemState(events(), n.item);
            return `RESUME — the step was started and never ended. ${n.agents ? `Run the gates again (${n.agents.join(', ')}), in parallel,` : `Call ${n.agent}`}${n.mode ? ` (mode ${n.mode})` : ''}${n.model ? ` on ${n.model}` : ''} with this card instead of the full context:\n\n${resumeCard(state, n.step, { runs: ledgerOf(n.item), changed: changedFiles() })}\n\nafter: facet flow end ${n.step} ${at} --status DONE|BLOCKED|NEEDS-USER [--tokens N]`;
        }
        return [
            `CALL ${n.agent}${n.mode ? ` · mode ${n.mode}` : ''}${n.model ? ` · model ${n.model}${n.routed && n.routed !== 'configured' ? ` (${n.routed})` : ''}` : ''} · ${n.item} / ${n.step}${n.attempt > 1 ? ` · attempt ${n.attempt}` : ''}${n.assist ? ` · to unblock ${n.assist}` : ''}`,
            n.why ? `why: ${n.why}` : null,
            n.interrupted ? 'the previous attempt was interrupted: pass the output of `facet flow resume` to the agent' : null,
            n.phase ? `rules: ${fs.existsSync(path.resolve(CWD, rendered, `${n.agent}.${n.phase}.md`)) ? `${rendered}/${n.agent}.${n.phase}.md` : `facet compose --role ${n.agent} --phase ${n.phase}`}` : null,
            `before: facet flow start ${n.step} ${at}${n.assist ? ` --assist ${n.assist}` : ''}`,
            `after:  facet flow end ${n.step} ${at} --status DONE|BLOCKED|NEEDS-USER [--tokens N] [--for <agent>] [--question "…"]`,
        ].filter(Boolean).join('\n');
    }
    const upcoming = (item) => {
        const state = itemState(events(), item);
        const n = next(state, { loadouts: loadouts(), flow: flowDef });
        if (n.action !== 'call') return n;
        const picked = pickModel(state.steps.find((s) => s.id === n.step), state);
        return { ...n, model: picked.model, routed: picked.reason };
    };

    const flow = {
        open() {
            const item = positional[1];
            if (!item) fail('flow open: facet flow open ITEM [--route a,b] [--gates a,b] [--tier T] [--force]');
            const ev = events();
            const known = routing()[item] ?? {};
            const open = openItems(ev, me);
            if (openItems(ev).includes(item)) fail(open.includes(item) ? `${item} is already open: facet flow next` : `${item} is held by ${holderOf(ev, item)} — two people do not work on one item; ask them to finish or to run: facet flow yield --item ${item}`);
            if (closedItems(ev).includes(item) && !flag('force')) fail(`${item} is already closed`);
            if (open.length && !flag('force')) fail(`${open.join(', ')} is still open — one item at a time (finish it, or --force)`);
            const missing = (known.deps ?? []).filter((d) => !closedItems(ev).includes(d));
            if (missing.length && !flag('force')) fail(`${item} depends on ${missing.join(', ')}, not closed yet`);
            const route = list(opt('route')).length ? list(opt('route')) : (known.route ?? []);
            const gates = opt('gates') !== undefined ? list(opt('gates')) : (known.gates ?? []);
            const lockedGates = (known.locked ?? []).filter((g) => !gates.includes(g));
            if (lockedGates.length) console.log(`gate(s) ${lockedGates.join(', ')} are locked by the route plan and stay on the route`);
            const steps = stepsOf(flowDef, { route, gates, locked: (known.locked ?? []).map((agent) => ({ agent })), skip: known.skip ?? [] }).map(({ id, agent, mode, phase, gates: g, agents, manual, verdict, bookkeeping }) => ({ id, agent, mode, phase, gates: g, agents, manual, verdict, bookkeeping }));
            const base = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: CWD, encoding: 'utf-8' }).stdout?.trim() || undefined;
            say({ kind: 'item.open', item, tier: opt('tier', known.tier ?? 'normal'), version: known.version, class: known.class, difficulty: known.difficulty, steps, rerun: flowDef.rework?.rerun ?? [], base });
            console.log(`${item} opened with ${steps.length} steps: ${steps.map((s) => s.id).join(' → ')}\n\n${describe(upcoming(item))}`);
        },
        next() {
            const item = theItem(false);
            const n = item ? upcoming(item) : { action: 'open' };
            console.log(flag('json') ? JSON.stringify(n, null, 2) : describe(n));
        },
        start() {
            const item = theItem();
            const stepId = positional[1];
            const state = itemState(events(), item);
            const step = state?.steps.find((s) => s.id === stepId);
            if (!step) fail(`flow start: no step "${stepId}" in ${item} (steps: ${state?.steps.map((s) => s.id).join(', ')})`);
            const n = upcoming(item);
            if (n.step !== stepId && !flag('force')) fail(`flow start: the next step of ${item} is "${n.step ?? n.action}", not "${stepId}". Steps are not skipped; --force records an exception.`);
            const { model } = n.step === stepId && n.model ? n : pickModel(step, state);
            const rules = rulesFor(step, item);
            say({ kind: 'step.start', item, step: stepId, agent: step.agent, mode: step.mode, model: opt('model', rules.model ?? model ?? undefined), rework: step.rework || undefined, assist: opt('assist'), forced: n.step !== stepId || undefined, facets: rules.facets.length ? rules.facets : undefined, withheld: rules.withheld.length ? rules.withheld : undefined, lessons: rules.lessons?.length ? rules.lessons : undefined, experiments: rules.experiments.length ? rules.experiments : undefined });
            if (rules.file) console.log(`rules for this step (give the agent this file instead of its usual one): ${path.relative(CWD, rules.file)}`);
            if (rules.model) console.log(`model for this step, set by an experiment: ${rules.model} — call the agent on it`);
            const wanted = project.eval?.snapshot ?? [];
            if (wanted.includes(stepId) || flag('snapshot')) {
                const snap = snapshot(CWD, { item, step: stepId, workDir: work });
                if (snap.ok) say({ kind: 'snapshot', item, step: stepId, commit: snap.commit });
            }
            console.log(`${item} / ${stepId} started${step.agent ? ` (${step.agent}${opt('model', model) ? `, ${opt('model', model)}` : ''})` : ''}`);
        },
        end() {
            const item = theItem();
            const stepId = positional[1];
            const status = opt('status');
            const state = itemState(events(), item);
            const step = state?.steps.find((s) => s.id === stepId);
            if (!step || step.status !== 'running') fail(`flow end: ${item} / ${stepId} is not running`);
            if (!['DONE', 'BLOCKED', 'NEEDS-USER', 'INTERRUPTED'].includes(status)) fail('flow end: --status DONE|BLOCKED|NEEDS-USER|INTERRUPTED');
            say({ kind: 'step.end', item, step: stepId, agent: step.agent, status, tokens: opt('tokens') ? Number(opt('tokens')) : undefined, for: opt('for'), question: opt('question') });
            console.log(`${item} / ${stepId} → ${status}\n\n${describe(upcoming(item))}`);
        },
        verdict() {
            const item = theItem();
            const verdict = positional[1];
            if (!['PASS', 'REWORK'].includes(verdict)) fail('flow verdict: facet flow verdict PASS|REWORK [--fix agent,agent] [--score agent=8,agent=7]');
            if (verdict === 'REWORK' && !list(opt('fix')).length) fail('flow verdict: REWORK needs --fix <agent,…> — a rework without an owner is nobody\'s');
            const blocker = verdictBlocker(itemState(events(), item));
            if (blocker && !flag('force')) fail(`flow verdict: ${blocker}`);
            const scores = Object.fromEntries(list(opt('score')).map((s) => [s.split('=')[0], Number(s.split('=')[1])]));
            const fixes = list(opt('fix')).map((f) => ({ agent: f.split(':')[0], mode: f.split(':')[1] }));
            for (const f of fixes) {
                if (f.mode && !MODES.includes(f.mode)) fail(`flow verdict: unknown cause "${f.mode}" (one of: ${MODES.join(', ')})`);
                if (!f.mode && project.skillint?.requireCause) fail(`flow verdict: name the cause of each fix as --fix ${f.agent}:<cause> (one of: ${MODES.join(', ')})`);
            }
            say({ kind: 'verdict', item, verdict, fixes, scores, forced: (blocker && flag('force')) || undefined });
            console.log(`${item}: ${verdict}\n\n${describe(upcoming(item))}`);
        },
        answer() {
            const item = theItem();
            say({ kind: 'answer', item, step: positional[1], text: opt('text') });
            console.log(describe(upcoming(item)));
        },
        close() {
            const item = theItem();
            const n = upcoming(item);
            if (n.action !== 'close' && !flag('force')) fail(`flow close: ${item} is not finished — next is ${n.action} ${n.step ?? ''}`);
            runScan(item);
            const verdictOnItem = judged(item);
            const g = gate(verdictOnItem, { required: Number(opt('level', govern.required ?? 1)) });
            if (!g.allow) fail(`${renderEvaluation(verdictOnItem, g)}\n\nflow close: the policy is not met. Fix what is listed, or let a person take the decision on record:\n  facet waive <rule> --item ${item} --reason "…" --by <name>`);
            const ev = events();
            const blamed = new Set(ofItem(ev, item).filter((e) => e.kind === 'verdict').flatMap((v) => (v.fixes ?? []).map((f) => f.agent)));
            let settled = 0;
            const retired = [];
            for (const r of ofItem(ev, item).filter((e) => e.kind === 'mem.recall')) {
                const c = credit(memoryFile, r.ids, !blamed.has(r.agent));
                settled += c.settled;
                retired.push(...c.retired);
            }
            const base = ofItem(ev, item).find((e) => e.kind === 'item.open')?.base;
            const commits = base ? (spawnSync('git', ['rev-list', '--abbrev-commit', `${base}..HEAD`], { cwd: CWD, encoding: 'utf-8' }).stdout ?? '').split('\n').filter(Boolean) : [];
            say({ kind: 'item.close', item, commit: opt('commit') ?? commits[0], commits, level: verdictOnItem.level });
            if (govern.attestations) {
                const dir = path.resolve(CWD, govern.attestations);
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, `${item}.json`), `${JSON.stringify(attest(events(), item, { policy: policy(), checks: checkNames(), project: projectFacts() }), null, 2)}\n`);
            }
            console.log(`${item} closed at ${verdictOnItem.label}${g.waived.length ? ` with ${g.waived.length} waiver(s)` : ''}${settled ? ` · ${settled} recalled memories settled${retired.length ? `, retired: ${retired.join(', ')}` : ''}` : ''}`);
        },
        yield() {
            const item = theItem();
            say({ kind: 'item.yield', item, reason: opt('reason') });
            console.log(`${item} released: its history stays, somebody else may open it`);
        },
        status() {
            const item = theItem(false);
            if (!item) return void console.log(`no open item${me ? ` held by ${me}` : ''} · ${openItems(events()).length} open in all · ${closedItems(events()).length} closed`);
            const state = itemState(events(), item);
            console.log(`${item} · tier ${state.tier} · rework cycles ${state.cycles}${state.verdict ? ` · last verdict ${state.verdict}` : ''}\n${statusLines(state).join('\n')}`);
        },
        resume() {
            const item = theItem();
            const state = itemState(events(), item);
            const step = state.steps.find((s) => s.status === 'running') ?? state.steps.find((s) => s.interrupted && s.status === 'pending');
            if (!step) return void console.log(`nothing is in progress in ${item}\n\n${describe(upcoming(item))}`);
            console.log(resumeCard(state, step.id, { runs: ledgerOf(item), changed: changedFiles() }));
        },
    };

    return {
        evidence,
        flow() {
            if (!flow[positional[0]]) fail(`flow: ${Object.keys(flow).join(' | ')}`);
            flow[positional[0]]();
        },
        note() {
            const item = theItem();
            const text = positional.join(' ').trim();
            const step = itemState(events(), item)?.steps.find((s) => s.status === 'running');
            if (!text) fail('note: facet note "what is done; what is next" [--item ID]');
            if (!step) fail(`note: no step is running in ${item}`);
            if (text.length > 200) fail(`note: ${text.length} characters — a checkpoint is at most 200: what is done, what is next`);
            say({ kind: 'note', item, step: step.id, text });
            console.log(`checkpoint saved (${item} / ${step.id})`);
        },
        mem() {
            const mode = positional[0];
            if (mode === 'add') {
                const r = remember(memoryFile, { kind: opt('kind'), text: opt('text'), about: list(opt('about')), anchor: opt('anchor'), by: opt('by'), item: theItem(false) ?? undefined }, { root: CWD });
                if (!r.ok) fail(`mem add: ${r.reason}`, r.twin ? 3 : 1);
                console.log(`remembered ${r.entry.id}${r.entry.anchor ? ` anchored to ${r.entry.anchor}` : ''}`);
            } else if (mode === 'recall') {
                const r = recall(memoryFile, { files: list(opt('files')), topics: list(opt('topics')), budgetWords: Number(opt('budget', 120)), root: CWD });
                const item = theItem(false);
                if (r.used.length && item) say({ kind: 'mem.recall', item, agent: opt('agent'), ids: r.used.map((m) => m.id) });
                console.log(renderRecall(r));
            } else if (mode === 'list') {
                for (const m of loadMemory(memoryFile)) console.log(`${m.id}  ${condition(m, CWD).padEnd(7)} ${m.kind.padEnd(8)} use ${m.uses} · utility ${utility(m).toFixed(2)}  [${m.about.join(', ')}]  ${m.text}`);
            } else if (mode === 'retire') {
                retire(memoryFile, positional.slice(1), opt('reason', 'retired by hand'));
                console.log(`retired ${positional.slice(1).join(', ')}`);
            } else fail('mem: facet mem add --kind pitfall|decision|fact|how --text "…" --about glob,topic [--anchor path:1-9] | recall --files a,b [--topics t] [--agent A] | list | retire ID');
        },
        cost() {
            const mode = positional[0];
            if (mode === 'import') {
                const files = positional.slice(1);
                if (!files.length) fail('cost import: facet cost import <transcript.jsonl>…');
                let rows = ownUsage();
                for (const f of files) {
                    const source = path.basename(f);
                    const folded = fold(attribute(parseTranscript(path.resolve(CWD, f)), events()), source);
                    rows = [...rows.filter((r) => r.source !== source), ...folded];
                    console.log(`${source}: ${folded.reduce((s, r) => s + r.calls, 0)} model calls in ${folded.length} rows`);
                }
                fs.mkdirSync(path.dirname(usageFile), { recursive: true });
                fs.writeFileSync(usageFile, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
            } else if (mode === 'report' || !mode) {
                const item = opt('item');
                const rows = usage().filter((r) => !item || r.item === item);
                const ev = item ? events().filter((e) => e.item === item) : events();
                const r = costReport(rows, ev, { prices: project.prices ?? {} });
                console.log(flag('json') ? JSON.stringify(r, null, 2) : renderCost(r));
            } else fail('cost: facet cost import <transcript.jsonl>… | report [--item ID] [--json]');
        },
        eval() {
            const mode = positional[0] ?? 'matrix';
            const obs = () => observations(events(), { tokensOf: tokensOf() });
            const minN = Number(opt('min', project.eval?.minN ?? 5));
            if (mode === 'matrix') {
                const rows = matrix(obs(), { minN }).filter((r) => !opt('agent') || r.agent === opt('agent'));
                console.log(flag('json') ? JSON.stringify(rows, null, 2) : rows.length ? renderMatrix(rows) : 'no closed items yet — the matrix fills as items close');
                const replays = events().filter((e) => e.kind === 'eval.replay');
                if (replays.length && !flag('json')) console.log(`\nreplays:\n${replays.map((e) => `  ${e.item}/${e.step} ${String(e.agent).padEnd(20)} ${String(e.model).padEnd(8)} checks ${e.passed}/${e.total}${e.tokens ? ` · ${e.tokens} tok` : ''}`).join('\n')}`);
            } else if (mode === 'compare') {
                const rows = matrix(obs(), { minN });
                const agents = opt('agent') ? [opt('agent')] : [...new Set(rows.map((r) => r.agent))];
                const out = agents.flatMap((a) => compareModels(rows, a, { ladder: flowDef.ladder, minN }));
                console.log(out.length ? out.map((c) => `${c.agent}: ${c.verdict}${c.saving !== null ? ` · median tokens ${c.saving >= 0 ? '−' : '+'}${Math.abs(Math.round(c.saving * 100))}% on ${c.cheap}` : ''}`).join('\n') : 'no agent has run on two models yet — use: facet eval replay --item ID --step STEP --model MODEL');
            } else if (mode === 'snapshot') {
                const item = theItem();
                const r = snapshot(CWD, { item, step: opt('step'), workDir: work });
                if (!r.ok) fail(`eval snapshot: ${r.reason}`);
                say({ kind: 'snapshot', item, step: opt('step'), commit: r.commit });
                console.log(`snapshot ${r.commit.slice(0, 8)} of ${item}/${opt('step')} with ${r.handoffs.length} handoff file(s)`);
            } else if (mode === 'replay') {
                const [item, step, model] = [opt('item'), opt('step'), opt('model')];
                if (!item || !step || !model) fail('eval replay: facet eval replay --item ID --step STEP --model MODEL');
                const r = replaySetup(CWD, { item, step, model, workDir: work, workName: path.relative(CWD, work) });
                if (!r.ok) fail(`eval replay: ${r.reason}`);
                const s = itemState(events(), item)?.steps.find((x) => x.id === step);
                console.log(`worktree ready: ${path.relative(CWD, r.dir)} (snapshot ${r.commit.slice(0, 8)})\nRun ${s?.agent ?? 'the agent of this step'} there on ${model} with the same instruction as the original step, then:\n  facet eval judge --dir ${path.relative(CWD, r.dir)} --item ${item} --step ${step} --model ${model} [--tokens N]`);
            } else if (mode === 'judge') {
                const checks = project.eval?.checks ?? {};
                if (!Object.keys(checks).length) fail('eval judge: configure "facetkit": { "eval": { "checks": { "name": "command" } } } in package.json');
                const r = judge(path.resolve(CWD, opt('dir', '.')), checks);
                const s = itemState(events(), opt('item'))?.steps.find((x) => x.id === opt('step'));
                say({ kind: 'eval.replay', item: opt('item'), step: opt('step'), agent: s?.agent, model: opt('model'), results: r.results, passed: r.passed, total: r.total, tokens: opt('tokens') ? Number(opt('tokens')) : undefined });
                console.log(`${opt('item')}/${opt('step')} on ${opt('model')}: ${r.passed}/${r.total} checks passed\n${Object.entries(r.results).map(([k, v]) => `  ${v.exit === 0 ? '✓' : '✗'} ${k} (exit ${v.exit}, ${v.sec}s)`).join('\n')}`);
            } else fail('eval: matrix [--agent A] | compare [--agent A] | snapshot --step S | replay --item I --step S --model M | judge --dir D --item I --step S --model M');
        },
        retro() {
            const mode = positional[0] ?? 'report';
            const ev = events();
            const sigs = () => signals(ev, { tokensOf: tokensOf(), guards: project.retro?.guards, builder: project.retro?.builder });
            if (mode === 'report') {
                const bs = beliefs(sigs(), { halfLife: project.retro?.halfLife ?? 8 });
                const ps = proposals(bs, { loadouts: loadouts(), ladder: flowDef.ladder, minEvidence: project.retro?.minEvidence ?? 4 });
                const adopted = new Set(ev.filter((e) => e.kind === 'change').map((e) => e.proposal));
                const reviews = reviewChanges(ev, sigs());
                if (flag('json')) return void console.log(JSON.stringify({ beliefs: bs, proposals: ps, reviews }, null, 2));
                console.log(bs.length ? renderBeliefs(bs) : 'no evidence yet — beliefs form as items close');
                console.log(`\nproposals (${ps.filter((p) => !adopted.has(p.id)).length}):`);
                for (const p of ps.filter((x) => !adopted.has(x.id))) console.log(`  ${p.id}\n    belief ${p.belief}\n    ${p.action}${p.reasons.length ? `\n    evidence: ${p.reasons.join('; ')}` : ''}`);
                if (reviews.length) console.log(`\nadopted changes:\n${reviews.map((r) => `  ${r.proposal}: ${r.before ?? '—'} → ${r.after ?? '—'} over ${r.items} item(s) — ${r.verdict}`).join('\n')}`);
            } else if (mode === 'signal') {
                const value = Number(opt('value'));
                if (!opt('agent') || !opt('dim') || !(value >= 0 && value <= 1) || !opt('item')) fail('retro signal: --item ID --agent A --dim first-pass|quality|thrift|flow --value 0..1 [--weight W] --why "…"');
                say({ kind: 'signal', item: opt('item'), agent: opt('agent'), dim: opt('dim'), value, weight: opt('weight') ? Number(opt('weight')) : undefined, why: opt('why') });
                console.log('evidence recorded');
            } else if (mode === 'adopt') {
                const [agent, dim] = (positional[1] ?? '').split(':');
                if (!agent || !dim) fail('retro adopt: facet retro adopt <proposal id> — after the change was actually made');
                say({ kind: 'change', proposal: positional[1], agent, dim, what: opt('what') });
                console.log(`recorded: ${positional[1]} — it will be reviewed after five more items`);
            } else if (mode === 'hindsight') {
                const fix = opt('fix');
                if (!fix) fail('retro hindsight: facet retro hindsight --fix <commit> [--record]');
                const pattern = new RegExp(project.itemPattern ?? '\\b[A-Z]{1,3}-?\\d{1,4}\\b');
                const byCommit = new Map(ev.filter((e) => e.kind === 'item.close').flatMap((e) => [e.commit, ...(e.commits ?? [])].filter(Boolean).map((c) => [c.slice(0, 7), e.item])));
                const origins = hindsight(CWD, fix, { itemOf: (sha, subject) => byCommit.get(sha.slice(0, 7)) ?? pattern.exec(subject)?.[0] ?? null });
                if (!origins.length) return void console.log('the fix changed no earlier product lines (new code or tests only)');
                for (const o of origins) console.log(`${(o.item ?? 'unknown item').padEnd(14)} ${o.lines} line(s) in ${o.files.join(', ')} (commits ${o.commits.join(', ')})`);
                if (opt('mode') && !MODES.includes(opt('mode'))) fail(`retro hindsight: unknown cause "${opt('mode')}" (one of: ${MODES.join(', ')})`);
                if (flag('record')) for (const o of origins.filter((x) => x.item && closedItems(ev).includes(x.item))) say({ kind: 'escape', item: o.item, fix: fix.slice(0, 8), lines: o.lines, mode: opt('mode') });
                else console.log('add --record to debit the agents of those items in hindsight');
            } else fail('retro: report | signal … | adopt <proposal id> | hindsight --fix <commit> [--record]');
        },
        plan() {
            const items = routing();
            if (!Object.keys(items).length) fail('plan: no items — set "facetkit": { "routing": "<file with { items: { ID: { deps, tier, version } } }>" }');
            const s = project.schedule ?? {};
            const p = plan(items, events(), { capacity: Number(opt('capacity', s.capacity ?? 120)), perWeek: Number(opt('per-week', s.perWeek ?? 3)), start: opt('start', s.start ?? new Date().toISOString().slice(0, 10)), milestones: s.milestones ?? {}, prior: s.prior, seed: s.seed ?? 7 });
            if (positional[0] === 'next') return void console.log(sessionPlan(p, items).join('\n') || 'nothing left to schedule');
            const text = renderPlan(p, items);
            if (opt('write')) fs.writeFileSync(path.resolve(CWD, opt('write')), text);
            console.log(flag('json') ? JSON.stringify(p, null, 2) : opt('write') ? `schedule written to ${opt('write')}: ${p.remaining} items in ${p.sessions.length} sessions\n${sessionPlan(p, items).join('\n')}` : text);
        },
        timeline() {
            const item = opt('item') ?? theItem(false) ?? closedItems(events()).at(-1);
            if (!item) fail('timeline: no item yet');
            const runs = ledgerOf(item);
            console.log(timeline(events(), item, runs).join('\n'));
            const odd = anomalies(events(), item, runs);
            console.log(odd.length ? `\nlooks wrong:\n${odd.map((a) => `  ${a.kind.padEnd(11)} ${a.step}: ${a.why}`).join('\n')}` : '\nnothing looks wrong');
        },
        journal() {
            if (positional[0] === 'repair') {
                const moved = repairJournal(journal);
                for (const m of moved) console.log(`journal: set aside the torn line ${m.line} of ${m.segment} in ${m.to} — look at it before deleting it`);
                return void console.log(moved.length ? `${moved.length} torn line(s) set aside; the journal can be appended to again` : 'nothing to repair: no segment ends in a torn line');
            }
            const v = verifyJournal(journal);
            const ev = events();
            for (const b of v.broken) console.error(`journal: ${b.segment} line ${b.line} does not follow the line before it — the history was edited`);
            for (const x of v.structure) console.error(`journal: ${x.segment} line ${x.line}: ${x.problem}`);
            for (const c of v.conflicts) console.error(`journal: ${c.item} was opened by ${c.loser} while ${c.winner} held it — ${c.loser} must run: facet flow yield --item ${c.item}`);
            if (v.broken.length || v.structure.length || v.conflicts.length) process.exit(1);
            if (!v.segments) return void console.log('journal: nothing recorded yet');
            console.log(`journal intact: ${v.events} events${v.segments > 1 || me ? ` in ${v.segments} segment(s)` : ''}, ${openItems(ev).length} open, ${closedItems(ev).length} closed`);
        },
        // ---- quality and governance ----------------------------------------------------------
        scan() {
            const item = theItem(false);
            const r = item ? runScan(item) : scan(CWD, { ref: opt('ref', 'HEAD'), forbidden: govern.forbidden ?? ['.env', '**/.env', '**/*.pem', '**/id_rsa*'], ignore: govern.scanIgnore ?? [], stores: govern.stores ?? [] });
            console.log(`scan: ${r.files} changed file(s) · ${r.findings.length} finding(s) · ${r.blocking} blocking${r.approvals.length ? ` · needs approval: ${r.approvals.join(', ')}` : ''}`);
            for (const f of r.findings) console.log(`  ${f.severity.padEnd(7)} ${f.kind.padEnd(15)} ${f.where}  ${f.what}`);
            process.exit(r.blocking ? 1 : 0);
        },
        async check() {
            const item = theItem();
            let wanted = positional.length ? positional : checkNames();
            if (flag('stale')) {
                // only what the changes since the last run actually touch
                const d = decay(events(), item, { hashes: hashesNow(), scopes: scopesFor(evidenceNames(item)), snapshotOf: (src) => readJson(snapshotFile(item, src), null) });
                const have = new Set(d.rows.filter((r) => r.state === 'fresh' && r.ok).map((r) => r.name));
                wanted = checkNames().filter((n) => !have.has(n));
                if (!wanted.length) return void console.log('check: every check still stands for these sources — nothing to run');
                console.log(`check: running only what changed sources touch: ${wanted.join(', ')}`);
            }
            if (!wanted.length) fail('check: configure "facetkit": { "govern": { "checks": { "name": "command" } } } or an extension with checks');
            let failed = 0;
            for (const name of wanted) {
                const cmd = typeof govern.checks?.[name] === 'object' ? govern.checks[name].run : govern.checks?.[name];
                const ext = extensions.find((x) => x.checks?.[name]);
                let ok;
                let value;
                if (cmd) {
                    const r = await run(['sh', '-c', cmd.replaceAll('{item}', item)], { cwd: CWD, timeoutSec: Number(opt('timeout', 600)), ledger: path.join(work, item, 'ledger.jsonl'), logDir: path.join(work, item, 'logs') });
                    ok = r.exit === 0;
                    value = `exit ${r.exit}`;
                } else if (ext) ({ ok, value } = await ext.checks[name]({ cwd: CWD, item, events: events() }));
                else fail(`check: unknown check "${name}" (known: ${checkNames().join(', ')})`);
                say({ kind: 'evidence', item, name, ok: !!ok, value, ...bound(item, name) });
                console.log(`${ok ? '✓' : '✗'} ${name}${value !== undefined ? ` (${value})` : ''}`);
                if (!ok) failed++;
            }
            process.exit(failed ? 1 : 0);
        },
        assure() {
            const item = opt('item') ?? theItem(false) ?? closedItems(events()).at(-1);
            if (!item) fail('assure: no item yet');
            const e = judged(item);
            const g = gate(e, { required: Number(opt('level', govern.required ?? 1)) });
            console.log(flag('json') ? JSON.stringify({ ...e, gate: g }, null, 2) : renderEvaluation(e, g));
            process.exit(g.allow ? 0 : 1);
        },
        waive() {
            const item = theItem();
            if (!positional[0] || !opt('reason') || !opt('by')) fail('waive: facet waive <rule id> --reason "…" --by <person> — a waiver is a named human decision');
            if (!policy().some((r) => r.id === positional[0])) fail(`waive: no rule "${positional[0]}" (rules: ${policy().map((r) => r.id).join(', ')})`);
            say({ kind: 'waiver', item, rule: positional[0], reason: opt('reason'), by: opt('by') });
            console.log(`waiver recorded: ${positional[0]} for ${item} by ${opt('by')} — it will show in the attestation and caps the assurance level`);
        },
        approve() {
            const item = theItem();
            if (!positional[0] || !opt('by')) fail('approve: facet approve <what, e.g. dependency:zod> --by <person>');
            say({ kind: 'approval', item, what: positional[0], by: opt('by'), note: opt('note') });
            console.log(`approval recorded: ${positional[0]} for ${item} by ${opt('by')}`);
        },
        /** proof create|verify|status [--item ID]: the manifest that ties a result to the sources it was checked on. */
        proof() {
            const sub = positional[0] ?? 'status';
            const item = opt('item') ?? positional[1] ?? openItems(events(), me)[0] ?? closedItems(events()).at(-1);
            if (!item) fail('proof: no item (facet proof create|verify|status --item ID)');
            const options = { policy: policy(), checks: checkNames(), project: projectFacts(), ignore: sourceIgnore(), scopes: scopesFor(evidenceNames(item)) };
            const file = proofPath(work, item);
            if (sub === 'decay') {
                const d = decay(events(), item, { hashes: hashesNow(), scopes: options.scopes ?? {}, snapshotOf: (src) => readJson(snapshotFile(item, src), null) });
                console.log(`${item}: trust in the recorded proofs, on the sources as they are now\n${renderDecay(d)}`);
                if (flag('json')) console.log(JSON.stringify(d));
                return;
            }
            if (sub === 'create') {
                const m = createProof(CWD, events(), item, options);
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, `${JSON.stringify(m, null, 2)}\n`);
                if (openItems(events()).includes(item)) say({ kind: 'proof.create', item, digest: m.digest, src: m.source.state, level: m.level });
                return void console.log(`${renderProof(m)}\nwritten: ${path.relative(CWD, file)}`);
            }
            if (!fs.existsSync(file)) fail(`proof: ${item} has no proof pack — facet proof create --item ${item}`);
            const m = JSON.parse(fs.readFileSync(file, 'utf-8'));
            const v = verifyProof(CWD, events(), m, options);
            console.log(renderProof(m, v));
            if (sub === 'verify' && v.status !== 'VALID') process.exit(1);
        },
        /** owners [files…] [--changed] [--agent A]: does every file of the plan have exactly one owner? */
        owners() {
            const manifest = project.owners ?? readJson(path.resolve(CWD, opt('owners', 'owners.json')), null);
            if (!manifest) fail('owners: no manifest — add owners.json ({ "owners": { "src/**": "agent" }, "shared": [] }) or "owners" to the project settings', 2);
            const files = positional.length ? positional : changedFiles().filter((f) => !sourceIgnore().concat(['.work/', '.facet/']).some((p) => f.startsWith(p.replace('/**', '/'))));
            if (!files.length) return void console.log('owners: no files to check (pass paths, or change something)');
            const c = checkOwners(files, manifest, { agent: opt('agent') ?? null });
            console.log(renderOwners(c, { agent: opt('agent') ?? null }));
            evidence('owners', c.ok, c.unassigned.length + c.conflicts.length + c.foreign.length);
            if (!c.ok) process.exit(1);
        },
        /** experiment new|start|stop|report|arm: controlled trials of single facets. */
        experiment() {
            const sub = positional[0] ?? 'report';
            const all = loadExperiments(CWD);
            const one = () => all.find((m) => m.id === positional[1]) ?? fail(`experiment: no experiment "${positional[1] ?? ''}" (known: ${all.map((m) => m.id).join(', ') || 'none'})`);
            if (sub === 'new') {
                const facet = allFacets().find((f) => f.ref === opt('facet'));
                if (!positional[1] || !facet) fail('experiment: facet experiment new <ID> --facet skill:facet --seed S [--min 20] [--model M] [--class C] [--confirms ID]');
                if (all.some((m) => m.id === positional[1])) fail(`experiment: ${positional[1]} exists; a manifest is written once, before the data`);
                try {
                    assertAblatable(facet);
                    saveExperiment(CWD, newExperiment({ id: positional[1], facet: facet.ref, seed: opt('seed'), minSamples: Number(opt('min', 20)), model: opt('model') ?? null, taskClass: opt('class') ?? null, confirms: opt('confirms') ?? null }));
                } catch (e) {
                    fail(`experiment: ${e.message}`);
                }
                return void console.log(`experiment ${positional[1]} planned for ${facet.ref}. Start it: facet experiment start ${positional[1]}`);
            }
            if (sub === 'start' || sub === 'stop') {
                const m = one();
                saveExperiment(CWD, { ...m, status: sub === 'start' ? 'running' : 'stopped', [sub === 'start' ? 'startedAt' : 'stoppedAt']: new Date().toISOString() });
                return void console.log(`experiment ${m.id}: ${sub === 'start' ? 'running — units are assigned as steps start' : 'stopped — no further units are assigned'}`);
            }
            if (sub === 'arm') return void console.log(assign(one(), opt('unit') ?? fail('experiment: --unit "ITEM|step"')));
            const chosen = positional[1] ? [one()] : all;
            if (!chosen.length) return void console.log('no experiments yet: facet experiment new <ID> --facet skill:facet --seed S');
            const read = (m) => analyse(events(), m, { comparisons: chosen.filter((x) => x.status !== 'planned').length || 1, prior: m.confirms && all.find((x) => x.id === m.confirms) ? analyse(events(), all.find((x) => x.id === m.confirms)) : null });
            console.log(chosen.map((m) => `${renderAnalysis(read(m))}\n  status: ${m.status} · seed ${m.seed} · held equal: model ${m.model ?? 'any'}, task class ${m.taskClass ?? 'any'}`).join('\n\n'));
        },
        /** benchmark [--write]: the guards against cases they did not write. */
        benchmark() {
            const dir = path.resolve(CWD, opt('dir', 'benchmark'));
            if (!fs.existsSync(path.join(dir, 'expected.json'))) fail(`benchmark: no ${path.relative(CWD, dir)}/expected.json`, 2);
            const version = readJson(path.resolve(CWD, 'package.json'), {}).version ?? '0.0.0';
            const report = benchmarkReport(runBenchmark(dir), { root: CWD, version });
            const results = path.join(dir, 'results');
            const earlier = fs.existsSync(results) ? fs.readdirSync(results).filter((f) => f.endsWith('.json') && f !== `${version}.json`).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
            const lost = earlier.length ? regressions(JSON.parse(fs.readFileSync(path.join(results, earlier.at(-1)), 'utf-8')), report) : [];
            console.log(renderBenchmark(report, lost));
            if (flag('write')) {
                fs.mkdirSync(results, { recursive: true });
                fs.writeFileSync(path.join(results, `${version}.json`), `${JSON.stringify(report, null, 1)}\n`);
            }
            if (report.failed) process.exit(1);
        },
        /** route [files…] [--task "…"] [--changed] [--item ID --apply] [--strategy S] [--json]: who is responsible, how risky, which route. */
        route() {
            const graph = graphNow();
            const all = [...hashesNow().keys()];
            let files = positional.filter((f) => f !== 'route');
            if (flag('changed')) files = [...files, ...changedFiles().filter((f) => all.includes(f))];
            if (opt('task') && !files.length) {
                const found = discover(opt('task'), all, { symbols: new Map() });
                if (!found.certain) {
                    console.log(found.candidates.length ? `the task names no file. Files that share its words:\n${found.candidates.map((c) => `  ${String(c.score).padStart(2)}  ${c.file}`).join('\n')}\nconfirm the ones it will touch: facet route <files…>` : 'the task names no file and no path shares its words: name the files it will touch — facet route <files…>');
                    process.exit(2);
                }
                files = found.named;
            }
            if (!files.length) fail('route: facet route <files…> | --changed | --task "text that names files"');
            const manifest = project.owners ?? readJson(path.resolve(CWD, opt('owners', 'owners.json')), null);
            const plan = planRoute(files, { graph, owners: manifest, flow: flowDef, planning: { ...DEFAULT_PLANNING, ...(project.planning ?? {}) }, strategy: opt('strategy', 'adaptive') });
            console.log(flag('json') ? JSON.stringify(plan, null, 2) : renderRoute(plan, flowDef));
            if (flag('apply')) {
                const item = opt('item') ?? fail('route --apply: name the item with --item ID');
                if (!plan.ok) fail('route: not applied — the ownership problems above come first');
                const file = path.resolve(CWD, opt('routing', project.routing ?? 'routing.json'));
                const data = readJson(file, { items: {} });
                data.items ??= {};
                data.items[item] = { ...(data.items[item] ?? {}), route: plan.route, gates: [...new Set([...(data.items[item]?.gates ?? []), ...plan.gates])], locked: plan.locked.map((g) => g.agent), skip: plan.skip, tier: plan.tier, class: plan.classes.join('+'), difficulty: plan.difficulty, files };
                fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
                console.log(`\nrecorded for ${item} in ${path.relative(CWD, file)} — facet flow open ${item}`);
            }
            if (!plan.ok) process.exit(1);
        },
        /** intel design|start|stop|report: controlled trials of a facet — presence, wording, model, position. */
        intel() {
            const sub = positional[0] ?? 'report';
            const all = loadExperiments(CWD).filter((m) => m.arms);
            const one = () => all.find((m) => m.id === positional[1]) ?? fail(`intel: no design "${positional[1] ?? ''}" (known: ${all.map((m) => m.id).join(', ') || 'none'})`);
            if (sub === 'design') {
                const facet = allFacets().find((f) => f.ref === opt('facet'));
                if (!positional[1] || !facet) fail('intel: facet intel design <ID> --facet skill:facet --seed S [--arms four --other-model M] [--variant FILE] [--primary clean|errors|falsePasses|retries|tokens|minutes] [--min 30] [--confirms ID]');
                if (loadExperiments(CWD).some((m) => m.id === positional[1])) fail(`intel: ${positional[1]} exists; a design is written once, before the data`);
                try {
                    assertAblatable(facet);
                    const arms = opt('arms') === 'four' ? fourArms(opt('other-model') ?? fail('intel: --arms four needs --other-model M')) : opt('variant') ? [{ id: 'A', facet: 'on' }, { id: 'B', facet: 'variant', variant: opt('variant') }, { id: 'C', facet: 'off' }] : undefined;
                    if (opt('variant') && !fs.existsSync(path.resolve(CWD, opt('variant')))) fail(`intel: no file ${opt('variant')}`);
                    saveExperiment(CWD, newDesign({ id: positional[1], facet: facet.ref, seed: opt('seed'), ...(arms ? { arms } : {}), primary: opt('primary', 'clean'), minPerArm: Number(opt('min', 30)), confirms: opt('confirms') ?? null }));
                } catch (e) {
                    fail(`intel: ${e.message}`);
                }
                return void console.log(`design ${positional[1]} written for ${facet.ref}. Start it: facet intel start ${positional[1]}`);
            }
            if (sub === 'size') {
                const [from, to] = [Number(opt('from')), Number(opt('to'))];
                try {
                    return void console.log(`to see "${opt('from')} → ${opt('to')}" with ${Math.round(Number(opt('power', 0.8)) * 100)}% power: ${unitsNeeded(from, to, { power: Number(opt('power', 0.8)) })} units in each arm (pass it as --min)`);
                } catch (e) {
                    fail(`intel size: --from RATE --to RATE — ${e.message}`);
                }
            }
            if (sub === 'start' || sub === 'stop') {
                const m = one();
                saveExperiment(CWD, { ...m, status: sub === 'start' ? 'running' : 'stopped', [sub === 'start' ? 'startedAt' : 'stoppedAt']: new Date().toISOString() });
                return void console.log(`design ${m.id}: ${sub === 'start' ? 'running — arms are dealt as steps start' : 'stopped'}`);
            }
            const chosen = positional[1] ? [one()] : all;
            if (!chosen.length) return void console.log('no designs yet: facet intel design <ID> --facet skill:facet --seed S');
            const read = (m) => analyseDesign(events(), m, { prior: m.confirms && all.find((x) => x.id === m.confirms) ? analyseDesign(events(), all.find((x) => x.id === m.confirms)) : null });
            console.log(chosen.map((m) => `${renderDesign(read(m))}\n  status: ${m.status} · seed ${m.seed} · strata: ${m.strata.join(', ')} · floor ${m.minPerArm} per arm`).join('\n\n'));
        },
        /** evolve scan|list|test|adopt|reject: recurring mistakes → diagnosed rules → tested changes → a person's decision. */
        /** hypo new|list: beliefs about the team's work, stated so that the journal can prove them wrong. */
        hypo() {
            const sub = positional[0] ?? 'list';
            const all = loadHypotheses(CWD);
            if (sub === 'new') {
                if (all.some((h) => h.id === positional[1])) fail(`hypo: ${positional[1]} exists; a prediction is written once, before the data`);
                try {
                    saveHypothesis(CWD, newHypothesis({ id: positional[1], claim: opt('claim'), facet: opt('facet') ?? null, metric: opt('metric', 'clean'), direction: opt('direction', 'better'), margin: Number(opt('margin', 0.05)), arm: opt('arm', 'B'), design: opt('design') ?? null }));
                } catch (e) {
                    fail(`hypo: ${e.message} — facet hypo new <ID> --claim "…" [--facet skill:facet] [--metric clean] [--direction better|worse|none] [--margin 0.05] [--design ID]`);
                }
                return void console.log(`hypothesis ${positional[1]} recorded. Test it: facet intel design <DESIGN> --facet … --seed …, then set "design" in trials/hypotheses/${positional[1]}.json`);
            }
            console.log(renderHypotheses(judgedHypotheses().map(({ h, v }) => ({ h, v }))));
        },
        /** learn [apply --by NAME | list | retire ID]: judged hypotheses become lessons that change what agents are given. */
        learn() {
            const sub = positional[0] ?? 'list';
            const lessons = loadLessons(CWD);
            if (sub === 'apply') {
                const by = opt('by') ?? fail('learn apply: --by NAME — what the team learns is a person\'s decision');
                const fresh = [];
                for (const { h, v, design } of judgedHypotheses()) {
                    if (lessons.some((l) => l.because.includes(h.id) && l.status === 'active')) continue;
                    if (v.verdict === 'promising' && !flag('provisional')) continue; // found once: not learned unless asked for, and then at lower confidence
                    const stratum = design?.strata?.includes('agent') ? { agent: opt('agent') ?? null } : {};
                    const l = lessonFrom(h, v, { when: { ...stratum, taskClass: opt('class') ?? null, difficulty: opt('difficulty') ?? null }, at: itemsClosed(events()), model: opt('model') ?? null });
                    if (l) fresh.push({ ...l, adoptedBy: by });
                }
                if (!fresh.length) return void console.log('nothing new to learn: no hypothesis has a settled verdict that is not already a lesson (found once only → add --provisional)');
                saveLessons(CWD, [...lessons, ...fresh]);
                for (const l of fresh) say({ kind: 'learn', lesson: l.id, because: l.because, by });
                return void console.log(`${fresh.length} lesson(s) learned by decision of ${by}:\n${renderLessons(fresh, events())}`);
            }
            if (sub === 'retire') {
                if (!lessons.some((l) => l.id === positional[1])) fail(`learn: no lesson "${positional[1] ?? ''}"`);
                saveLessons(CWD, lessons.map((l) => (l.id === positional[1] ? { ...l, status: 'retired', retiredWhy: opt('why', 'by hand') } : l)));
                return void console.log(`${positional[1]} retired`);
            }
            console.log(renderLessons(lessons, events()));
        },
        /** trustgraph [--item ID]: who and what each result rests on, and how far each of them has held so far. */
        trustgraph() {
            console.log(renderTrustGraph(trustGraphNow(), { item: opt('item') ?? positional[0] ?? null }));
        },
        /** heal [scan|apply|undo KEY]: the team's own weak points, the safe repairs, and whether earlier repairs worked. */
        heal() {
            const sub = positional[0] ?? 'scan';
            const found = weaknessesNow();
            if (sub === 'undo') {
                const h = events().filter((e) => e.kind === 'heal').findLast((e) => e.key === positional[1]) ?? fail(`heal: nothing applied under "${positional[1] ?? ''}"`);
                say({ kind: 'heal.undo', key: h.key, agent: h.agent, check: h.check });
                return void console.log(`${h.key}: ${h.action} undone`);
            }
            const p = healPlan(found, events());
            if (sub === 'apply') {
                for (const w of p.auto) {
                    if (w.remedy.action === 'retire-lesson') saveLessons(CWD, loadLessons(CWD).map((l) => (l.id === w.remedy.lesson ? { ...l, status: 'retired', retiredWhy: w.text } : l)));
                    if (w.remedy.action === 'file-proposal') for (const x of propose(patterns(events()).flatMap((pt) => diagnosePattern(pt, events(), allFacets(), { ledgerOf })), loadProposals(CWD))) saveProposal(CWD, x);
                    say({ kind: 'heal', key: w.key, action: w.remedy.action, agent: w.remedy.agent, from: w.remedy.from, to: w.remedy.to, check: w.remedy.check, lesson: w.remedy.lesson, closedThen: itemsClosed(events()) });
                    console.log(`applied: ${w.text}\n  → ${w.remedy.text}   (undo: facet heal undo "${w.key}")`);
                }
                if (!p.auto.length) console.log('nothing to repair automatically');
                return;
            }
            console.log(renderHeal(p, followUp(found, events())));
        },
        /** economy [--role AGENT --phase PHASE] [--risk low|normal|high]: what each capability costs and returns; what a budget buys. */
        economy() {
            const judgedRows = judgedHypotheses().map(({ h, v, analysis }) => ({ h, v, effect: analysis?.arms.find((a) => a.arm === h.predicts.arm)?.primary?.diff ?? null }));
            const role = opt('role');
            const pool = role ? resolvePicks(skills(), loadoutPicks(loadouts(), role, opt('phase')).picks).facets : allFacets().filter((f) => loadedRefs().has(f.ref));
            const prices = priceFacets(pool, events(), { judged: judgedRows });
            const allocation = role ? allocate(prices, { budgetWords: Number(opt('budget', loadoutPicks(loadouts(), role, opt('phase')).budget ?? 400)) }) : null;
            console.log(renderEconomy(prices, allocation, { perRework: reworkCost(events()), items: itemsClosed(events()) }));
            if (role) {
                const h = hire(trustGraphNow(), role, { ladder: flowDef.ladder, risk: opt('risk', 'normal') });
                console.log(`labour: run ${role} on ${h.model} for risk "${opt('risk', 'normal')}" — ${h.why}\n${h.rows.map((r) => `  ${r.model.padEnd(8)} trust ${r.trust} (${r.n} items)`).join('\n')}`);
            }
        },
        evolve() {
            const sub = positional[0] ?? 'list';
            const all = loadProposals(CWD);
            const one = () => all.find((p) => p.id === positional[1]) ?? fail(`evolve: no proposal "${positional[1] ?? ''}" (known: ${all.map((p) => p.id).join(', ') || 'none'})`);
            const analysisOf = (p) => {
                const designs = loadExperiments(CWD).filter((m) => m.arms && m.proposal === p.id);
                const last = designs.find((d) => d.confirms) ?? designs[0];
                if (!last) return null;
                const first = designs.find((d) => d.id === last.confirms);
                return analyseDesign(events(), last, { prior: first ? analyseDesign(events(), first) : null });
            };
            if (sub === 'scan') {
                const found = patterns(events());
                const diagnoses = found.flatMap((pt) => diagnosePattern(pt, events(), allFacets(), { ledgerOf }));
                const fresh = propose(diagnoses, all);
                for (const p of fresh) saveProposal(CWD, p);
                console.log(`${found.length} recurring cause(s) in the last closed items; ${fresh.length} new proposal(s)\n${renderProposals(fresh)}`);
                return;
            }
            if (sub === 'test') {
                const p = one();
                try {
                    const id = opt('id', `${p.id}-X${loadExperiments(CWD).filter((m) => m.proposal === p.id).length + 1}`);
                    const prior = loadExperiments(CWD).find((m) => m.proposal === p.id && !m.confirms);
                    const d = { ...designFor({ ...p, facet: opt('facet') ?? p.facet }, { id, seed: opt('seed'), variant: opt('variant') ?? null, otherModel: opt('other-model') ?? null, minPerArm: Number(opt('min', 30)) }), confirms: prior?.id ?? null };
                    saveExperiment(CWD, d);
                    saveProposal(CWD, { ...p, status: 'testing', design: id });
                    console.log(`${p.id}: design ${id} written (${d.arms.map((a) => a.id).join(' / ')})${prior ? `, as the independent repetition of ${prior.id}` : ''}. Start it: facet intel start ${id}`);
                } catch (e) {
                    fail(`evolve: ${e.message}`);
                }
                return;
            }
            if (sub === 'adopt') {
                const p = one();
                const by = opt('by') ?? fail('evolve adopt: --by NAME — adoption is a person\'s decision');
                const verdict = mayAdopt(p, analysisOf(p));
                if (!verdict.ok) fail(`evolve: ${p.id} is not adopted — ${verdict.why}`);
                saveProposal(CWD, { ...p, status: 'adopted', adoptedBy: by, adoptedAt: new Date().toISOString(), basis: verdict.why });
                console.log(`${p.id} adopted by ${by} — ${verdict.why}\nnow make the change itself: ${p.change}`);
                return;
            }
            if (sub === 'reject') {
                const p = one();
                saveProposal(CWD, { ...p, status: 'rejected', rejectedWhy: opt('why') ?? fail('evolve reject: --why "…"') });
                return void console.log(`${p.id} rejected`);
            }
            console.log(renderProposals(all));
        },
        attest() {
            const options = { policy: policy(), checks: checkNames(), project: projectFacts() };
            if (opt('verify')) {
                const given = JSON.parse(fs.readFileSync(path.resolve(CWD, opt('verify')), 'utf-8'));
                if (digestOf(given) !== given.digest) fail(`attest: ${opt('verify')} was edited after it was written (its content does not match its own digest)`);
                const now = attest(events(), given.item, options);
                if (now.digest !== given.digest) fail(`attest: ${given.item} does not match the journal (file ${given.digest}, journal ${now.digest}) — the file or the history changed`);
                return void console.log(`attestation of ${given.item} matches the journal: ${now.level}, digest ${now.digest}`);
            }
            const item = opt('item') ?? closedItems(events()).at(-1);
            if (!item) fail('attest: no closed item');
            console.log(JSON.stringify(attest(events(), item, options), null, 2));
        },
        trust() {
            const t = trust(events(), { policy: policy(), checks: checkNames(), project: projectFacts() });
            console.log(flag('json') ? JSON.stringify(t, null, 2) : renderTrust(t));
        },
        canary() {
            const mode = positional[0];
            const keep = path.join(work, 'canary.json');
            if (mode === 'run') {
                const files = list(opt('files'));
                if (!files.length || !opt('test')) fail('canary run: facet canary run --files a,b --test "CMD" [--max 5] [--guard tests]');
                const r = probe({ cwd: CWD, files, test: opt('test'), max: Number(opt('max', 5)), timeoutSec: Number(opt('timeout', 120)), maxMinutes: Number(opt('max-minutes', 10)) });
                if (r.baseline !== 'green') fail(`canary: ${r.message}`, 2);
                for (let i = 0; i < r.killed; i++) say({ kind: 'canary', guard: opt('guard', 'tests'), caught: true });
                for (const m of r.survived) say({ kind: 'canary', guard: opt('guard', 'tests'), caught: false, where: `${m.file}:${m.line}` });
                console.log(`planted ${r.planned} defect(s): ${opt('guard', 'tests')} caught ${r.killed}, missed ${r.survived.length}`);
            } else if (mode === 'plant') {
                if (fs.existsSync(keep) && fs.readFileSync(keep, 'utf-8').trim()) fail('canary plant: a canary is already planted — reveal it first');
                const { picked } = planMutants(CWD, list(opt('files')), { max: 40 });
                if (!picked.length) fail('canary plant: nothing to mutate in --files');
                const m = picked[Number(opt('pick', Date.now() % picked.length)) % picked.length];
                const abs = path.join(CWD, m.file);
                const original = fs.readFileSync(abs, 'utf-8');
                const lines = original.split('\n');
                lines[m.line - 1] = m.raw;
                fs.mkdirSync(work, { recursive: true });
                fs.writeFileSync(keep, JSON.stringify({ file: m.file, line: m.line, op: m.op, original }));
                fs.writeFileSync(abs, lines.join('\n'));
                console.log('a defect is planted in the working tree. Run the guard as usual (do not tell it), then: facet canary reveal --guard <agent> --caught yes|no');
            } else if (mode === 'reveal') {
                if (!fs.existsSync(keep) || !fs.readFileSync(keep, 'utf-8').trim()) fail('canary reveal: nothing is planted');
                const c = JSON.parse(fs.readFileSync(keep, 'utf-8'));
                fs.writeFileSync(path.join(CWD, c.file), c.original);
                fs.writeFileSync(keep, '');
                if (!opt('guard') || !['yes', 'no'].includes(opt('caught'))) fail(`canary reveal: restored ${c.file}; nothing recorded — pass --guard <agent> --caught yes|no`);
                say({ kind: 'canary', guard: opt('guard'), caught: opt('caught') === 'yes', where: `${c.file}:${c.line}`, op: c.op });
                console.log(`restored ${c.file}:${c.line} (${c.op}); recorded: ${opt('guard')} ${opt('caught') === 'yes' ? 'caught' : 'missed'} it`);
            } else fail('canary: run --files a,b --test "CMD" | plant --files a,b | reveal --guard <agent> --caught yes|no');
        },
        skill() {
            const mode = positional[0] ?? 'report';
            const facets = allFacets();
            if (mode === 'report') {
                const rows = diagnose(exposures(events(), { ledgerOf, facets }), facets).filter((r) => !opt('facet') || r.facet === opt('facet'));
                console.log(flag('json') ? JSON.stringify(rows, null, 2) : renderDiagnosis(rows));
                const blind = facets.filter((f) => !f.footprint.length).length;
                if (!flag('json')) console.log(`\n${blind} of ${facets.length} facets have no footprint: whether they are followed cannot be seen.${(project.skillint?.ablate?.rate ?? 0) > 0 ? '' : ' Withholding is off: effects are correlations until "skillint": { "ablate": { "rate": 0.1 } } is set.'}`);
            } else if (mode === 'coverage') console.log(renderCoverage(coverage(events(), facets, { loaded: loadedRefs() })));
            else if (mode === 'modes') console.log(MODES.join('\n'));
            else fail('skill: report [--facet skill:facet] [--json] | coverage | modes');
        },
        // ---- code atlas and board ------------------------------------------------------------
        atlas() {
            const dirs = list(opt('dirs')).length ? list(opt('dirs')) : (project.dirs ?? ['src', 'server', 'lib', 'tests', 'test', 'e2e']);
            const a = buildAtlas(CWD, dirs, { withHistory: !flag('no-history') });
            const mode = positional[0] ?? 'stats';
            if (mode === 'card') {
                const files = positional.slice(1).flatMap((f) => f.split(','));
                if (!files.length) fail('atlas card: facet atlas card <file>… [--budget 220]');
                const extra = {};
                for (const m of loadMemory(memoryFile)) for (const f of files) if (!m.retired && condition(m, CWD) === 'live' && m.anchor?.startsWith(`${f}:`)) (extra[f] ??= []).push(`known (${m.id}): ${m.text}`);
                console.log(card(a, files, { budgetWords: Number(opt('budget', 220)), extra }).text);
            } else if (mode === 'find') {
                const hits = findSymbol(a, positional[1] ?? '');
                console.log(hits.length ? hits.map((x) => `${x.file}:${x.line} ${x.kind} — used by ${x.users.length}: ${x.users.slice(0, 6).join(', ')}${x.users.length > 6 ? ', …' : ''}`).join('\n') : `no export named "${positional[1]}"`);
            } else if (mode === 'path') {
                const p = pathBetween(a, positional[1], positional[2]);
                console.log(p ? p.join(' → ') : 'no chain of imports connects them');
            } else if (mode === 'hotspots') console.log(hotspots(a, Number(opt('top', 10))).map((x) => `${String(x.churn).padStart(3)} commits · used by ${String(x.fanIn).padStart(2)} · tests ${x.tests || 'none'}  ${x.file}`).join('\n') || 'no history yet');
            else if (mode === 'coupling') console.log(hiddenCoupling(a).slice(0, Number(opt('top', 10))).map((c) => `${Math.round(c.strength * 100)}% (${c.together}×)  ${c.a}  ↔  ${c.b}`).join('\n') || 'no hidden coupling found');
            else if (mode === 'stats') console.log(Object.entries(atlasStats(a)).map(([key, v]) => `${key} ${v}`).join(' · '));
            else fail('atlas: card <file>… | find <name> | path <a> <b> | hotspots | coupling | stats');
        },
        board() {
            const ev = events();
            const out = path.resolve(CWD, opt('out', project.board ?? 'facet-board.html'));
            const items = routing();
            const s = project.schedule ?? {};
            const sigs = signals(ev, { tokensOf: tokensOf() });
            let atlasPart = null;
            if (!flag('no-atlas')) {
                const a = buildAtlas(CWD, project.dirs ?? ['src', 'server', 'lib', 'tests', 'test', 'e2e']);
                atlasPart = { stats: atlasStats(a), hotspots: hotspots(a, 12), hidden: hiddenCoupling(a).slice(0, 12) };
            }
            const data = boardData(ev, {
                title: opt('title', project.title ?? path.basename(CWD)),
                policy: policy(),
                checks: checkNames(),
                project: projectFacts(),
                cost: costReport(usage(), ev, { prices: project.prices ?? {} }),
                matrix: matrix(observations(ev, { tokensOf: tokensOf() })),
                beliefs: beliefs(sigs),
                plan: Object.keys(items).length ? plan(items, ev, { capacity: s.capacity ?? 120, perWeek: s.perWeek ?? 3, start: s.start ?? new Date().toISOString().slice(0, 10), milestones: s.milestones ?? {}, prior: s.prior, seed: s.seed ?? 7 }) : null,
                atlas: atlasPart,
                skills: { rows: diagnose(exposures(ev, { ledgerOf, facets: allFacets() }), allFacets()).filter((r) => r.exposed || r.withheld).map(({ facet, verdict, action, exposed, withheld, adherence, withRule, without, effect }) => ({ facet, verdict, action, exposed, withheld, adherence, withRule, without, effect })), coverage: coverage(ev, allFacets(), { loaded: loadedRefs() }), total: allFacets().length, blind: allFacets().filter((f) => !f.footprint.length).length },
            });
            fs.mkdirSync(path.dirname(out), { recursive: true });
            fs.writeFileSync(out, renderBoard(data));
            console.log(`board written to ${path.relative(CWD, out)} (${data.items.length} items, ${ev.length} events) — open it in a browser`);
        },
    };
}
