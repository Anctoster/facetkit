#!/usr/bin/env node
// facet — one command for agents: compose skill loadouts and use the bounded tools.
//
//   facet list                                       skills and facets with their word cost
//   facet compose --role R [--phase P]               the loadout of a role (from the loadouts file)
//   facet compose --take skill:facet,skill           an ad-hoc mix; --budget N words
//   facet audit [--prior DIR]... [--report FILE]     structure, uniqueness, optimality
//   facet run [--item ID] [--timeout S] -- CMD...    run a command, get a digest, log the rest
//   facet read FILE:START-END [--item ID]            a bounded excerpt with line numbers
//   facet ledger [--item ID]                         what the item has cost so far; exit 3 over a cap
//   facet capsule seal|verify HANDOFF.md             hash-anchored references
//   facet mutate --files a,b --test "CMD"            mutation probe (false-positive detector)
//   facet seams [--changed a,b | --ref HEAD]         neighbours of a slice in the import graph
//   facet receipt add|check|list ...                 documentation receipts
//   facet ui URL [--budget k=v,...]                  browser evidence digest
//   facet ci-verify [--min-level L2] [--post-pr]     one CI run against a change (the GitHub Action)
//   facet trace --spec a.md --tests dir,file [--plan] specification clauses ↔ tests that claim them
//   facet render --dir DIR [--check]                 every role/phase loadout as a file (for agents without a shell)
//   facet flow open|next|start|end|verdict|answer|close|status|resume    orchestration from the journal
//   facet note "done …; next …"                      a checkpoint in the running step
//   facet mem add|recall|list|retire                 memory tied to territory, anchored and earned
//   facet cost import TRANSCRIPT… | report           where the tokens went
//   facet eval matrix|compare|snapshot|replay|judge  agents × models, from real work and replays
//   facet retro report|signal|adopt|hindsight        beliefs, proposals, late evidence
//   facet plan [next] [--write FILE]                 sessions and forecast
//   facet timeline [--item ID] · facet journal       what happened; is the history intact
//   facet scan · check · assure · waive · approve · attest · trust · canary    evidence, policy, trust
//   facet atlas card|find|path|hotspots|coupling     the code, without reading it
//   facet board [--out FILE]                         the whole system on one page
//   facet skill report|coverage|modes                which rules work, why, and what to do about each
//   facet intel design|start|stop|report|size        controlled trials of a facet: presence, wording, model, position
//   facet evolve scan|list|test|adopt|reject         recurring mistakes → diagnosed rules → tested changes → a person's decision
//   facet hypo new|list · learn [apply --by N|retire ID]      predictions the journal can refute; what was learned from them
//   facet trustgraph [--item ID] · heal [scan|apply|undo KEY]  who and what a result rests on; own weak points and their repair
//   facet economy [--role AGENT --phase PHASE --risk R]       what each rule, agent and check costs and returns
//   facet route [files…] [--task "…"] [--item ID --apply]   owners, reach, risk and the route, before the work
//   facet proof create|verify|status|decay · check --stale   what a result is proven for; what a change sends back
//   facet owners · experiment · benchmark · journal repair
//   facet init [--minimal] [--claude] · facet demo · facet hypotheses [--write FILE]
//   facet explain --for dev|lead|client|auditor [--lang en|pl|ru] [--html FILE] · facet fitness [--accept] · facet handoff check STEP
//   facet qa plan|bug|charter|readiness · facet decide new|check|list
//   facet cf candidates|setup|judge|report · facet learn export|import|pool · facet key new|trust|list · facet proof witness
//
// Configuration (optional) in the project's package.json:
//   "facetkit": { "skills": ["docs/agents/skills"], "loadouts": "docs/agents/loadouts.json", "work": ".work", "dirs": ["src","server","tests"] }
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { audit, loadPrior, renderAudit } from '../lib/audit.mjs';
import { seal, verify } from '../lib/capsule.mjs';
import { compose, loadSkills, loadoutPicks, renderLoadout, resolvePicks } from '../lib/facets.mjs';
import { probe } from '../lib/mutaprobe.mjs';
import { addReceipt, checkReceipt, installedVersion, listReceipts } from '../lib/receipts.mjs';
import { buildGraph, neighbours } from '../lib/seams.mjs';
import { renderTrace, trace } from '../lib/trace.mjs';
import { opsCommands } from './ops.mjs';
import { setupCommands } from './setup.mjs';
import { EXIT_CAP, excerpt, ledgerStatus, readLedger, run } from '../lib/thrift.mjs';
import { safeEnv } from '../lib/shell.mjs';
import { ciVerify } from '../lib/ci-verify.mjs';
import { resolveItemId } from '../lib/github-context.mjs';
import { postPrComment, renderPrReport } from '../lib/explain-pr.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CWD = process.cwd();
const argv = process.argv.slice(2);
const split = argv.indexOf('--');
const own = split < 0 ? argv : argv.slice(0, split);
const rest = split < 0 ? [] : argv.slice(split + 1);
const [command, ...positional] = own.filter((a, i) => !a.startsWith('--') && !(own[i - 1]?.startsWith('--') && !['--json', '--verbose', '--plan', '--check', '--force', '--record', '--snapshot', '--no-atlas', '--no-history', '--neighbours', '--minimal', '--claude', '--rerun', '--no-sign', '--accept', '--provisional', '--all', '--post-pr', '--github'].includes(own[i - 1])));
const flag = (name) => own.includes(`--${name}`);
const opt = (name, fallback) => (own.includes(`--${name}`) ? own[own.indexOf(`--${name}`) + 1] : fallback);
const opts = (name) => own.flatMap((a, i) => (a === `--${name}` ? [own[i + 1]] : []));
const list = (value) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []);
const fail = (message, code = 1) => {
    console.error(message);
    process.exit(code);
};

