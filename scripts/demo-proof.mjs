#!/usr/bin/env node
// Five-minute demonstration: an agent changes code → the change is checked → a proof pack is made →
// somebody else verifies it with nothing but one file → the proof stops holding the moment the code moves.
// It builds a throw-away project in the temp folder and touches nothing else.  Run: npm run demo:proof
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'facet-demo-'));
const quiet = process.argv.includes('--quiet');
const say = (text) => quiet || console.log(text);
const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
};
const sh = (cmd, args, env = {}) => spawnSync(cmd, args, { cwd: root, encoding: 'utf-8', env: { ...process.env, FACET_WRITER: 'demo', ...env } });
const facet = (args, env) => sh(process.execPath, [CLI, ...args], env);
const must = (r, what) => {
    if (r.status !== 0) {
        console.error(`demo: ${what} failed\n${r.stdout}${r.stderr}`);
        process.exit(1);
    }
    return r;
};
const last = (r) => r.stdout.trim().split('\n').filter(Boolean);

say(`project: ${root}\n`);
write('package.json', JSON.stringify({ name: 'demo', type: 'module', facetkit: { govern: { required: 1, checks: { unit: { run: 'node --test', covers: ['test/**'] } } } } }, null, 2));
write('routing.json', JSON.stringify({ items: { D1: { deps: [], route: [], gates: [] } } }));
write('src/price.mjs', 'export const total = (net) => net;\n');
write('test/price.test.mjs', "import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport { total } from '../src/price.mjs';\ntest('tax is added', () => assert.equal(total(100), 123));\n");
for (const a of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=demo', '-c', 'user.email=demo@example.invalid', 'commit', '-qm', 'start']]) must(sh('git', a), 'git');

say('1. An agent is given item D1 and changes the code.');
must(facet(['flow', 'open', 'D1']), 'open');
for (const step of ['open', 'map', 'red']) {
    must(facet(['flow', 'start', step], { FACET_RUN: 'run-builder' }), `start ${step}`);
    must(facet(['flow', 'end', step, '--status', 'DONE']), `end ${step}`);
}
must(facet(['flow', 'start', 'build'], { FACET_RUN: 'run-builder' }), 'start build');
write('src/price.mjs', 'export const total = (net) => Math.round(net * 1.23);\n');
must(facet(['flow', 'end', 'build', '--status', 'DONE']), 'end build');

say('2. Another agent, in another run, checks it: the tests run, the change is scanned, a verdict is recorded.');
must(facet(['flow', 'start', 'proof'], { FACET_RUN: 'run-inspector' }), 'start proof');
must(facet(['check']), 'check');
must(facet(['scan']), 'scan');
must(facet(['flow', 'end', 'proof', '--status', 'DONE']), 'end proof');
must(facet(['flow', 'verdict', 'PASS']), 'verdict');

say('3. The proof pack ties that verdict to exactly these sources.');
const made = must(facet(['proof', 'create', '--item', 'D1']), 'proof create');
say(last(made).slice(0, 1).join('\n'));
must(facet(['proof', 'export', '--item', 'D1', '--out', 'D1.proof.json']), 'proof export');

say('\n4. Somebody else verifies it with nothing but that one file and their copy of the sources.');
const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'facet-demo-copy-'));
fs.cpSync(path.join(root, 'src'), path.join(copy, 'src'), { recursive: true });
fs.cpSync(path.join(root, 'test'), path.join(copy, 'test'), { recursive: true });
for (const f of ['package.json', 'routing.json']) fs.copyFileSync(path.join(root, f), path.join(copy, f));
const bundle = path.join(root, 'D1.proof.json');
const verify = (dir, file = bundle) => spawnSync(process.execPath, [CLI, 'proof', 'verify', '--bundle', file, '--root', dir], { cwd: os.tmpdir(), encoding: 'utf-8' });
const ok = verify(copy);
say(ok.stdout.trim());

say('\n5. One line of code changes after the checks. The proof no longer covers these sources.');
fs.writeFileSync(path.join(copy, 'src', 'price.mjs'), 'export const total = (net) => Math.round(net * 1.08);\n');
const stale = verify(copy);
say(last(stale)[0]);

say('\n6. Somebody edits the bundle to claim more than was shown.');
const forged = path.join(root, 'forged.proof.json');
const b = JSON.parse(fs.readFileSync(bundle, 'utf-8'));
b.manifest.level = 'L4 calibrated';
fs.writeFileSync(forged, JSON.stringify(b));
const tampered = verify(root, forged);
say(last(tampered)[0]);

const result = { valid: /: VALID/.test(ok.stdout), stale: /: STALE/.test(stale.stdout), tampered: /: TAMPERED/.test(tampered.stdout), level: (ok.stdout.match(/VALID — (L\d \w+)/) ?? [])[1] ?? null };
say(`\nresult: ${JSON.stringify(result)}`);
if (quiet) console.log(JSON.stringify(result));
fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(copy, { recursive: true, force: true });
process.exit(result.valid && result.stale && result.tampered ? 0 : 1);
