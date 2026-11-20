import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scan, scanSecrets } from '../lib/secscan.mjs';
import { gitInit, tmp, write } from './helpers.mjs';

const KEY = ['gh', 'p_', 'A'.repeat(36)].join(''); // shaped like a GitHub token, built so that no scanner sees it in this file
const OTHER = ['gh', 'p_', 'B'.repeat(36)].join('');

test('allow-secret: the marker no longer hides a secret — it asks a person to approve that exact line', () => {
    const [plain] = scanSecrets(`const t = "${KEY}";`, 'src/a.js');
    assert.deepEqual([plain.kind, plain.severity], ['secret', 'block']);
    const [marked] = scanSecrets(`const t = "${KEY}"; // facet:allow-secret`, 'src/a.js');
    assert.deepEqual([marked.kind, marked.severity], ['allowed-secret', 'approve']);
    assert.match(marked.approval, /^allow-secret:src\/a\.js:[0-9a-f]{16}$/);
    // another key on the same marked line is another approval; so is the same line in another file
    const [swapped] = scanSecrets(`const t = "${OTHER}"; // facet:allow-secret`, 'src/a.js');
    assert.notEqual(swapped.approval, marked.approval);
    assert.notEqual(scanSecrets(`const t = "${KEY}"; // facet:allow-secret`, 'src/b.js')[0].approval, marked.approval);
    // the marker on a line without a secret changes nothing
    assert.deepEqual(scanSecrets('// facet:allow-secret on its own', 'src/a.js'), []);
});

test('allow-secret: in a repository, a marked secret needs approval and the L1 approvals rule waits for it', () => {
    const root = tmp();
    write(root, 'README.md', 'start\n');
    gitInit(root);
    write(root, 'docs/setup.md', `export TOKEN=${KEY} # facet:allow-secret (example)\n`);
    const r = scan(root);
    assert.equal(r.blocking, 0);
    assert.equal(r.approvals.length, 1);
    assert.match(r.approvals[0], /^allow-secret:docs\/setup\.md:/);
    // an ignored path is not searched at all, marker or not
    assert.deepEqual(scan(root, { ignore: ['docs/**'] }).approvals, []);
});