// configuration: facet.json (any kind of project), or the "facetkit" key of package.json
let project = {};
try {
    project = fs.existsSync(path.join(CWD, 'facet.json')) ? JSON.parse(fs.readFileSync(path.join(CWD, 'facet.json'), 'utf-8')) : (JSON.parse(fs.readFileSync(path.join(CWD, 'package.json'), 'utf-8')).facetkit ?? {});
} catch (error) {
    if (fs.existsSync(path.join(CWD, 'facet.json'))) fail(`facet.json: ${error.message}`, 2);
    // no package.json — defaults
}
const skillDirs = [path.join(KIT, 'skills'), ...(project.skills ?? []).map((d) => path.resolve(CWD, d)), ...opts('skills-dir').map((d) => path.resolve(CWD, d))];
const loadoutsFile = path.resolve(CWD, opt('loadouts', project.loadouts ?? path.join(KIT, 'loadouts.json')));
const work = path.resolve(CWD, opt('work', project.work ?? '.work'));
const item = opt('item', process.env.FACET_ITEM);
const itemDir = item ? path.join(work, item) : work;
const ledgerFile = opt('ledger', path.join(itemDir, 'ledger.jsonl'));
const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : fallback);
const caps = () => {
    const base = readJson(path.join(itemDir, 'caps.json'), project.caps ?? {});
    for (const k of ['minutes', 'runs', 'tokens']) if (opt(`max-${k}`)) base[k] = Number(opt(`max-${k}`));
    return base;
};

