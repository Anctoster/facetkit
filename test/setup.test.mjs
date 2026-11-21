import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { demoEvents } from '../lib/demo.mjs';
import { itemState } from '../lib/flow.mjs';
import { trust } from '../lib/govern.mjs';
import { closedItems } from '../lib/journal.mjs';
import { tmp, write } from './helpers.mjs';

// in-memory stories have no journal file to verify; these tests state the fact that `facet` establishes by running verifyJournal
const VERIFIED = { project: { journalIntact: true } };

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const f = (root, ...args) => spawnSync('node', [path.join(KIT, 'bin', 'facet'), ...args], { cwd: root, encoding: 'utf-8' });

test('init: a project of any language gets a configuration, an items file, rules and templates; nothing is overwritten', () => {
    const root = tmp();
    write(root, 'pkg/a.go', 'package a\n');
    write(root, 'facet.items.json', '{"items":{"MINE":{"deps":[],"route":["slice-builder","proof-inspector"],"gates":[]}}}');
    const r = f(root, 'init', '--minimal', '--claude');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /kept as they were \(facet\.items\.json\)/);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'facet.json'), 'utf-8'));
    assert.deepEqual([config.dirs, config.flow, config.journal], [['pkg'], '.facet/flow.json', '.facet/journal']);
    for (const file of ['.facet/RULES.md', '.facet/templates/proof.md', '.facet/flow.json', '.claude/agents/slice-builder.md', '.claude/commands/facet-item.md']) assert.ok(fs.existsSync(path.join(root, file)), file);
    assert.equal(fs.readdirSync(path.join(root, '.claude', 'agents')).length, 9);
    const opened = f(root, 'flow', 'open', 'MINE');
    assert.match(opened.stdout, /MINE opened with 5 steps: spec → build → probe → proof → commit/, 'facet.json is read without a package.json');
    assert.match(opened.stdout, /rules: facet compose --role spec-falsifier --phase red/);
    assert.ok(fs.existsSync(path.join(root, '.facet', 'journal')), 'the journal is segmented from the start');
    assert.match(f(root, 'init').stdout, /0 file\(s\) written/);
});

test('the shipped team: every agent has a loadout, a boundary and no hard-coded language; commands call what exists', () => {
    const loadouts = JSON.parse(fs.readFileSync(path.join(KIT, 'loadouts.json'), 'utf-8')).roles;
    const agents = fs.readdirSync(path.join(KIT, 'agents')).map((x) => x.replace(/\.md$/, ''));
    assert.deepEqual(agents.sort(), Object.keys(loadouts).filter((r) => r !== 'orchestrator').sort());
    for (const name of agents) {
        const text = fs.readFileSync(path.join(KIT, 'agents', `${name}.md`), 'utf-8');
        const meta = /^---\n([\s\S]*?)\n---/.exec(text)[1];
        assert.match(meta, new RegExp(`^name: ${name}$`, 'm'));
        assert.match(meta, new RegExp(`^model: ${loadouts[name].model.default}$`, 'm'), `${name}: the model matches the loadouts`);
        assert.match(meta, /\b(never|Never|Read-only|no product code)\b/, `${name}: the description states a boundary`);
        assert.match(text, /language they write in/, `${name}: answers in the user's language`);
        assert.doesNotMatch(text, /\b(Russian|Polish|English)\b/, `${name}: no language is hard-coded`);
        assert.ok(text.split(/\s+/).length <= 520, `${name}: ${text.split(/\s+/).length} words`);
    }
    const command = fs.readFileSync(path.join(KIT, 'commands', 'facet-item.md'), 'utf-8');
    for (const needle of ['facet flow next', 'facet flow start', 'facet flow end', 'facet flow verdict', 'facet flow close', '--phase run', '--phase close']) assert.ok(command.includes(needle), needle);
    const plugin = JSON.parse(fs.readFileSync(path.join(KIT, 'plugin', '.claude-plugin', 'plugin.json'), 'utf-8'));
    assert.equal(plugin.version, JSON.parse(fs.readFileSync(path.join(KIT, 'package.json'), 'utf-8')).version);
});

