import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { countDrift, docProblems, threatModelProblems } from '../lib/docaudit.mjs';
import { tmp } from './helpers.mjs';

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('audit, documents: SECURITY.md must state the threat model — the section, the four sources of harm, what is out of scope', () => {
    assert.deepEqual(threatModelProblems(fs.readFileSync(path.join(KIT, 'SECURITY.md'), 'utf-8')), []);
    assert.deepEqual(threatModelProblems(null), ['SECURITY.md is missing']);
    assert.deepEqual(threatModelProblems('# Security\n'), ['SECURITY.md has no "## Threat model" section']);
    assert.deepEqual(threatModelProblems('## Threat model\nAn agent that errs. Foreign content. Accidents. Out of scope: x'), ['SECURITY.md: the threat model does not name "An agent that games the record"']);
});

test('audit, documents: a README number that differs from its source is named — a warning in a pull request, an error at release', async () => {
    const root = tmp();
    for (const f of ['SECURITY.md', 'README.md', 'README.pl.md', 'HYPOTHESES.md', 'scripts/counts.mjs', 'benchmark/expected.json']) {
        fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
        fs.copyFileSync(path.join(KIT, f), path.join(root, f));
    }
    fs.cpSync(path.join(KIT, 'test'), path.join(root, 'test'), { recursive: true });
    assert.deepEqual(await docProblems(root), []);
    await import(pathToFileURL(path.join(root, 'scripts', 'counts.mjs')).href).then(({ counts, fill, FILES }) => {
        for (const f of FILES) fs.writeFileSync(path.join(root, f), fill(fs.readFileSync(path.join(root, f), 'utf-8'), counts(root)).text);
    });
    assert.deepEqual(await countDrift(root), []);
    const readme = path.join(root, 'README.md');
    fs.writeFileSync(readme, fs.readFileSync(readme, 'utf-8').replace(/<!-- count:tests -->\d+/, '<!-- count:tests -->185'));
    assert.deepEqual(await docProblems(root), [], 'not an error of the audit: pull requests do not write the numbers');
    const drift = await countDrift(root);
    assert.equal(drift.length, 1);
    assert.match(drift[0], /^README\.md: tests says 185, the sources say \d+ — written at release \(npm run counts\)$/);
});
