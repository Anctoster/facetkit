// facet proof create --domain: a domain item is proven on the artifacts its domain declares (plan 2.3).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { declaredArtifacts, kitDomainFile } from '../lib/domainproof.mjs';
import { tmp, write } from './helpers.mjs';

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(KIT, 'bin', 'facet.mjs');
const ENGINE = path.join(KIT, 'domains', 'arch', 'skills', 'arch-item', 'scripts');
const PYTHON = ['python3', 'python'].find((p) => spawnSync(p, ['--version']).status === 0);
const imported = (item, journal, extra = {}) => ({ kind: 'item.open', item, domain: 'arch', src: { journal, n: 1, hash: 'a'.repeat(64) }, ...extra });

test('declared artifacts: globs from the kit domain file, under the folder of the journal the item came from', () => {
    const d = declaredArtifacts({ cwd: tmp(), events: [imported('D1-02', '_arch/journal.jsonl')], item: 'D1-02', domain: 'arch' });
    assert.deepEqual(d.globs, ['_arch/work/D1-02/**']);
    assert.equal(d.root, '_arch');
    assert.match(d.from, /domains\/arch\/skills\/arch-item\/scripts\/domain\.json$/);
    for (const domain of ['arch', 'viz']) assert.deepEqual(JSON.parse(fs.readFileSync(kitDomainFile(domain), 'utf-8')).artifacts, ['work/<ITEM>/**'], `${domain} ships its artifacts`);
});

test('declared artifacts: the project domain file wins; a prefixed item keeps its domain id in the path', () => {
    const cwd = tmp();
    write(cwd, '_arch/domain.json', JSON.stringify({ artifacts: ['work/<ITEM>/spec.json', 'renders/<ITEM>-*.png'] }));
    const d = declaredArtifacts({ cwd, events: [imported('B5-D1-02', '_arch/journal.jsonl', { domainItem: 'D1-02' })], item: 'B5-D1-02', domain: 'arch' });
    assert.deepEqual(d.globs, ['_arch/work/D1-02/spec.json', '_arch/renders/D1-02-*.png']);
    assert.equal(d.from, '_arch/domain.json');
});

test('declared artifacts: a pattern or a root that leaves the project is refused, and an item with no import is told what to do', () => {
    const cwd = tmp();
    for (const bad of ['../x/**', '/etc/**', 'work\\x', 'C:/x']) {
        write(cwd, '_arch/domain.json', JSON.stringify({ artifacts: [bad] }));
        assert.throws(() => declaredArtifacts({ cwd, events: [imported('D1', '_arch/journal.jsonl')], item: 'D1', domain: 'arch' }), /leaves the domain root/, bad);
    }
    assert.throws(() => declaredArtifacts({ cwd, events: [], item: 'D1', domain: 'arch', root: '../elsewhere' }), /outside this project/);
    assert.throws(() => declaredArtifacts({ cwd, events: [], item: 'D1', domain: 'arch' }), /facet domain import/);
    assert.throws(() => declaredArtifacts({ cwd, events: [imported('D1', 'a/journal.jsonl'), imported('D1', 'b/journal.jsonl')], item: 'D1', domain: 'arch' }), /more than one/);
    assert.throws(() => declaredArtifacts({ cwd, events: [imported('D1', '_arch/journal.jsonl')], item: 'D1', domain: '../x' }), /name the domain/);
});

test('cli: proof create --domain binds the pack to the declared files; an edit there makes it stale, an edit elsewhere does not', { skip: !PYTHON }, () => {
    const root = tmp();
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal' }));
    const script = `
import sys; sys.path.insert(0, sys.argv[1])
import archflow
j = archflow.Journal(sys.argv[2])
j.add("open", item="D1-02", route="model", title="t")
j.add("evidence", item="D1-02", check="bim.layers", status="OK", value=1.0)
j.add("verdict", item="D1-02", verdict="PASS")
j.add("close", item="D1-02")
`;
    const made = spawnSync(PYTHON, ['-c', script, ENGINE, path.join(root, '_arch')], { encoding: 'utf-8' });
    assert.equal(made.status, 0, made.stderr);
    write(root, '_arch/work/D1-02/spec.json', '{"walls":3}');
    write(root, 'notes.md', 'one');
    const f = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf-8', env: { ...process.env, FACET_WRITER: 'ann' } });
    const imp = f('domain', 'import', '_arch/journal.jsonl', '--domain', 'arch');
    assert.equal(imp.status, 0, imp.stderr);
    const created = f('proof', 'create', '--item', 'D1-02', '--domain', 'arch', '--no-sign');
    assert.equal(created.status, 0, created.stderr);
    assert.match(created.stdout, /proven on its declared artifacts .*: _arch\/work\/D1-02\/\*\*/);
    const pack = JSON.parse(fs.readFileSync(path.join(root, created.stdout.match(/written: (\S+)/)[1]), 'utf-8'));
    assert.deepEqual(pack.source.declared, ['_arch/work/D1-02/**']);
    assert.deepEqual(pack.source.dirty.map((d) => d.path), ['_arch/work/D1-02/spec.json']);
    write(root, 'notes.md', 'two');
    assert.doesNotMatch(f('proof', 'verify', '--item', 'D1-02').stdout, /sources changed/, 'a file outside the declaration does not touch the pack');
    write(root, '_arch/work/D1-02/spec.json', '{"walls":4}');
    assert.match(f('proof', 'verify', '--item', 'D1-02').stdout + f('proof', 'verify', '--item', 'D1-02').stderr, /sources changed .*_arch\/work\/D1-02\/spec\.json/);
});
