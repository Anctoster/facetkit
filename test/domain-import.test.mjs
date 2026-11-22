import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readJournal } from '../lib/journal.mjs';
import { readDomainJournal } from '../lib/domainlog.mjs';
import { tmp, write } from './helpers.mjs';

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(KIT, 'bin', 'facet.mjs');
const ENGINE = path.join(KIT, 'domains', 'arch', 'skills', 'arch-item', 'scripts');
const PYTHON = ['python3', 'python'].find((p) => spawnSync(p, ['--version']).status === 0);

/** A domain journal written by the domain engine itself, so the test reads exactly what the plugin writes. */
function domainJournal() {
    const dir = tmp('facetkit-domain-');
    const script = `
import sys; sys.path.insert(0, sys.argv[1])
import archflow
j = archflow.Journal(sys.argv[2])
j.add("open", item="D1-02", route="model", title="Budynek — próba é")
j.add("start", item="D1-02", step="work", agent="model-operator", model="haiku")
j.add("evidence", item="D1-02", check="bim.layers", status="OK", value=1.0, receipt={"tool": "model_audit.py", "sha": "ab" * 8, "inputs": "cd" * 8})
j.add("evidence", item="D1-02", check="model.placement", status="FAIL", value=0.25)
j.add("end", item="D1-02", step="work", status="DONE", tokens=1200, agent="model-operator")
j.add("cost", item="D1-02", kind="person", minutes=12.5)
j.add("verdict", item="D1-02", verdict="PASS")
j.add("close", item="D1-02")
`;
    const r = spawnSync(PYTHON, ['-c', script, ENGINE, dir], { encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stderr);
    return path.join(dir, 'journal.jsonl');
}

test('domain journal: the chain the engine wrote is read as it wrote it — Python floats, non-ASCII text, receipts', { skip: !PYTHON }, () => {
    const file = domainJournal();
    const { lines, head } = readDomainJournal(file);
    assert.equal(lines.length, 8);
    assert.equal(head.n, 8);
    assert.equal(head.hash.length, 64);
    assert.equal(lines[0].event.title, 'Budynek — próba é');
    assert.equal(lines[2].event.value, 1);
    assert.equal(lines[5].event.minutes, 12.5);
});

test('domain journal: an edited, removed or reordered line, or a torn one, stops the import with its line number', { skip: !PYTHON }, () => {
    const file = domainJournal();
    const original = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
    const attempt = (lines) => {
        fs.writeFileSync(file, `${lines.join('\n')}\n`);
        return () => readDomainJournal(file);
    };
    assert.throws(attempt(original.map((l, i) => (i === 3 ? l.replace('"FAIL"', '"OK"') : l))), /line 4 \(event 4\) does not hold in the chain/);
    assert.throws(attempt(original.filter((_, i) => i !== 2)), /line 3 \(event 4\) does not hold/);
    assert.throws(attempt([original[0], original[2], original[1], ...original.slice(3)]), /line 2 .* does not hold/);
    assert.throws(attempt([...original.slice(0, 7), original[7].slice(0, 40)]), /line 8 is not a whole event/);
    // a line written again with a recomputed hash but the old place in the chain is caught by the next line
    const forged = JSON.parse(original[3]);
    forged.status = 'OK';
    assert.throws(attempt(original.map((l, i) => (i === 3 ? JSON.stringify(forged) : l))), /line 4/);
});

test('domain journal: an anchor written at a close must still match — a rewritten history does not', { skip: !PYTHON }, () => {
    const file = domainJournal();
    const { lines } = readDomainJournal(file);
    assert.doesNotThrow(() => readDomainJournal(file, { anchor: `ANCHOR 5:${lines[4].hash}` }));
    assert.doesNotThrow(() => readDomainJournal(file, { anchor: `5:${lines[4].hash.slice(0, 16)}` }));
    assert.throws(() => readDomainJournal(file, { anchor: `5:${'0'.repeat(64)}` }), /does not match the journal: its history was rewritten/);
    assert.throws(() => readDomainJournal(file, { anchor: '5:abc' }), /expected n:hash/);
});

test('cli: domain import records one core event per line, mapped and pointing back; a second run adds nothing', { skip: !PYTHON }, () => {
    const file = domainJournal();
    const root = tmp();
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal' }));
    const target = path.join(root, '_arch', 'journal.jsonl');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file, target);
    const f = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf-8', env: { ...process.env, FACET_WRITER: 'ann' } });
    const first = f('domain', 'import', '_arch/journal.jsonl', '--domain', 'arch');
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /chain holds over 8 line\(s\), head 8:[0-9a-f]{16}; 8 new event\(s\) recorded, 0 already imported; items: D1-02/);
    const core = readJournal(path.join(root, '.facet', 'journal'));
    assert.deepEqual(core.map((e) => e.kind), ['item.open', 'step.start', 'evidence', 'evidence', 'step.end', 'domain.cost', 'verdict', 'item.close']);
    const ev = core.filter((e) => e.kind === 'evidence');
    assert.deepEqual(ev.map((e) => [e.name, e.ok, e.status]), [['bim.layers', true, 'OK'], ['model.placement', false, 'FAIL']]);
    assert.deepEqual(core[5].data, { kind: 'person', minutes: 12.5 }, 'an unmapped line keeps its fields apart');
    assert.deepEqual(ev[0].receipt, { tool: 'model_audit.py', sha: 'ab'.repeat(8), inputs: 'cd'.repeat(8) });
    assert.ok(core.every((e) => e.domain === 'arch' && e.src.journal === '_arch/journal.jsonl' && e.src.hash.length === 64));
    assert.deepEqual(core.map((e) => e.src.n), [1, 2, 3, 4, 5, 6, 7, 8]);
    const again = f('domain', 'import', '_arch/journal.jsonl', '--domain', 'arch');
    assert.match(again.stdout, /0 new event\(s\) recorded, 8 already imported/);
    assert.equal(readJournal(path.join(root, '.facet', 'journal')).length, 8);
    assert.equal(f('journal').status, 0, 'the core journal stays whole');
});

