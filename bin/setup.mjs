// Commands that set a project up or show the kit off: init, demo, hypotheses.
import fs from 'node:fs';
import path from 'node:path';
import { boardData, renderBoard } from '../lib/board.mjs';
import { costReport } from '../lib/cost.mjs';
import { demoEvents, demoItems } from '../lib/demo.mjs';
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
    return {
        /** Scaffolds a project: configuration, an items file, team rules and handoff templates; with --claude also agents and commands. */
        init() {
            const done = { written: [], kept: [] };
            const minimal = flag('minimal');
            const dirs = ['src', 'lib', 'app', 'server', 'pkg', 'cmd', 'internal', 'tests', 'test'].filter((d) => fs.existsSync(path.join(CWD, d)));
            const config = { journal: '.facet/journal', memory: '.facet/memory', routing: 'facet.items.json', ...(minimal ? { flow: '.facet/flow.json' } : {}), dirs: dirs.length ? dirs : ['src', 'tests'], govern: { required: 1, attestations: '.facet/attest', checks: {} }, skillint: { requireCause: true, ablate: { rate: 0 } } };
            write(path.join(CWD, 'facet.json'), `${JSON.stringify(config, null, 2)}\n`, done);
            const route = minimal ? ['spec-falsifier', 'slice-builder', 'proof-inspector'] : ['context-cartographer', 'spec-falsifier', 'red-first-specifier', 'slice-builder', 'proof-inspector'];
            write(path.join(CWD, 'facet.items.json'), `${JSON.stringify({ items: { 'ITEM-1': { version: 'v1', deps: [], tier: 'normal', route, gates: [], title: 'Replace this with your first piece of work' } } }, null, 2)}\n`, done);
            if (minimal) copy(path.join(KIT, 'presets', 'minimal.flow.json'), path.join(CWD, '.facet', 'flow.json'), done);
            copy(path.join(KIT, 'templates', 'RULES.md'), path.join(CWD, '.facet', 'RULES.md'), done);
            for (const f of fs.readdirSync(path.join(KIT, 'templates')).filter((x) => x !== 'RULES.md')) copy(path.join(KIT, 'templates', f), path.join(CWD, '.facet', 'templates', f), done);
            if (flag('claude')) {
                for (const f of fs.readdirSync(path.join(KIT, 'agents'))) copy(path.join(KIT, 'agents', f), path.join(CWD, '.claude', 'agents', f), done);
                for (const f of fs.readdirSync(path.join(KIT, 'commands'))) copy(path.join(KIT, 'commands', f), path.join(CWD, '.claude', 'commands', f), done);
            }
            console.log(`${done.written.length} file(s) written${done.kept.length ? `, ${done.kept.length} kept as they were (${done.kept.slice(0, 4).join(', ')}${done.kept.length > 4 ? ', …' : ''})` : ''}`);
            for (const f of done.written) console.log(`  + ${f}`);
            console.log(`\nNext:\n  1. put your project's rules at the top of .facet/RULES.md and your checks into facet.json → govern.checks\n  2. describe your first item in facet.items.json\n  3. add ".work/" to .gitignore; commit facet.json, facet.items.json and .facet/\n  4. ${flag('claude') ? 'restart Claude Code, then: /facet-item ITEM-1' : 'facet flow open ITEM-1 && facet flow next   (agents for Claude Code: facet init --claude, or install the plugin)'}`);
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
        /** The registry of hypotheses: every facet as a claim about agent behaviour, with the trials reported for it. */
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
            if (opt('write')) {
                fs.writeFileSync(path.resolve(CWD, opt('write')), text);
                console.log(`${facets.length} hypotheses written to ${opt('write')} (${tested.size} tested)`);
            } else console.log(text);
            if (!facets.length) fail('hypotheses: no skills found');
        },
    };
}
