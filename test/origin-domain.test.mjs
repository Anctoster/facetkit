// Plan 2.8, domain adapters: an approved brief with a criteria block is imported as the item's
// criteria; a finding on a domain item is traced along the chain its domain.json declares.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { criteriaHash } from '../lib/criteria.mjs';
import { kitDomainFile } from '../lib/domainproof.mjs';
import { readJournal } from '../lib/journal.mjs';
import { tmp, write } from './helpers.mjs';

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(KIT, 'bin', 'facet.mjs');
const ENGINE = path.join(KIT, 'domains', 'arch', 'skills', 'arch-item', 'scripts');
const PYTHON = ['python3', 'python'].find((p) => spawnSync(p, ['--version']).status === 0);
const crit = [{ id: 'A1', text: 'walls 25 cm as drawn', check: 'model.dimensions', by: 'work', chain: ['task', 'spec', 'model'] }];

test('domain files: both domains declare chains, every compare is a command or human, every link has a step', () => {
    for (const d of ['arch', 'viz']) {
        const { chains } = JSON.parse(fs.readFileSync(kitDomainFile(d), 'utf-8'));
        assert.ok(chains && Object.keys(chains.links).length >= 3, d);
        for (const [pair, how] of Object.entries(chains.compare)) {
            const [a, b] = pair.split('>');
            assert.ok(a in chains.links && b in chains.links, `${d}: ${pair} names known links`);
            assert.ok(how === 'human' || /\{scripts\}\/\w+\.py/.test(how), `${d}: ${pair}`);
            if (how !== 'human') assert.ok(fs.existsSync(path.join(path.dirname(kitDomainFile(d)), how.match(/\{scripts\}\/(\w+\.py)/)[1])), `${d}: the script of ${pair} exists`);
        }
    }
});

test('cli: the approved criteria come over from the domain journal; a finding is traced along the domain chain', { skip: !PYTHON }, () => {
    const root = tmp();
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal' }));
    const script = `
import sys, json; sys.path.insert(0, sys.argv[1])
import archflow
crit = json.loads(sys.argv[3])
j = archflow.Journal(sys.argv[2])
j.add("open", item="D1", route="model", title="t")
j.add("brief.ok", item="D1", brief="abc", by="architect", criteria=1, list=crit, list_hash=archflow.criteria_hash(crit))
j.add("start", item="D1", step="work", agent="model-operator", model="haiku")
j.add("end", item="D1", step="work", agent="model-operator", status="DONE")
`;
    const made = spawnSync(PYTHON, ['-c', script, ENGINE, path.join(root, '_arch'), JSON.stringify(crit)], { encoding: 'utf-8' });
    assert.equal(made.status, 0, made.stderr);
    // the project's own domain.json: the task and the spec agree, the spec and the model do not
    write(root, '_arch/domain.json', JSON.stringify({ chains: { links: { task: { step: null }, spec: { step: 'read' }, model: { step: 'work' } }, compare: { 'task>spec': 'node -e "process.exit(0)"', 'spec>model': 'node -e "process.exit(process.env.FACET_CRITERION === \'A1\' ? 1 : 0)"' } } }));
    const f = (...a) => spawnSync(process.execPath, [CLI, ...a], { cwd: root, encoding: 'utf-8', env: { ...process.env, FACET_WRITER: 'ann' } });
    assert.equal(f('domain', 'import', '_arch/journal.jsonl', '--domain', 'arch').status, 0);
    const c = readJournal(path.join(root, '.facet', 'journal')).find((e) => e.kind === 'criterion');
    assert.deepEqual([c.item, c.by, c.hash], ['D1', 'architect', criteriaHash(crit)], 'the hash the engine wrote is the core\'s');
    assert.match(f('criteria', 'list', '--item', 'D1').stdout, /A1 +walls 25 cm as drawn/);
    const o = f('origin', '--item', 'D1', '--criterion', 'A1', '--from', 'human');
    assert.equal(o.status, 0, o.stderr);
    assert.match(o.stdout, /A1: source work \(model-operator\) — chain, chain/);
    const e = readJournal(path.join(root, '.facet', 'journal')).filter((x) => x.kind === 'origin').at(-1);
    assert.deepEqual([e.method, e.link, e.step, e.agent], ['chain', 'model', 'work', 'model-operator']);
});

test('cli: a domain finding is measured on the snapshots its engine took at each step start', { skip: !PYTHON }, () => {
    const root = tmp();
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal' }));
    const layers = [{ id: 'A2', text: 'every element on its layer', check: 'model.layers', by: 'work' }];
    const script = `
import sys, json; sys.path.insert(0, sys.argv[1])
import archflow
crit = json.loads(sys.argv[3])
j = archflow.Journal(sys.argv[2])
j.add("open", item="D1", route="model", title="t")
j.add("brief.ok", item="D1", brief="abc", by="architect", criteria=1, list=crit, list_hash=archflow.criteria_hash(crit))
for step, agent in (("order", "arch-conductor"), ("work", "model-operator"), ("readback", "model-operator"), ("proof", "arch-inspector")):
    j.add("start", item="D1", step=step, agent=agent, model="haiku")
    j.add("end", item="D1", step=step, agent=agent, status="DONE")
`;
    assert.equal(spawnSync(PYTHON, ['-c', script, ENGINE, path.join(root, '_arch'), JSON.stringify(layers)], { encoding: 'utf-8' }).status, 0);
    // the states the engine kept: the layers held after work (the snapshot taken when readback started), were broken by readback
    const results = (status) => JSON.stringify({ 'model.layers': { status }, _receipt: { tool: 'model_audit.py' } });
    write(root, '_arch/work/D1/snap/readback/audit.json', results('OK'));
    write(root, '_arch/work/D1/snap/proof/audit.json', results('FAIL'));
    write(root, '_arch/work/D1/audit.json', results('FAIL'));
    const f = (...a) => spawnSync(process.execPath, [CLI, ...a], { cwd: root, encoding: 'utf-8', env: { ...process.env, FACET_WRITER: 'ann' } });
    assert.equal(f('domain', 'import', '_arch/journal.jsonl', '--domain', 'arch').status, 0);
    const o = f('origin', '--item', 'D1', '--criterion', 'A2', '--from', 'return', '--found-at', 'proof');
    assert.equal(o.status, 0, o.stderr);
    const e = readJournal(path.join(root, '.facet', 'journal')).filter((x) => x.kind === 'origin').at(-1);
    assert.deepEqual([e.method, e.cause, e.step, e.agent], ['measured', 'regression', 'readback', 'model-operator']);
    // a state with no result for the check cannot say: then nothing is measured, and the reviewer's word is marked as such
    fs.rmSync(path.join(root, '_arch/work/D1/snap/proof/audit.json'));
    f('origin', '--item', 'D1', '--criterion', 'A2', '--from', 'return', '--found-at', 'proof');
    assert.equal(readJournal(path.join(root, '.facet', 'journal')).filter((x) => x.kind === 'origin').at(-1).method, 'judged');
});
