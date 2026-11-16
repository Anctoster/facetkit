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
import { closedItems, epochOf, forceUnlock, holderOf, isSegmented, ofItem, openItems, readJournal, record, repairJournal, setSigner, verifyJournal, writerId } from '../lib/journal.mjs';
import { benchmarkReport, regressions, renderBenchmark, reportProblems, runBenchmark, trend } from '../lib/benchmark.mjs';
import { analyse, assertAblatable, assign, loadExperiments, newExperiment, renderAnalysis, saveExperiment, unitOf } from '../lib/experiments.mjs';
import { designFor, diagnosePattern, loadProposals, mayAdopt, patterns, propose, renderProposals, saveProposal } from '../lib/evolve.mjs';
import { curriculum, faded, lessonFrom, loadLessons, recallLessons, renderLessons, saveLessons } from '../lib/cognition.mjs';
import { allocate, hire, itemsClosed, priceFacets, renderEconomy, reworkCost } from '../lib/economy.mjs';
import { followUp, overrides, plan as healPlan, renderHeal, weaknesses } from '../lib/heal.mjs';
import { judge as judgeHypothesis, loadHypotheses, newHypothesis, renderHypotheses, saveHypothesis } from '../lib/hypothesis.mjs';
import { buildTrustGraph, renderTrustGraph } from '../lib/trustgraph.mjs';
import { analyseDesign, armFor, armOfUnit, fourArms, newDesign, renderDesign, stratumOf, unitsNeeded, unitsSoFar } from '../lib/intelligence.mjs';
import { candidates, cfReport, armRules, renderCf, writeRules } from '../lib/counterfactual.mjs';
import { exportKnowledge, importLessons, IMPORT_START, pool, renderPool } from '../lib/crosslearn.mjs';
import { AUDIENCES, explain, explainHtml } from '../lib/explain.mjs';
import { checkFitness, renderFitness } from '../lib/fitness.mjs';
import { addTrust, newKey, saveKey, trustFile } from '../lib/sign.mjs';
import { ADAPT, adapt, adaptationFor, adaptationsOf, renderAdaptations } from '../lib/adapt.mjs';
import { blocking, checkHandoff, findTemplate, renderHandoff, TEMPLATE_OF, workingChanges } from '../lib/handoff.mjs';
import { DEFAULT_PLANNING, discover, planRoute, renderPlan as renderRoute, stepsOf } from '../lib/planner.mjs';
import { buildGraph, isTest } from '../lib/seams.mjs';
import { checkOwners, renderOwners } from '../lib/ownership.mjs';
import { witness, exportProof, renderBundle, verifyBundle, createProof, decay, fileHashes, proofPath, renderDecay, renderProof, scopesNow, sourceState, verifyProof } from '../lib/proof.mjs';
import { planMutants, probe } from '../lib/mutaprobe.mjs';
import { route } from '../lib/router.mjs';
import { scan } from '../lib/secscan.mjs';
import { coverage, diagnose, exposures, liveWithholdable, MODES, renderCoverage, renderDiagnosis, withheldForItem } from '../lib/skillint.mjs';
import { compose, loadoutPicks, renderLoadout, resolvePicks } from '../lib/facets.mjs';
import { condition, credit, loadMemory, recall, remember, renderRecall, retire, utility } from '../lib/memory.mjs';
import { anomalies, timeline } from '../lib/observe.mjs';
import { beliefs, hindsight, proposals, renderBeliefs, reviewChanges, signals } from '../lib/retro.mjs';
import { plan, renderPlan, sessionPlan } from '../lib/schedule.mjs';
import { readLedger, run } from '../lib/thrift.mjs';
import { environment } from '../lib/envinfo.mjs';
import { eventSigner, eventVerifiers, loadKey, loadTrust, sign } from '../lib/sign.mjs';
import { sha256 } from '../lib/text.mjs';

