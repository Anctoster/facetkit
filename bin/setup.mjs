// Commands that set a project up or show the kit off: init, demo, hypotheses.
import fs from 'node:fs';
import path from 'node:path';
import { boardData, renderBoard } from '../lib/board.mjs';
import { costReport } from '../lib/cost.mjs';
import { demoEvents, demoItems } from '../lib/demo.mjs';
import { DEFAULT_FLOW } from '../lib/flow.mjs';
import { matrix, observations } from '../lib/evalx.mjs';
import { beliefs, signals } from '../lib/retro.mjs';
import { plan } from '../lib/schedule.mjs';
import { coverage, diagnose, exposures } from '../lib/skillint.mjs';

export function setupCommands({ CWD, KIT, opt, flag, fail, skills }) {
    const copy = (from, to, done) => {
        if (fs.existsSync(to)) return void done.kept.push(path.relative(CWD, to));
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
        done.written.push(path.relative(CWD, to));
    };
    const write = (to, text, done) => {
        if (fs.existsSync(to)) return void done.kept.push(path.relative(CWD, to));
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.writeFileSync(to, text);
        done.written.push(path.relative(CWD, to));
    };
    /** The default flow cut down to the chosen agents, in its order; steps without an agent (a manual commit) stay. */
    const flowFor = (agents) => ({
        ...DEFAULT_FLOW,
        steps: DEFAULT_FLOW.steps.filter((s) => (s.agent ? agents.includes(s.agent) : !!s.manual)).map(({ optional, ...s }) => s),
        rework: { ...DEFAULT_FLOW.rework, rerun: DEFAULT_FLOW.rework.rerun.filter((id) => DEFAULT_FLOW.steps.some((s) => s.id === id && (!s.agent || agents.includes(s.agent)) && !s.gates)) },
        tiers: Object.fromEntries(Object.entries(DEFAULT_FLOW.tiers ?? {}).map(([t, roles]) => [t, Object.fromEntries(Object.entries(roles).filter(([a]) => agents.includes(a)))]).filter(([, roles]) => Object.keys(roles).length)),
    });
    const version = JSON.parse(fs.readFileSync(path.join(KIT, 'package.json'), 'utf-8')).version;
    const has = (f) => fs.existsSync(path.join(CWD, f));
    /** A pull-request workflow for the Action, with the toolchain of the project it is written into. */
    const githubWorkflow = () => {
        const toolchain = [];
        if (has('package.json')) toolchain.push('      - uses: actions/setup-node@v4', '        with:', '          node-version: 22', `      - run: ${has('pnpm-lock.yaml') ? 'corepack enable && pnpm install --frozen-lockfile' : has('yarn.lock') ? 'corepack enable && yarn install --immutable' : has('package-lock.json') ? 'npm ci' : 'npm install'}`);
        if (['pyproject.toml', 'requirements.txt', 'setup.cfg'].some(has)) toolchain.push('      - uses: actions/setup-python@v5', '        with:', "          python-version: '3.12'", `      - run: ${has('requirements.txt') ? 'pip install -r requirements.txt pytest' : 'pip install -e . pytest'}`);
        if (has('go.mod')) toolchain.push('      - uses: actions/setup-go@v5', '        with:', '          go-version-file: go.mod');
        if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) toolchain.push('      - uses: actions/setup-java@v4', '        with:', '          distribution: temurin', "          java-version: '21'");
        return [
            '# FacetKit on every pull request: scan the change, run the tests, probe the changed lines with mutants,',
            '# and keep one comment on the PR up to date. Guide: https://github.com/Anctoster/facetkit/blob/main/docs/github-integration.md',
            'name: facetkit',
            'on:',
            '  pull_request:',
            'permissions:',
            '  contents: read',
            '  pull-requests: write   # the PR comment; without it the report is still in the job summary',
            'jobs:',
            '  assurance:',
            '    runs-on: ubuntu-latest',
            '    steps:',
            '      - uses: actions/checkout@v4',
            '        with:',
            '          fetch-depth: 0   # the change is measured from the merge base: a shallow clone has none',
            ...(toolchain.length ? ['      # your toolchain, so that the tests can run (written from the files this project has; adjust it)', ...toolchain] : ['      # set up your toolchain and install dependencies here, so that the tests can run']),
            `      - uses: Anctoster/facetkit@v${version}   # pin a release (or a commit SHA), not a branch`,
            '        with:',
            '          min-level: L2   # L1 clean scan · L2 tests pass · L3 mutants of the changed code are noticed',
            '          # test-command: npm test   # when the guess from your project files is wrong',
            '',
        ].join('\n');
    };
    return {
        /** Scaffolds a project: configuration, an items file, team rules and handoff templates; with --claude also agents and commands.
         *  --agents a,b builds the flow from those agents only; --github writes a workflow that runs the GitHub Action
         *  (alone, it writes nothing else: the Action needs no configuration). */
        init() {
            const done = { written: [], kept: [] };
            const minimal = flag('minimal');
            const picked = !flag('agents') ? null : String(opt('agents') ?? '').split(',').map((a) => a.trim()).filter(Boolean);
            const githubOnly = flag('github') && !minimal && !picked && !flag('claude');
            const known = fs.readdirSync(path.join(KIT, 'agents')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort();
            let customFlow = null;
            if (picked) {
                if (minimal) fail('init: --minimal and --agents choose the team in two ways — use one of them');
                const unknown = picked.filter((a) => !known.includes(a));
                if (!picked.length || unknown.length) fail(`init --agents: ${unknown.length ? `unknown agent(s) ${unknown.join(', ')}` : 'no agent given'} — choose from: ${known.join(', ')}`);
                customFlow = flowFor(picked);
                if (!customFlow.steps.some((s) => s.agent)) fail(`init --agents: none of ${picked.join(', ')} has a step in the flow — choose from the agents that work on an item: ${[...new Set(DEFAULT_FLOW.steps.map((s) => s.agent).filter(Boolean))].join(', ')}`);
            }
            if (!githubOnly) {
                const dirs = ['src', 'lib', 'app', 'server', 'pkg', 'cmd', 'internal', 'tests', 'test'].filter((d) => fs.existsSync(path.join(CWD, d)));
                const judged = !customFlow || customFlow.steps.some((s) => s.verdict);
                const config = { journal: '.facet/journal', memory: '.facet/memory', routing: 'facet.items.json', ...(minimal || customFlow ? { flow: '.facet/flow.json' } : {}), dirs: dirs.length ? dirs : ['src', 'tests'], govern: { required: judged ? 1 : 0, attestations: '.facet/attest', checks: {} }, skillint: { requireCause: true, ablate: { rate: 0 } } };
                write(path.join(CWD, 'facet.json'), `${JSON.stringify(config, null, 2)}\n`, done);
                const route = picked ?? (minimal ? ['spec-falsifier', 'slice-builder', 'proof-inspector'] : ['context-cartographer', 'spec-falsifier', 'red-first-specifier', 'slice-builder', 'proof-inspector']);
                write(path.join(CWD, 'facet.items.json'), `${JSON.stringify({ items: { 'ITEM-1': { version: 'v1', deps: [], tier: 'normal', route, gates: [], title: 'Replace this with your first piece of work' } } }, null, 2)}\n`, done);
                if (minimal) copy(path.join(KIT, 'presets', 'minimal.flow.json'), path.join(CWD, '.facet', 'flow.json'), done);
                if (customFlow) write(path.join(CWD, '.facet', 'flow.json'), `${JSON.stringify(customFlow, null, 2)}\n`, done);
                copy(path.join(KIT, 'templates', 'RULES.md'), path.join(CWD, '.facet', 'RULES.md'), done);
                for (const f of fs.readdirSync(path.join(KIT, 'templates')).filter((x) => x !== 'RULES.md')) copy(path.join(KIT, 'templates', f), path.join(CWD, '.facet', 'templates', f), done);
                if (flag('claude')) {
                    for (const f of fs.readdirSync(path.join(KIT, 'agents')).filter((x) => !picked || picked.includes(x.replace(/\.md$/, '')))) copy(path.join(KIT, 'agents', f), path.join(CWD, '.claude', 'agents', f), done);
                    for (const f of fs.readdirSync(path.join(KIT, 'commands'))) copy(path.join(KIT, 'commands', f), path.join(CWD, '.claude', 'commands', f), done);
                }
                if (customFlow && !judged) console.log('note: without proof-inspector nothing judges the work — items close at L0 (govern.required is 0). Add proof-inspector to reach L1 and above.');
            }
            if (flag('github')) write(path.join(CWD, '.github', 'workflows', 'facetkit.yml'), githubWorkflow(), done);
            console.log(`${done.written.length} file(s) written${done.kept.length ? `, ${done.kept.length} kept as they were (${done.kept.slice(0, 4).join(', ')}${done.kept.length > 4 ? ', …' : ''})` : ''}`);
            for (const f of done.written) console.log(`  + ${f}`);
            if (githubOnly) return void console.log('\nNext: read .github/workflows/facetkit.yml (set up your toolchain where it says so), commit it and open a pull request — the report appears as a comment. Guide: docs/github-integration.md');
            const first = customFlow ? customFlow.steps.find((s) => s.agent) : null;
            console.log(`\nNext:\n  1. put your project's rules at the top of .facet/RULES.md and your checks into facet.json → govern.checks\n  2. describe your first item in facet.items.json\n  3. add ".work/" to .gitignore; commit facet.json, facet.items.json and .facet/\n  4. ${flag('claude') ? 'restart Claude Code, then: /facet-item ITEM-1' : 'facet flow open ITEM-1 && facet flow next   (agents for Claude Code: facet init --claude, or install the plugin)'}${customFlow ? `\n\nThe flow of this project: ${customFlow.steps.map((s) => s.id).join(' → ')}${first ? ` (first agent: ${first.agent})` : ''}` : ''}`);
        },
        /** Writes a board from a synthetic journal: what the system looks like after a few weeks of work. */
        demo() {
            const events = demoEvents();
            const facets = skills().flatMap((s) => s.facets);
            const rows = diagnose(exposures(events, { facets }), facets);
            const data = boardData(events, {
                title: 'facetkit demo (synthetic data)',
                cost: costReport([], events),
                matrix: matrix(observations(events)),
                beliefs: beliefs(signals(events)),
                plan: plan(demoItems(), events, { start: '2026-01-05', milestones: { v1: '2026-02-02', v2: '2026-03-02' } }),
                skills: { rows: rows.filter((r) => r.exposed).map(({ facet, verdict, action, exposed, withheld, adherence, withRule, without, effect }) => ({ facet, verdict, action, exposed, withheld, adherence, withRule, without, effect })), coverage: coverage(events, facets), total: facets.length, blind: facets.filter((f) => !f.footprint.length).length },
            });
            const out = path.resolve(CWD, opt('out', 'facet-demo.html'));
            fs.writeFileSync(out, renderBoard(data));
            console.log(`demo board written to ${path.relative(CWD, out)} — open it in a browser. Every number on it is synthetic.`);
        },
        /** The registry of hypotheses: every facet as a claim about agent behaviour, with the trials reported for it.
         *  --check FILE fails when FILE is stale; --next [N] says which untested hypotheses to try first. */
        hypotheses() {
            const all = skills();
            const file = path.join(KIT, 'trials', 'results.json');
            const results = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : [];
            const lines = ['# Hypotheses', '', 'Every facet is a claim about what an agent does differently when it has read the rule. Until somebody runs its trial against a model, the claim is untested. This file is generated (`facet hypotheses --write HYPOTHESES.md`) from the skills and from `trials/results.json`; see [CONTRIBUTING.md](CONTRIBUTING.md#running-a-trial) for how to add a result.', ''];
            const facets = all.flatMap((s) => s.facets);
            const tested = new Set(results.map((r) => r.facet));
            lines.push(`**${facets.length} hypotheses · ${tested.size} with at least one reported trial · ${facets.length - tested.size} untested**`, '');
            for (const s of all) {
                lines.push(`## ${s.name}`, '', '| Facet | The claim | Guards against | Observable | Reported trials |', '|---|---|---|---|---|');
                for (const f of s.facets) {
                    const mine = results.filter((r) => r.facet === f.ref);
                    lines.push(`| \`${f.id}\` | ${f.title} | ${f.guards.join(', ')} | ${f.footprint.length ? f.footprint.join(', ') : 'no footprint'} | ${mine.length ? mine.map((r) => `${r.model}: ${r.verdict} (${r.with} vs ${r.without}, n=${r.runs})`).join('; ') : 'untested'} |`);
                }
                const trials = /## Trials\n+([\s\S]*)$/.exec(s.body)?.[1].trim();
                if (trials) lines.push('', 'Trials:', '', trials);
                lines.push('');
            }
            const text = `${lines.join('\n')}\n`;
            if (opt('check')) {
                const have = fs.existsSync(path.resolve(CWD, opt('check'))) ? fs.readFileSync(path.resolve(CWD, opt('check')), 'utf-8') : '';
                if (have !== text) fail(`hypotheses: ${opt('check')} is out of date with the skills or trials/results.json — run: facet hypotheses --write ${opt('check')}`);
                return void console.log(`${opt('check')} is up to date (${facets.length} hypotheses, ${tested.size} tested)`);
            }
            if (opt('next') !== undefined || flag('next')) return void console.log(nextTrials(all, results, Number(opt('next')) || 5, { field: fieldPacks(KIT) }));
            if (opt('write')) {
                fs.writeFileSync(path.resolve(CWD, opt('write')), text);
                console.log(`${facets.length} hypotheses written to ${opt('write')} (${tested.size} tested)`);
            } else console.log(text);
            if (!facets.length) fail('hypotheses: no skills found');
        },
    };
}

