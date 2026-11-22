import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scan, scanSecrets } from '../lib/secscan.mjs';
import { gitInit, tmp, write } from './helpers.mjs';

const KEY = ['gh', 'p_', 'A'.repeat(36)].join(''); // shaped like a GitHub token, built so that no scanner sees it in this file

test('allow-secret outside an ignored path: an allow-outside-ignore finding with its line, and the secret is still found', () => {
    const found = scanSecrets(`x\nconst t = "${KEY}"; // facet:allow-secret`, 'src/a.js');
    assert.deepEqual(found.map((f) => `${f.kind} ${f.severity} ${f.where}`), ['allow-outside-ignore block src/a.js:2', 'secret block src/a.js:2']);
    // the marker alone, without a secret, is a finding too
    assert.deepEqual(scanSecrets('// facet:allow-secret', 'src/a.js').map((f) => `${f.kind} ${f.where}`), ['allow-outside-ignore src/a.js:1']);
    assert.deepEqual(scanSecrets('plain line', 'src/a.js'), []);
});

test('allow-secret in a repository: blocks outside the ignore list; inside it the file is not searched, marker or not', () => {
    const root = tmp();
    write(root, 'README.md', 'start\n');
    gitInit(root);
    write(root, 'docs/setup.md', `export TOKEN=${KEY} # facet:allow-secret (example)\n`);
    const r = scan(root);
    assert.equal(r.blocking, 2);
    assert.deepEqual(r.findings.map((f) => f.kind).sort(), ['allow-outside-ignore', 'secret']);
    assert.deepEqual(r.approvals, []);
    const ignored = scan(root, { ignore: ['docs/**'] });
    assert.deepEqual([ignored.blocking, ignored.findings.length], [0, 0]);
});