test('demo: the synthetic journal is a valid history, and the page is written without a project', () => {
    const events = demoEvents();
    assert.equal(closedItems(events).length, 6);
    assert.equal(itemState(events, 'T08').steps.find((s) => s.id === 'build').status, 'running');
    assert.equal(itemState(events, 'T07').steps.find((s) => s.id === 'map').status, 'needs-user');
    const t = trust(events, VERIFIED);
    assert.deepEqual([t.escapes.n, t.calibration.length], [1, 2]);
    const root = tmp();
    const r = f(root, 'demo');
    assert.equal(r.status, 0, r.stderr);
    const html = fs.readFileSync(path.join(root, 'facet-demo.html'), 'utf-8');
    assert.ok(html.includes('synthetic data') && html.includes('"T08"'));
});

test('hypotheses: every facet is listed as a claim with its trials; reported results change its status', () => {
    const root = tmp();
    const r = f(root, 'hypotheses');
    assert.match(r.stdout, /\*\*\d+ hypotheses · \d+ with at least one reported trial · \d+ untested\*\*/);
    assert.match(r.stdout, /\| `mutant-probe` \| Green tests must notice broken code \| false-green \| tool:mutate \| /);
    const committed = fs.readFileSync(path.join(KIT, 'HYPOTHESES.md'), 'utf-8');
    assert.equal(committed, r.stdout.replace(/\n$/, ''), 'HYPOTHESES.md is up to date: facet hypotheses --write HYPOTHESES.md');
});

test('init --agents: the flow has only the chosen agents, in order; Claude Code gets only those; a flow without a judge closes at L0', () => {
    const root = tmp();
    const r = f(root, 'init', '--agents', 'proof-inspector,slice-builder', '--claude');
    assert.equal(r.status, 0, r.stderr);
    const flow = JSON.parse(fs.readFileSync(path.join(root, '.facet', 'flow.json'), 'utf-8'));
    assert.deepEqual(flow.steps.map((s) => s.id), ['build', 'proof', 'commit'], 'the order of the default flow, not of the list');
    assert.deepEqual(fs.readdirSync(path.join(root, '.claude', 'agents')).sort(), ['proof-inspector.md', 'slice-builder.md']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'facet.json'), 'utf-8')).govern.required, 1);
    assert.match(f(root, 'flow', 'open', 'ITEM-1').stdout, /opened with 3 steps: build → proof → commit/);
    assert.match(f(tmp(), 'init', '--agents', 'nobody').stderr, /unknown agent\(s\) nobody — choose from: .*slice-builder/);
    assert.match(f(tmp(), 'init', '--minimal', '--agents', 'slice-builder').stderr, /use one of them/);
    const lone = tmp();
    const l = f(lone, 'init', '--agents', 'slice-builder');
    assert.match(l.stdout, /items close at L0/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(lone, 'facet.json'), 'utf-8')).govern.required, 0);
});

test('init --github: alone it writes only a pull-request workflow with full history, the project toolchain and a pinned release', () => {
    const root = tmp();
    write(root, 'requirements.txt', 'pytest\n');
    const r = f(root, 'init', '--github');
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(fs.readdirSync(root).sort(), ['.github', 'requirements.txt'], 'the Action needs no configuration, so none is written');
    const wf = fs.readFileSync(path.join(root, '.github', 'workflows', 'facetkit.yml'), 'utf-8');
    const version = JSON.parse(fs.readFileSync(path.join(KIT, 'package.json'), 'utf-8')).version;
    assert.match(wf, /pull_request:/);
    assert.doesNotMatch(wf, /pull_request_target/);
    assert.match(wf, /fetch-depth: 0/);
    assert.match(wf, /pull-requests: write/);
    assert.match(wf, /setup-python@v5[\s\S]*pip install -r requirements\.txt/);
    assert.ok(wf.includes(`uses: Anctoster/facetkit@v${version}`));
    assert.match(f(root, 'init', '--github').stdout, /kept as they were/, 'a second run overwrites nothing');
});
