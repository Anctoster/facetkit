import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scan } from '../lib/secscan.mjs';
import { gitInit, tmp, write } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');
const KEY = `AKIA${'Z'.repeat(16)}`; // shaped like an AWS access key id

test('scan: a changed file it cannot read is a finding that needs approval, and the scan is partial', () => {
    const root = tmp();
    write(root, 'README.md', 'start\n');
    gitInit(root);
    write(root, 'src/big.js', `// ${KEY}\n${'x'.repeat(600)}\n`);
    write(root, 'assets/logo.bin', `PNG\u0000\u0001${KEY}`);
    write(root, 'src/small.js', 'export const a = 1;\n');
    const r = scan(root, { maxBytes: 500 });
    assert.equal(r.partial, true);
    assert.equal(r.notScanned, 2);
    const unread = r.findings.filter((f) => f.kind === 'not-scanned');
    assert.deepEqual(unread.map((f) => f.where).sort(), ['assets/logo.bin', 'src/big.js']);
    assert.ok(unread.every((f) => f.severity === 'approve'));
    assert.deepEqual(r.approvals.sort(), ['not-scanned:assets/logo.bin', 'not-scanned:src/big.js']);
    assert.match(unread.find((f) => f.where === 'src/big.js').what, /bytes, more than the limit of 500/);
    assert.match(unread.find((f) => f.where === 'assets/logo.bin').what, /binary/);
    // what was read is still searched, and an ignored file is still not reported
    write(root, 'src/small.js', `const k = '${KEY}';\n`);
    assert.equal(scan(root, { maxBytes: 500 }).blocking, 1);
    assert.equal(scan(root, { maxBytes: 500, ignore: ['src/**', 'assets/**'] }).partial, false);
    // within the limit, the same file is read and its secret found
    assert.equal(scan(root, { maxBytes: 10_000 }).findings.filter((f) => f.kind === 'secret').length, 2);
});

test('cli: a partial scan exits 2 and names what was not read; nothing unread exits 0', () => {
    const root = tmp();
    write(root, 'package.json', JSON.stringify({ facetkit: {} }));
    gitInit(root);
    const f = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf-8' });
    assert.equal(f('scan').status, 0);
    write(root, 'data/blob.bin', 'a\u0000b');
    const partial = f('scan');
    assert.equal(partial.status, 2, partial.stderr);
    assert.match(partial.stdout, /scan PARTIAL: .* 1 not scanned · needs approval: not-scanned:data\/blob\.bin/);
});