test('cli: domain import refuses a broken chain and writes nothing', { skip: !PYTHON }, () => {
    const file = domainJournal();
    fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('"FAIL"', '"OK"'));
    const root = tmp();
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal' }));
    const r = spawnSync(process.execPath, [CLI, 'domain', 'import', file, '--domain', 'arch'], { cwd: root, encoding: 'utf-8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /line 4 \(event 4\) does not hold in the chain/);
    assert.equal(fs.existsSync(path.join(root, '.facet', 'journal')) ? readJournal(path.join(root, '.facet', 'journal')).length : 0, 0);
});

test('domain journal: lines of versions before 0.3.2 carry a 16-character hash and are checked at that length', { skip: !PYTHON }, () => {
    const dir = tmp();
    const script = `
import sys, json, hashlib
path = sys.argv[1]
prev = ""
with open(path, "w", encoding="utf-8", newline="\\n") as f:
    for n, body in enumerate([{"type": "open", "item": "V-1", "route": "render"}, {"type": "close", "item": "V-1"}], 1):
        body = dict(body, n=n, ts="2026-11-01T10:00:00", prev=prev)
        h = hashlib.sha256((prev + json.dumps(body, sort_keys=True, ensure_ascii=False)).encode("utf-8")).hexdigest()[:16]
        body["hash"] = h
        f.write(json.dumps(body, ensure_ascii=False) + "\\n")
        prev = h
`;
    const file = path.join(dir, 'journal.jsonl');
    assert.equal(spawnSync(PYTHON, ['-c', script, file]).status, 0);
    const { lines } = readDomainJournal(file);
    assert.deepEqual(lines.map((l) => l.hash.length), [16, 16]);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('"render"', '"pack"'));
    assert.throws(() => readDomainJournal(file), /line 1 \(event 1\) does not hold/);
});

test('domain import: an item id that could leave its folder is refused even when the chain holds', async () => {
    const { toImport } = await import('../lib/domainlog.mjs');
    const lines = [{ n: 1, hash: 'a'.repeat(64), event: { n: 1, type: 'open', item: '../../etc', prev: '' } }];
    assert.throws(() => toImport(lines, [], { domain: 'arch', journal: 'j' }), /line 1 names item "\.\.\/\.\.\/etc", which is not usable/);
    assert.throws(() => toImport([], [], { domain: 'arch', journal: 'j', prefix: 'a/b' }), /prefix "a\/b" is not usable/);
    assert.equal(toImport([{ ...lines[0], event: { ...lines[0].event, item: 'D1-02' } }], [], { domain: 'arch', journal: 'j', prefix: 'ARCH-' })[0].item, 'ARCH-D1-02');
});