/**
 * Which untested hypotheses to try first. Field reports (knowledge packs from `facet learn export`, saved in
 * trials/field/*.json) come first: a rule projects follow but whose effect is unknown needs a trial most, then one
 * they ignore (does it matter at all?). Without field data, a rule whose observance leaves a footprint is
 * cheaper to judge than one that does not.
 */
export function nextTrials(skills, results, n = 5, { field = [] } = {}) {
    const tested = new Set(results.map((r) => r.facet));
    const signal = new Map();
    for (const p of field) for (const f of p.facets ?? []) {
        const s = signal.get(f.facet) ?? { exposed: 0, verdicts: new Set(), projects: 0 };
        s.exposed += f.exposed ?? 0;
        s.verdicts.add(f.verdict);
        s.projects++;
        signal.set(f.facet, s);
    }
    const rank = (v) => (v.has('followed; effect unknown') ? 3 : v.has('ignored') ? 2 : v.size ? 1 : 0);
    const rows = skills.flatMap((s) => s.facets.map((f) => ({ f, s, sig: signal.get(f.ref) })))
        .filter(({ f }) => !tested.has(f.ref))
        .sort((a, b) => rank(b.sig?.verdicts ?? new Set()) - rank(a.sig?.verdicts ?? new Set()) || (b.sig?.exposed ?? 0) - (a.sig?.exposed ?? 0) || (b.f.footprint.length ? 1 : 0) - (a.f.footprint.length ? 1 : 0))
        .slice(0, n);
    if (!rows.length) return 'every hypothesis has at least one reported trial';
    return [
        `${rows.length} hypotheses to try first${field.length ? ` (field reports: ${field.length})` : ' (no field reports in trials/field/ yet: ranked by whether the rule leaves a footprint)'}:`,
        ...rows.map(({ f, s, sig }, i) => [
            `${i + 1}. ${f.ref} — ${f.title}`,
            `   guards ${f.guards.join(', ') || '—'} · footprint ${f.footprint.join(', ') || 'none'}${sig ? ` · in the field: ${[...sig.verdicts].join(', ')}, exposed ${sig.exposed}× in ${sig.projects} project(s)` : ''}`,
            `   trials: skills/${s.name}/SKILL.md → "## Trials" · with the rule: facet compose --take ${f.ref}`,
        ].join('\n')),
        'How to run one and report it: CONTRIBUTING.md → "Running a trial". Claim it first on the Trial board issue, so nobody runs it twice.',
    ].join('\n');
}

export function fieldPacks(kit) {
    const dir = path.join(kit, 'trials', 'field');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')));
}