const commands = {
    list() {
        for (const skill of loadSkills(skillDirs)) {
            console.log(`${skill.name} — ${skill.meta.description ?? ''}`);
            for (const f of skill.facets) console.log(`  ${f.ref.padEnd(44)} ${String(f.words).padStart(4)} words  ${f.title}`);
        }
    },
    compose() {
        const skills = loadSkills(skillDirs);
        const role = opt('role');
        const phase = opt('phase');
        let picks = list(opt('take'));
        let budget = Number(opt('budget', 0));
        if (role) {
            const lo = loadoutPicks(readJson(loadoutsFile, {}), role, phase);
            picks = [...lo.picks, ...picks];
            budget ||= lo.budget;
        }
        if (!picks.length) fail('compose: give --role R [--phase P] and/or --take skill:facet,…');
        const { facets, unknown } = resolvePicks(skills, picks);
        if (unknown.length) fail(`compose: unknown ${unknown.join(', ')} (see: facet list)`);
        const result = compose(facets, { budget: budget || 900 });
        if (flag('json')) console.log(JSON.stringify({ ...result, used: result.used.map((f) => f.ref) }, null, 2));
        else process.stdout.write(renderLoadout(result, { role, phase }));
    },
    audit() {
        const priorDirs = opts('prior').map((d) => path.resolve(CWD, d));
        const result = audit(loadSkills(skillDirs), readJson(loadoutsFile, {}), { prior: loadPrior(priorDirs) });
        const text = renderAudit(result, { priorDirs });
        if (opt('report')) fs.writeFileSync(path.resolve(CWD, opt('report')), text);
        process.stdout.write(text);
        process.exit(result.errors.length ? 1 : 0);
    },
    async run() {
        if (!rest.length) fail('run: facet run [--item ID] -- <command>');
        const result = await run(rest, { cwd: CWD, env: safeEnv({ allow: project.govern?.env ?? [] }), timeoutSec: Number(opt('timeout', 300)), ledger: ledgerFile, logDir: path.join(itemDir, 'logs'), caps: caps(), maxRepeat: Number(opt('max-repeat', 3)) });
        console.log(result.text);
        if (opt('evidence')) evidence(opt('evidence'), result.exit === 0, `exit ${result.exit}`);
        process.exit(result.exit);
    },
    read() {
        const m = /^(.+?):(\d+)(?:-(\d+))?$/.exec(positional[0] ?? '');
        if (!m) fail('read: facet read path/to/file:START-END');
        const r = excerpt(path.resolve(CWD, m[1]), Number(m[2]), Number(m[3] ?? m[2]), { ledger: ledgerFile, max: Number(opt('max', 80)) });
        console.log(`${m[1]}:${r.from}-${r.to} of ${r.total}${r.cut ? ' (cut at the line limit)' : ''}\n${r.text}`);
    },
    ledger() {
        const status = ledgerStatus(readLedger(ledgerFile), caps());
        const t = status.totals;
        const cap = (k) => (status.caps[k] !== undefined ? ` / ${status.caps[k]}` : '');
        console.log(`runs ${t.runs}${cap('runs')} (${t.failures} failed) · minutes ${t.minutes}${cap('minutes')} · tokens shown ~${t.tokens}${cap('tokens')} · tokens kept out of context ~${t.saved}`);
        if (status.exceeded) fail(`BUDGET EXCEEDED: ${status.exceeded}. Stop and report.`, EXIT_CAP);
    },
    capsule() {
        const [mode, file] = positional;
        if (!['seal', 'verify'].includes(mode) || !file) fail('capsule: facet capsule seal|verify HANDOFF.md');
        const text = fs.readFileSync(path.resolve(CWD, file), 'utf-8');
        if (mode === 'seal') {
            const r = seal(text, CWD);
            fs.writeFileSync(path.resolve(CWD, file), r.text);
            console.log(`sealed ${r.sealed} anchor(s)${r.broken.length ? `; cannot seal: ${r.broken.join(', ')}` : ''}`);
            process.exit(r.broken.length ? 1 : 0);
        }
        const results = verify(text, CWD);
        const bad = results.filter((r) => r.state !== 'ok');
        console.log(`${results.length} anchor(s): ${results.length - bad.length} ok${bad.length ? `, ${bad.length} to re-read` : ''}`);
        for (const r of bad) console.log(`  ${r.state.padEnd(8)} ${r.ref}${r.to ? ` → ${r.to}` : ''}`);
        process.exit(bad.length ? 1 : 0);
    },
    mutate() {
        const files = list(opt('files'));
        const test = opt('test');
        if (!files.length || !test) fail('mutate: facet mutate --files a.ts,b.ts --test "npm test -- a" [--ref HEAD] [--max 12] [--allow 0]');
        const r = probe({ cwd: CWD, files, test, ref: opt('ref'), max: Number(opt('max', 12)), timeoutSec: Number(opt('timeout', 120)), maxMinutes: Number(opt('max-minutes', 10)), log: flag('verbose') ? console.log : undefined, equivalents: opt('equivalents') ? readJson(path.resolve(CWD, opt('equivalents')), []) : [], env: safeEnv({ allow: project.govern?.env ?? [] }) });
        if (r.baseline !== 'green') fail(`mutate: ${r.message}`, 2);
        console.log(`mutants: ${r.planned} of ${r.total} possible · detected ${r.killed} · survived ${r.survived.length} · equivalent (declared) ${r.equivalent.length} · invalid (did not load) ${r.invalid.length}${r.notRun ? ` · not executed ${r.notRun} (time limit)` : ''} · ${r.minutes} min`);
        for (const s of r.survived) console.log(`  SURVIVED ${s.file}:${s.line} [${s.op}]  ${s.before}  →  ${s.after}`);
        if (r.survived.length) console.log('A survivor means no test noticed that change: add the missing assertion, or note in one line why the mutant is equivalent.');
        if (opt('out')) fs.writeFileSync(path.resolve(CWD, opt('out')), JSON.stringify(r, null, 2));
        if (r.planned) evidence('mutate', r.survived.length <= Number(opt('allow', 0)), +(r.killed / r.planned).toFixed(2), `${r.killed}/${r.planned} killed`);
        process.exit(r.survived.length > Number(opt('allow', 0)) ? 1 : 0);
    },
    seams() {
        const dirs = list(opt('dirs')).length ? list(opt('dirs')) : (project.dirs ?? ['src', 'server', 'lib', 'tests', 'test', 'e2e']);
        let changed = list(opt('changed'));
        if (!changed.length) {
            const ref = opt('ref', 'HEAD');
            const tracked = spawnSync('git', ['diff', '--name-only', ref], { cwd: CWD, encoding: 'utf-8' }).stdout;
            const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: CWD, encoding: 'utf-8' }).stdout;
            changed = `${tracked}\n${untracked}`.split('\n').filter(Boolean);
        }
        const n = neighbours(buildGraph(CWD, dirs), changed, { depth: Number(opt('depth', 2)), own: list(opt('own')) });
        if (flag('json')) return void console.log(JSON.stringify(n, null, 2));
        const show = (label, items) => console.log(`${label} (${items.length})${items.length ? `: ${items.slice(0, 8).join(', ')}${items.length > 8 ? ', …' : ''}` : ''}`);
        show('slice', n.changed);
        show('consumers across the seam', n.consumers);
        show('providers across the seam', n.providers);
        show('neighbour tests to run', n.neighbourTests);
        show('consumers with no test at all', n.untestedConsumers);
    },
    receipt() {
        const dir = path.resolve(CWD, opt('dir', project.receipts ?? '.facet/receipts'));
        const [mode, topicArg] = positional;
        const topic = opt('topic', topicArg);
        if (mode === 'add') {
            const pkg = opt('package');
            const r = addReceipt(dir, { topic, url: opt('url'), version: opt('version', pkg ? (installedVersion(CWD, pkg) ?? '') : ''), facts: opts('fact'), ttlDays: Number(opt('ttl', 30)) });
            console.log(`receipt saved: ${r.topic} ${r.version} (${r.facts.length} fact(s), valid ${r.ttlDays} days)`);
        } else if (mode === 'check') {
            const pkg = opt('package');
            const r = checkReceipt(dir, topic, { installed: pkg ? installedVersion(CWD, pkg) : undefined });
            if (r.state === 'fresh') console.log(`fresh (${r.ageDays} d, ${r.receipt.version || 'no version'}) ${r.receipt.url}\n${r.receipt.facts.map((f) => `  - ${f}`).join('\n')}`);
            else console.log(`${r.state}${r.installed ? `: installed ${r.installed}, receipt ${r.receipt.version}` : ''} — read the primary source and run: facet receipt add`);
            process.exit(r.state === 'fresh' ? 0 : r.state === 'missing' ? 2 : 1);
        } else if (mode === 'list') for (const r of listReceipts(dir)) console.log(`${r.state.padEnd(6)} ${String(r.ageDays).padStart(3)} d  ${r.topic} ${r.version}  ${r.url}`);
        else fail('receipt: facet receipt add|check|list');
    },
    trace() {
        const spec = [...opts('spec').flatMap(list), ...list(project.spec?.join?.(',') ?? '')];
        const tests = list(opt('tests')).length ? list(opt('tests')) : (project.tests ?? ['tests', 'test', 'e2e', 'acceptance']);
        if (!spec.length) fail('trace: facet trace --spec SPEC.md[,more.md] [--tests dir,file] [--scope file,file] [--plan]');
        for (const f of spec) if (!fs.existsSync(path.resolve(CWD, f))) fail(`trace: no such specification file ${f}`, 2);
        const r = trace(CWD, { spec, tests, scope: list(opt('scope')).length ? list(opt('scope')) : undefined });
        if (flag('json')) console.log(JSON.stringify(r, null, 2));
        else console.log(renderTrace(r, { plan: flag('plan') }));
        if (!r.clauses.length) fail('trace: the specification has no numbered clauses (a line starting with an id such as "R1:")', 2);
        const bad = flag('plan') ? r.unplanned.length : r.uncovered.length + r.orphans.length + r.unplanned.length + (opt('scope') ? r.unclaimed.length : 0);
        if (!flag('plan')) evidence('trace', bad === 0, `${Object.keys(r.claims).length}/${r.clauses.length}`, r.uncovered.map((c) => c.id).join(',') || undefined);
        process.exit(bad ? 1 : 0);
    },
    render() {
        const dir = path.resolve(CWD, opt('dir', project.rendered ?? 'loadouts'));
        const skills = loadSkills(skillDirs);
        const config = readJson(loadoutsFile, {});
        const stale = [];
        const wanted = new Set();
        for (const [role, entry] of Object.entries(config.roles ?? {})) {
            for (const phase of Object.keys(entry.phases ?? {})) {
                const lo = loadoutPicks(config, role, phase);
                const { facets, unknown } = resolvePicks(skills, lo.picks);
                if (unknown.length) fail(`render: ${role}/${phase}: unknown ${unknown.join(', ')}`);
                const text = renderLoadout(compose(facets, { budget: lo.budget }), { role, phase, cli: opt('cli', project.cli ?? 'facet') });
                const name = `${role}.${phase}.md`;
                wanted.add(name);
                const file = path.join(dir, name);
                if (fs.existsSync(file) && fs.readFileSync(file, 'utf-8') === text) continue;
                stale.push(name);
                if (!flag('check')) {
                    fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(file, text);
                }
            }
        }
        const extra = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !wanted.has(f)) : [];
        if (flag('check')) {
            if (stale.length || extra.length) fail(`render --check: ${stale.length} stale (${stale.join(', ') || '—'}), ${extra.length} unknown (${extra.join(', ') || '—'}). Run: facet render --dir ${path.relative(CWD, dir) || '.'}`);
            console.log(`${wanted.size} loadout file(s) up to date`);
        } else console.log(`${wanted.size} loadout file(s) in ${path.relative(CWD, dir) || '.'} (${stale.length} written)${extra.length ? `; not in the loadouts file: ${extra.join(', ')}` : ''}`);
    },
    async ui() {
        const url = positional[0];
        if (!url) fail('ui: facet ui URL [--budget bytes=2500000,requests=40,lcp=2500,errors=0,rules=0]');
        const { parseBudgets, probeUrl } = await import('../lib/uiprobe.mjs');
        try {
            const r = await probeUrl(url, { devices: list(opt('devices', 'desktop,phone')), outDir: path.join(itemDir, 'ui'), budgets: parseBudgets(opt('budget')), screenshot: opt('screenshot') });
            console.log(r.text);
            evidence('ui', r.failures.length === 0, r.failures.length);
            process.exit(r.failures.length ? 1 : 0);
        } catch (error) {
            fail(`ui: ${error.message}`, error.code === 'NO_BROWSER' ? 2 : 1);
        }
    },
    /** ci-verify [--item ID] [--min-level L2] [--test-cmd CMD] [--base REF] [--out FILE] [--post-pr]: one CI run against a change. */
    async 'ci-verify'() {
        let r;
        try {
            r = ciVerify({ cwd: CWD, facetBin: fileURLToPath(import.meta.url), project, journal: path.resolve(CWD, opt('journal', project.journal ?? path.join(work, 'journal.jsonl'))), itemId: resolveItemId(item), minLevel: opt('min-level', 'L2'), testCmd: opt('test-cmd', ''), base: opt('base'), max: Number(opt('max', 10)), maxMinutes: Number(opt('max-minutes', 10)) });
        } catch (error) {
            fail(`ci-verify: ${error.message}`);
        }
        const out = opt('out', 'facetkit-report.json');
        fs.writeFileSync(path.resolve(CWD, out), `${JSON.stringify(r, null, 2)}\n`);
        const e = process.env;
        const runLine = e.GITHUB_RUN_ID ? `${e.GITHUB_WORKFLOW ?? 'workflow'} · run ${e.GITHUB_RUN_ID} · ${String(e.GITHUB_SHA ?? '').slice(0, 7)}` : null;
        const markdown = renderPrReport({ itemId: r.itemId, level: r.level, minLevel: r.minLevel, passed: r.passed, mode: r.mode, base: r.base, checks: r.checks, reportFile: out, run: runLine });
        console.log(markdown);
        if (e.GITHUB_STEP_SUMMARY) fs.appendFileSync(e.GITHUB_STEP_SUMMARY, `${markdown}\n`);
        if (e.GITHUB_OUTPUT) fs.appendFileSync(e.GITHUB_OUTPUT, `level=${r.level}\npassed=${r.passed}\n`);
        if (flag('post-pr')) {
            // a comment is a courtesy: a fork's read-only token must not turn a passing run red
            try {
                if (!(await postPrComment(markdown))) console.error('ci-verify: not a pull request, or no token — no comment written');
            } catch (error) {
                console.error(`ci-verify: the PR comment was not written: ${error.message}`);
            }
        }
        process.exit(r.passed ? 0 : 1);
    },
};