export function opsCommands({ CWD, KIT = null, project, opt, flag, list, fail, positional, work, readJson, loadoutsFile, extensions = [], skills = () => [] }) {
    const journal = path.resolve(CWD, opt('journal', project.journal ?? path.join(work, 'journal.jsonl')));
    const me = isSegmented(journal) ? writerId() : undefined; // in a segmented journal every writer has its own file and its own open item
    const usageFile = path.resolve(CWD, project.usage ?? (isSegmented(journal) ? path.join(journal, `${me}.usage`) : path.join(path.dirname(journal), 'usage.jsonl')));
    const memoryFile = path.resolve(CWD, opt('memory', project.memory ?? '.facet/memory.jsonl'));
    const flowDef = { ...DEFAULT_FLOW, ...readJson(path.resolve(CWD, project.flow ?? 'flow.json'), {}) };
    const routing = () => readJson(path.resolve(CWD, opt('routing', project.routing ?? 'routing.json')), { items: {} }).items ?? {};
    const loadouts = () => readJson(loadoutsFile, {});
    const events = () => readJournal(journal);
    // authorship: with a private key at hand and `govern.signEvents`, every event this process writes is signed
    const myKey = () => {
        try {
            return loadKey();
        } catch {
            return null;
        }
    };
    const trustNow = () => loadTrust(CWD);
    if (project.govern?.signEvents && myKey()) setSigner(eventSigner(myKey()));
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
        const v = verifyJournal(journal, { keys: eventVerifiers(trustNow()) });
        return { journalIntact: v.intact };
    };
    // evidence belongs to the state of the sources it was measured on; "off" restores time-only staleness
    const sourceIgnore = () => [...(govern.sourceIgnore ?? []), `${path.relative(CWD, journal).split(path.sep).join('/')}${isSegmented(journal) ? '/**' : ''}`, `${path.relative(CWD, journal).split(path.sep).join('/')}.lock`];
    let sourceMemo;
    let hashMemo;
    let graphMemo;
    const hashesNow = () => (hashMemo ??= fileHashes(CWD, { ignore: sourceIgnore(), include: govern.inputs ?? [], cache: path.join(work, '.hashcache.json') }));
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
    const kitVersion = () => (KIT ? readJson(path.join(KIT, 'package.json'), {}).version ?? null : null);
    let envMemo;
    /** Where this process measures: probed once per command; the external version probes are skipped for plain evidence and run for proofs and benchmarks. */
    const envNow = (tools = false) => (tools ? environment(CWD, { kit: kitVersion() }) : (envMemo ??= environment(CWD, { tools: false, kit: kitVersion() })));
    const inputs = () => govern.inputs ?? []; // ignored files a build reads all the same: they belong to the source state
    /** The guard benchmark shipped with this version of the tool: what says its checks catch anything. */
    const kitBenchmark = () => {
        const r = KIT ? readJson(path.join(KIT, 'benchmark', 'results', `${kitVersion()}.json`), null) : null;
        return r ? { digest: r.digest ?? sha256(JSON.stringify(r.cases ?? [])), version: r.version, passed: r.passed, total: r.total, env: r.environment?.comparable ?? null } : null;
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
        return { src, env: envNow().digest, scope: { digest: sc.digest, files: sc.files } };
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
    /** The rule this item goes without, if any: recorded on item.open, so it is the same for every step and every resume. */
    const itemWithholding = (item) => ofItem(events(), item).find((e) => e.kind === 'item.open')?.withheld ?? null;
    /** Drawn when the item opens, over the live-withholdable rules of every role on its route. */
    const drawWithholding = (item, steps) => {
        const rate = project.skillint?.ablate?.rate ?? 0;
        if (!(rate > 0)) return null;
        const required = Number(govern.required ?? 1);
        const candidates = steps.filter((st) => st.agent && st.phase && loadouts().roles?.[st.agent]?.phases?.[st.phase]).flatMap((st) => {
            const lo = loadoutPicks(loadouts(), st.agent, st.phase);
            return compose(resolvePicks(skills(), lo.picks).facets, { budget: lo.budget }).used;
        }).filter((f) => liveWithholdable(f, { policy: policy(), required })).map((f) => f.ref);
        return withheldForItem(candidates, { item, rate, seed: project.skillint?.ablate?.seed });
    };
    const rulesFor = (step, item) => {
        if (!step.agent || !step.phase || !loadouts().roles?.[step.agent]?.phases?.[step.phase]) return { facets: [], withheld: [], file: null, experiments: [], lessons: [] };
        const lo = loadoutPicks(loadouts(), step.agent, step.phase);
        const used = compose(resolvePicks(skills(), lo.picks).facets, { budget: lo.budget }).used;
        // withholding in real work: one rule per ITEM, drawn once, and only a rule whose backstop the policy enforces
        const withheld = [];
        const drawn = itemWithholding(item);
        if (drawn && used.some((f) => f.ref === drawn.ref)) withheld.push(drawn.ref);
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
            const stratum = known?.stratum ?? stratumOf(d, { agent: step.agent, taskClass: routing()[item]?.class ?? null, difficulty: routing()[item]?.difficulty ?? itemState(events(), item)?.tier ?? null, risk: routing()[item]?.risk ?? null, model: modelFor(step, { loadouts: loadouts(), flow: flowDef }).model });
            const armId = known?.arm ?? armFor(d, stratum, unitsSoFar(events(), d, stratum));
            const arm = d.arms.find((a) => a.id === armId);
            experiments.push({ id: d.id, facet: d.facet, arm: armId, stratum });
            if (arm.facet === 'off' && !withheld.includes(d.facet)) withheld.push(d.facet);
            if (arm.facet === 'variant') given = given.map((f) => (f.ref === d.facet ? { ...f, body: fs.readFileSync(path.resolve(CWD, arm.variant), 'utf-8').replace(/^---[\s\S]*?---\n/, '') } : f));
            if (arm.order) given = arm.order === 'first' ? [...given.filter((f) => f.ref === d.facet), ...given.filter((f) => f.ref !== d.facet)] : [...given.filter((f) => f.ref !== d.facet), ...given.filter((f) => f.ref === d.facet)];
            if (arm.model) model = arm.model;
        }
        // the route adapted to this item: rules that guard a cause this agent keeps being sent back for
        for (const ref of adaptationFor(events(), item, step.id).facets) {
            const f = !given.some((x) => x.ref === ref) ? allFacets().find((x) => x.ref === ref) : null;
            if (f) given = [...given, f];
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
    // ---- adaptive orchestration: the route follows what the record shows while the item runs ----
    const loadoutRefs = (st) => (st.agent && st.phase && loadouts().roles?.[st.agent]?.phases?.[st.phase] ? (() => {
        const lo = loadoutPicks(loadouts(), st.agent, st.phase);
        return compose(resolvePicks(skills(), lo.picks).facets, { budget: lo.budget }).used.map((f) => f.ref);
    })() : []);
    const changedSinceOpen = (item) => {
        const base = baseOf(item);
        const git = (...a) => (spawnSync('git', a, { cwd: CWD, encoding: 'utf-8' }).stdout ?? '').split('\n').filter(Boolean);
        const all = new Set(hashesNow().keys());
        return [...new Set([...git('diff', '--name-only', base), ...git('ls-files', '--others', '--exclude-standard')])].filter((f) => all.has(f));
    };
    let adapted = false;
    const adaptNow = (item) => {
        if (adapted || project.adapt === false) return [];
        adapted = true;
        const state = itemState(events(), item);
        if (!state || state.closed) return [];
        const files = changedSinceOpen(item);
        let plan = null;
        if (files.length) {
            try {
                plan = planRoute(files, { graph: graphNow(), owners: project.owners ?? readJson(path.resolve(CWD, 'owners.json'), null), flow: flowDef, planning: { ...DEFAULT_PLANNING, ...(project.planning ?? {}) } });
            } catch {
                plan = null; // a plan that cannot be made changes nothing; the route stays as it is
            }
        }
        const found = adapt({ state, flow: flowDef, plan, events: events(), facets: allFacets(), loadoutOf: loadoutRefs, limits: { ...ADAPT, ...(project.adaptLimits ?? {}) } });
        for (const a of found) say({ kind: 'route.adapt', item, ...a });
        if (found.length) console.log(`the route of ${item} changed:\n${renderAdaptations(found)}\n`);
        return found;
    };
    const upcoming = (item) => {
        adaptNow(item);
        const state = itemState(events(), item);
        const n = next(state, { loadouts: loadouts(), flow: flowDef });
        if (n.action !== 'call') return n;
        const step = state.steps.find((s) => s.id === n.step);
        const picked = pickModel(step, state);
        const ad = adaptationFor(events(), item, n.step);
        const ladder = flowDef.ladder ?? [];
        if (ad.model && ladder.indexOf(ad.model) > ladder.indexOf(picked.model)) return { ...n, model: ad.model, routed: `adapted: ${ad.why.at(-1)}` };
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
            const withheld = drawWithholding(item, steps);
            say({ kind: 'item.open', item, tier: opt('tier', known.tier ?? 'normal'), version: known.version, class: known.class, difficulty: known.difficulty, steps, rerun: flowDef.rework?.rerun ?? [], base, withheld: withheld ?? undefined });
            if (withheld) console.log(`this item goes without ${withheld.ref} (seeded draw, p=${withheld.p}); its backstop is enforced by the policy — nothing is announced to the agents`);
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
            say({ kind: 'step.start', item, step: stepId, agent: step.agent, run: opt('run') ?? process.env.FACET_RUN ?? undefined, mode: step.mode, model: opt('model', rules.model ?? model ?? undefined), rework: step.rework || undefined, assist: opt('assist'), forced: n.step !== stepId || undefined, facets: rules.facets.length ? rules.facets : undefined, withheld: rules.withheld.length ? rules.withheld : undefined, lessons: rules.lessons?.length ? rules.lessons : undefined, experiments: rules.experiments.length ? rules.experiments : undefined });
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
            // the handoff is checked while its author is still in the room, not an hour later by the inspector
            const tname = TEMPLATE_OF[stepId];
            const hfile = tname ? path.join(work, item, `${tname}.md`) : null;
            if (status === 'DONE' && hfile && project.handoffCheck !== false) {
                const tpl = findTemplate([project.templates && path.resolve(CWD, project.templates), path.join(CWD, '.facet', 'templates'), KIT && path.join(KIT, 'templates')], tname);
                if (tpl && fs.existsSync(hfile)) {
                    // files the step may not have listed: only for steps that change the product
                    const changed = ['build', 'ops', 'red', 'spec', 'probe'].includes(stepId) ? workingChanges(CWD).filter((f) => !f.startsWith(path.relative(CWD, work)) && !f.startsWith(path.relative(CWD, journal))) : null;
                    const problems = checkHandoff(fs.readFileSync(hfile, 'utf-8'), tpl, { root: CWD, changed });
                    say({ kind: 'evidence', item, name: 'handoff', ok: blocking(problems).length === 0, value: blocking(problems).length, step: stepId, detail: blocking(problems).slice(0, 4).map((p) => `${p.kind} ${p.what}`).join('; ') || undefined });
                    if (blocking(problems).length && !flag('force')) fail(`${renderHandoff(path.relative(CWD, hfile), problems)}\n\nflow end: the step is not DONE until its handoff is whole. Give these lines to ${step.agent ?? 'the step'} and end the step again (or --force, which is recorded).`, 1);
                    if (problems.length) console.log(renderHandoff(path.relative(CWD, hfile), problems));
                } else if (tpl && !fs.existsSync(hfile) && step.agent) console.log(`note: ${path.relative(CWD, hfile)} does not exist — the next agent has no handoff from ${step.agent}`);
            }
            if (status === 'DONE' && step.agent && !opt('tokens')) console.log('note: no --tokens given — the cost of this step will be unknown (copy the total the agent call reported)');
            say({ kind: 'step.end', item, step: stepId, agent: step.agent, status, tokens: opt('tokens') ? Number(opt('tokens')) : undefined, for: opt('for'), question: opt('question'), forced: status === 'DONE' && flag('force') ? true : undefined });
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
            const ad = adaptationsOf(events(), item);
            console.log(`${item} · tier ${state.tier} · rework cycles ${state.cycles}${state.verdict ? ` · last verdict ${state.verdict}` : ''}\n${statusLines(state).join('\n')}${ad.length ? `\nadapted while it ran:\n${renderAdaptations(ad)}` : ''}`);
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
                for (const m of moved) console.log(`journal: set aside line ${m.line} of ${m.segment} in ${m.to} — look at it before deleting it`);
                return void console.log(moved.length ? `${moved.length} line(s) set aside; the journal is one whole chain again` : 'nothing to repair: no torn and no fenced line');
            }
            if (positional[0] === 'unlock') {
                // a person's decision: the owner of the lock is alive but stuck. The epoch is raised, so whatever it still writes is set aside.
                const owner = forceUnlock(journal);
                return void console.log(owner ? `journal: lock of pid ${owner.pid ?? '?'} on ${owner.host ?? '?'} removed; the epoch is now ${epochOf(journal)} — anything that process still appends will be fenced` : 'journal: no lock to remove');
            }
            const v = verifyJournal(journal, { keys: eventVerifiers(trustNow()) });
            const ev = events();
            for (const f of v.fenced.filter((x) => !x.unlocked)) console.log(`journal: ${f.segment} line ${f.line} is set aside (${f.why}) — facet journal repair moves it out of the segment`);
            if (v.signatures.bad) console.error(`journal: ${v.signatures.bad} event(s) carry a signature that does not verify`);
            for (const b of v.broken) console.error(`journal: ${b.segment} line ${b.line} does not follow the line before it — the history was edited`);
            for (const x of v.structure) console.error(`journal: ${x.segment} line ${x.line}: ${x.problem}`);
            for (const c of v.conflicts) console.error(`journal: ${c.item} was opened by ${c.loser} while ${c.winner} held it — ${c.loser} must run: facet flow yield --item ${c.item}`);
            if (v.broken.length || v.structure.length || v.conflicts.length || v.signatures.bad) process.exit(1);
            if (!v.segments) return void console.log('journal: nothing recorded yet');
            console.log(`journal ${v.status}: ${v.events} events${v.segments > 1 || me ? ` in ${v.segments} segment(s)` : ''}, ${openItems(ev).length} open, ${closedItems(ev).length} closed${v.epoch ? ` · epoch ${v.epoch}` : ''}${v.signatures.signed ? ` · ${v.signatures.signed} signed by trusted keys` : ''}${v.signatures.unknown ? ` · ${v.signatures.unknown} signed by keys this project does not trust` : ''}`);
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
                let receipt;
                if (cmd) {
                    const r = await run(['sh', '-c', cmd.replaceAll('{item}', item)], { cwd: CWD, timeoutSec: Number(opt('timeout', 600)), ledger: path.join(work, item, 'ledger.jsonl'), logDir: path.join(work, item, 'logs') });
                    ok = r.exit === 0;
                    value = `exit ${r.exit}`;
                    // what exactly was run and what it printed, so that a second party can compare its own run with this one
                    receipt = { cmd: sha256(cmd, 16), exit: r.exit, log: r.log && fs.existsSync(r.log) ? sha256(fs.readFileSync(r.log), 16) : null };
                } else if (ext) ({ ok, value } = await ext.checks[name]({ cwd: CWD, item, events: events() }));
                else fail(`check: unknown check "${name}" (known: ${checkNames().join(', ')})`);
                say({ kind: 'evidence', item, name, ok: !!ok, value, receipt, ...bound(item, name) });
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
        async proof() {
            const sub = positional[0] ?? 'status';
            if (sub === 'verify' && opt('bundle')) { // needs nothing but the file: no project, no settings, no trust in its maker
                const v = verifyBundle(JSON.parse(fs.readFileSync(path.resolve(CWD, opt('bundle')), 'utf-8')), { root: opt('root') ? path.resolve(CWD, opt('root')) : null, trust: fs.existsSync(path.join(CWD, '.facet', 'trust.json')) ? trustNow() : null });
                console.log(renderBundle(v));
                return void (v.status === 'VALID' || process.exit(1));
            }
            const item = opt('item') ?? positional[1] ?? openItems(events(), me)[0] ?? closedItems(events()).at(-1);
            if (!item) fail('proof: no item (facet proof create|verify|status --item ID)');
            const options = { policy: policy(), checks: checkNames(), project: projectFacts(), ignore: sourceIgnore(), include: inputs(), scopes: scopesFor(evidenceNames(item)), trust: trustNow(), requireSignature: !!govern.requireSignature, benchmark: kitBenchmark() };
            const file = proofPath(work, item);
            if (sub === 'decay') {
                const d = decay(events(), item, { hashes: hashesNow(), scopes: options.scopes ?? {}, snapshotOf: (src) => readJson(snapshotFile(item, src), null) });
                console.log(`${item}: trust in the recorded proofs, on the sources as they are now\n${renderDecay(d)}`);
                if (flag('json')) console.log(JSON.stringify(d));
                return;
            }
            if (sub === 'create') {
                const m = createProof(CWD, events(), item, { ...options, environment: envNow(true), calibration: { benchmark: kitBenchmark(), guards: calibration(events()).map(({ guard, n, caught, low }) => ({ guard, n, caught, low })) } });
                const key = flag('no-sign') ? null : myKey();
                if (key) m.signatures.push(sign(key, m.digest));
                else if (govern.requireSignature) console.error('proof: no private key found (facet key new) — this project accepts only signed packs, so this one will read as UNSIGNED');
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, `${JSON.stringify(m, null, 2)}\n`);
                if (openItems(events()).includes(item)) say({ kind: 'proof.create', item, digest: m.digest, src: m.source.state, level: m.level });
                return void console.log(`${renderProof(m)}\nwritten: ${path.relative(CWD, file)}`);
            }
            if (!fs.existsSync(file)) fail(`proof: ${item} has no proof pack${fs.existsSync(path.join(work, item, 'attestation.json')) ? ' — it has an attestation from before 0.6, which is bound to no source state and proves nothing about these sources' : ''} — facet proof create --item ${item}`);
            const m = JSON.parse(fs.readFileSync(file, 'utf-8'));
            if (sub === 'export') {
                const files = isSegmented(journal) ? fs.readdirSync(journal, { recursive: true }).filter((f) => String(f).endsWith('.jsonl')).map(String).sort() : [path.basename(journal)];
                const segments = Object.fromEntries(files.map((f) => [f.split(path.sep).join('/'), fs.readFileSync(isSegmented(journal) ? path.join(journal, f) : journal, 'utf-8').split('\n').filter(Boolean)]));
                const out = path.resolve(CWD, opt('out', `${item}.proof.json`));
                fs.writeFileSync(out, `${JSON.stringify(exportProof(m, events(), { policy: policy(), checks: checkNames(), segments, facts: Object.fromEntries(Object.entries(projectFacts()).filter(([k]) => k !== 'journalIntact')) }))}\n`);
                return void console.log(`exported: ${path.relative(CWD, out)} — anyone can check it: facet proof verify --bundle ${path.relative(CWD, out)} [--root <their copy of the sources>]`);
            }
            if (sub === 'witness' || (sub === 'verify' && flag('rerun'))) {
                // an independent second measurement: the checks are run again here, by this run, and compared with what the pack recorded
                const names = checkNames().filter((n) => typeof (typeof govern.checks?.[n] === 'object' ? govern.checks[n].run : govern.checks?.[n]) === 'string');
                if (!names.length) fail('proof witness: no check with a command is configured (govern.checks) — there is nothing to run again');
                const dir = path.join(work, item, 'witness');
                const w = await witness(m, names, async (name) => {
                    const cmd = typeof govern.checks[name] === 'object' ? govern.checks[name].run : govern.checks[name];
                    const r = await run(['sh', '-c', cmd.replaceAll('{item}', item)], { cwd: CWD, timeoutSec: Number(opt('timeout', 600)), ledger: path.join(dir, 'ledger.jsonl'), logDir: path.join(dir, 'logs') });
                    return { ok: r.exit === 0 };
                }, { by: opt('by') ?? process.env.FACET_ACTOR ?? process.env.FACET_SESSION ?? me ?? null, source: sourceState(CWD, { ignore: sourceIgnore(), include: inputs() }).state, environment: envNow(true) });
                const key = myKey();
                if (key) w.signature = sign(key, sha256(JSON.stringify(w)));
                m.witnesses = [...(m.witnesses ?? []), w];
                say({ kind: 'proof.witness', item, checks: names.filter((n) => !w.notRun.includes(n)), differs: w.differs, sameSources: w.sameSources, by: w.by, env: w.env });
                fs.writeFileSync(file, `${JSON.stringify(m, null, 2)}\n`);
                console.log(`witness: ${w.reproduced}/${w.total} checks gave the recorded answer${w.sameSources ? '' : ' — on OTHER sources than the pack describes, so this says nothing about the pack'}${w.differs.length ? ` · differs: ${w.differs.join(', ')}` : ''}${w.notRun.length ? ` · could not run: ${w.notRun.join(', ')}` : ''}`);
            }
            const v = verifyProof(CWD, events(), m, { ...options, environment: envNow(true) });
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
            if (flag('trend')) {
                const all = [...earlier.map((f) => JSON.parse(fs.readFileSync(path.join(results, f), 'utf-8'))), report];
                for (const bad of all.filter((r) => reportProblems(r).length)) console.error(`benchmark: the stored report of ${bad.version ?? '?'} is malformed (${reportProblems(bad).join(', ')})`);
                return void console.log(trend(all.filter((r) => !reportProblems(r).length || r === report)).map((t) => `${t.version.padEnd(8)} ${String(t.passed).padStart(3)}/${t.total}${t.added.length ? `  +${t.added.length} new cases` : ''}${t.lost.length ? `  LOST: ${t.lost.join(', ')}` : ''}`).join('\n'));
            }
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
                    saveExperiment(CWD, newDesign({ id: positional[1], facet: facet.ref, seed: opt('seed'), ...(arms ? { arms } : {}), primary: opt('primary', 'clean'), minPerArm: Number(opt('min', 30)), confirms: opt('confirms') ?? null, ...(opt('strata') ? { strata: list(opt('strata')) } : {}) }));
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
            if (sub === 'export') {
                const ev = events();
                const facets = allFacets();
                const langs = [...new Set(graphNow().files.map((f) => path.extname(f)))].sort();
                const pack = exportKnowledge({ project: path.basename(CWD) + (readJson(path.resolve(CWD, 'package.json'), {}).name ?? ''), diagnoses: diagnose(exposures(ev, { ledgerOf, facets }), facets), cf: cfReport(ev), hypotheses: judgedHypotheses(), lessons, version: kitVersion(),
                    context: { languages: langs, files: graphNow().files.length, items: closedItems(ev).length, models: [...new Set(ev.filter((e) => e.kind === 'step.start' && e.model).map((e) => e.model))].sort() } });
                const key = myKey();
                if (key) pack.signature = sign(key, pack.digest);
                const out = path.resolve(CWD, opt('out', 'knowledge.json'));
                fs.writeFileSync(out, `${JSON.stringify(pack, null, 1)}\n`);
                return void console.log(`knowledge pack written: ${path.relative(CWD, out)} — ${pack.facets.length} facet record(s), ${pack.lessons.length} lesson(s), ${pack.counterfactual.length} counterfactual summary(ies); no file names, no handoff text, no journal`);
            }
            if (sub === 'import') {
                const by = opt('by') ?? fail('learn import: --by NAME — taking lessons from elsewhere is a person\'s decision');
                const pack = JSON.parse(fs.readFileSync(path.resolve(CWD, positional[1] ?? fail('learn import <pack.json> --by NAME')), 'utf-8'));
                const fresh = importLessons(pack, lessons, { by, at: closedItems(events()).length });
                const dir = path.join(CWD, 'trials', 'imported');
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, `${pack.source}.json`), `${JSON.stringify(pack, null, 1)}\n`);
                saveLessons(CWD, [...lessons, ...fresh]);
                for (const l of fresh) say({ kind: 'learn', lesson: l.id, because: [], origin: pack.source, by });
                return void console.log(`${fresh.length} lesson(s) imported from ${pack.source.slice(0, 8)} at confidence ${IMPORT_START} — they stay only while they prove themselves here (facet learn)\npack kept in trials/imported/ for: facet learn pool`);
            }
            if (sub === 'pool') {
                const dir = path.join(CWD, 'trials', 'imported');
                const packs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))) : [];
                return void console.log(packs.length ? renderPool(pool(packs)) : 'no packs: facet learn import <pack.json> --by NAME');
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
        /** explain --for dev|lead|client|auditor [--html FILE]: the record told to the person who acts on it. */
        explain() {
            const who = opt('for', positional[0] ?? 'dev');
            if (!AUDIENCES[who]) fail(`explain: --for one of ${Object.keys(AUDIENCES).join(', ')}`);
            const titles = Object.fromEntries(Object.entries(routing()).map(([k, v]) => [k, v.title ?? null]));
            const open = openItems(events(), me)[0];
            const r = explain(events(), who, { titles, policy: policy(), checks: checkNames(), project: projectFacts(), cost: who === 'lead' ? costReport(usage(), events(), { prices: project.prices ?? {} }) : null, next: open ? describe(upcoming(open)) : null });
            if (opt('html')) {
                const out = path.resolve(CWD, opt('html'));
                fs.mkdirSync(path.dirname(out), { recursive: true });
                fs.writeFileSync(out, explainHtml(r.text, { title: `${project.title ?? path.basename(CWD)} — for the ${AUDIENCES[who]}` }));
                return void console.log(`written for the ${AUDIENCES[who]}: ${path.relative(CWD, out)}`);
            }
            console.log(r.text);
        },
        /** fitness [--accept]: architecture rules on the import graph, as a ratchet against today's state. */
        fitness() {
            const rules = project.fitness ?? readJson(path.resolve(CWD, opt('rules', 'fitness.json')), null);
            if (!rules?.length) fail('fitness: no rules — add "fitness": [{ "id": "…", "kind": "no-import", "from": "src/**", "to": "server/**" }, …] to facet.json (kinds: no-import, layers, no-cycle, max-lines, max-fan-in, tested)');
            const file = path.resolve(CWD, project.fitnessBaseline ?? '.facet/fitness-baseline.json');
            const baseline = readJson(file, { keys: [] }).keys ?? [];
            const r = checkFitness(rules, { graph: graphNow(), root: CWD, isTest, baseline });
            console.log(renderFitness(r));
            if (flag('accept')) {
                if (r.fresh.length && !flag('force')) fail('fitness --accept: new violations are not accepted silently — fix them, or add --force and say why in the commit');
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), keys: r.keys }, null, 1)}\n`);
                console.log(`baseline written: ${r.keys.length} known violation(s) in ${path.relative(CWD, file)}`);
            }
            evidence('fitness', r.fresh.length === 0, r.fresh.length, r.fresh.slice(0, 3).map((v) => v.what).join('; ') || undefined);
            if (r.fresh.length) process.exit(1);
        },
        /** handoff check <step|file>: the handoff against its template, its anchors and the files the step changed. */
        handoff() {
            const item = theItem(false) ?? opt('item');
            const arg = positional[1];
            if (positional[0] !== 'check' || !arg) fail('handoff: facet handoff check <step | file> [--item ID]');
            const tname = TEMPLATE_OF[arg] ?? path.basename(arg, '.md');
            const file = TEMPLATE_OF[arg] ? path.join(work, item ?? fail('handoff check: no open item; pass --item'), `${tname}.md`) : path.resolve(CWD, arg);
            const tpl = findTemplate([project.templates && path.resolve(CWD, project.templates), path.join(CWD, '.facet', 'templates'), KIT && path.join(KIT, 'templates')], opt('template', tname));
            if (!tpl) fail(`handoff: no template "${tname}" (looked in facet.json → templates, .facet/templates and the kit)`);
            if (!fs.existsSync(file)) fail(`handoff: ${path.relative(CWD, file)} does not exist`);
            const problems = checkHandoff(fs.readFileSync(file, 'utf-8'), tpl, { root: CWD, changed: flag('changed') ? workingChanges(CWD) : null });
            console.log(renderHandoff(path.relative(CWD, file), problems));
            if (blocking(problems).length) process.exit(1);
        },
        /** cf: counterfactual replay — a finished step re-run from its snapshot with and without one rule. */
        cf() {
            const sub = positional[0] ?? 'report';
            const facet = opt('facet');
            if (sub === 'report') return void console.log(renderCf(cfReport(events(), facet ?? null, { minPairs: Number(opt('min', 5)) })));
            if (!facet) fail('cf: --facet skill:facet');
            const f = allFacets().find((x) => x.ref === facet) ?? fail(`cf: unknown facet ${facet}`);
            if (f.withhold === 'no') fail(`cf: ${facet} is "ablatable: no" — not even a replay goes without it`);
            if (sub === 'candidates') {
                const c = candidates(events(), facet);
                return void console.log(c.length ? `${c.length} finished step(s) had ${facet} and a snapshot:\n${c.map((x) => `  ${x.item}/${x.step} ${x.agent} on ${x.model ?? '?'}`).join('\n')}\nfor each: facet cf setup --item I --step S --facet ${facet} --arm with|without` : `no snapshotted step had ${facet}: snapshots are taken at step start when facet.json → eval.snapshot names the step`);
            }
            const [item, step, arm] = [opt('item'), opt('step'), opt('arm')];
            if (!item || !step || !['with', 'without'].includes(arm)) fail(`cf ${sub}: --item I --step S --facet F --arm with|without`);
            const start = events().find((e) => e.kind === 'step.start' && e.item === item && e.step === step);
            const model = opt('model', start?.model ?? 'same');
            if (sub === 'setup') {
                const r = replaySetup(CWD, { item, step, model: `${model}-${arm}-${facet.replace(/[^a-z0-9]+/gi, '-')}`, workDir: work, workName: path.relative(CWD, work) });
                if (!r.ok) fail(`cf setup: ${r.reason}`);
                const s = itemState(events(), item)?.steps.find((x) => x.id === step);
                const lo = loadoutPicks(loadouts(), s.agent, s.phase);
                const full = renderLoadout(compose(resolvePicks(skills(), lo.picks).facets.concat(lo.picks.includes(facet) ? [] : [f]), { budget: lo.budget }), { role: s.agent, phase: s.phase });
                const rules = writeRules(path.join(r.dir, path.relative(CWD, work)), item, step, armRules(full, facet, arm));
                return void console.log(`replay ready: ${path.relative(CWD, r.dir)}\nrules (${arm} ${facet}): ${path.relative(CWD, rules)}\nRun ${s.agent} there on ${model} with the instruction of the original step and this rules file. Then:\n  facet cf judge --item ${item} --step ${step} --facet ${facet} --arm ${arm} --dir ${path.relative(CWD, r.dir)}`);
            }
            if (sub === 'judge') {
                const checks = project.eval?.checks ?? Object.fromEntries(Object.entries(govern.checks ?? {}).map(([k, v]) => [k, typeof v === 'object' ? v.run : v]));
                if (!Object.keys(checks).length) fail('cf judge: no checks configured (eval.checks or govern.checks)');
                const r = judge(path.resolve(CWD, opt('dir') ?? fail('cf judge: --dir <replay worktree>')), checks);
                say({ kind: 'cf', item, step, facet, arm, model, agent: start?.agent, passed: r.passed, total: r.total, results: r.results });
                return void console.log(`${item}/${step} ${arm} ${facet}: ${r.passed}/${r.total} checks passed${cfReport(events(), facet)[0] ? `\n${renderCf(cfReport(events(), facet))}` : ''}`);
            }
            fail('cf: candidates | setup | judge | report');
        },
        /** key new|trust|list: who may vouch for records in this project. */
        key() {
            const sub = positional[0] ?? 'list';
            if (sub === 'new') {
                const k = newKey();
                const file = saveKey(k);
                return void console.log(`key ${k.id} written to ${file} (keep it private; it never belongs in a repository)\npublic key: ${k.pub}\nto let this project trust it: facet key trust ${k.pub} --name "<who>" --role writer|witness|releaser`);
            }
            if (sub === 'trust') {
                const pub = positional[1] ?? myKey()?.pub ?? fail('key trust: facet key trust <public key> --name NAME --role writer|witness|releaser');
                if (!['writer', 'witness', 'releaser'].includes(opt('role', 'writer'))) fail('key trust: --role writer|witness|releaser');
                const e = addTrust(CWD, { pub, name: opt('name') ?? fail('key trust: --name — a key is trusted as somebody'), role: opt('role', 'writer') });
                return void console.log(`trusted: ${e.id} as ${e.name} (${e.role}) in ${path.relative(CWD, trustFile(CWD))} — commit it; a change of this file is a change of who may vouch`);
            }
            const t = trustNow();
            const mine = myKey();
            console.log([`this machine signs with: ${mine ? mine.id : 'no key (facet key new)'}`, ...t.keys.map((k) => `  ${k.id}  ${k.name.padEnd(20)} ${k.role.padEnd(9)} added ${k.added.slice(0, 10)}${mine?.id === k.id ? '  ← this machine' : ''}`), ...t.forged.map((id) => `  ${id}  DROPPED: its id does not match its public key`)].join('\n'));
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