// extensions: modules that add checks, policy rules, a model router or commands
const extensions = [];
for (const spec of project.extensions ?? []) {
    // a path (relative or absolute) as a file URL: on Windows import() refuses a bare D:\… path
    const mod = await import(spec.startsWith('.') || path.isAbsolute(spec) ? pathToFileURL(path.resolve(CWD, spec)).href : spec);
    extensions.push(mod.default ?? mod);
}
const ops = opsCommands({ CWD, KIT, project, opt, opts, flag, list, fail, positional, work, readJson, loadoutsFile, extensions, skills: () => loadSkills(skillDirs) });
const { evidence, ...opsRest } = ops;
Object.assign(commands, opsRest, setupCommands({ CWD, KIT, opt, flag, fail, skills: () => loadSkills(skillDirs) }), ...extensions.map((x) => x.commands ?? {}));

// every use of a tool inside an item leaves a line in its ledger: that is how adherence to a rule is seen
if (item && command && !['flow', 'run', 'ledger', 'ci-verify'].includes(command)) { // ci-verify is a CI run, not an agent's use of a tool
    fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
    fs.appendFileSync(ledgerFile, `${JSON.stringify({ at: new Date().toISOString(), kind: 'tool', cmd: [command, positional[0]].filter(Boolean).join(' ') })}\n`);
}

if (!command || !commands[command]) fail(`facet: unknown command "${command ?? ''}". Commands: ${Object.keys(commands).join(', ')}`, 2);
await commands[command]();
