import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { nextTrials } from '../bin/setup.mjs';
import { tmp } from './helpers.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(KIT, 'bin', 'facet.mjs');
const skills = [{ name: 's', facets: [
    { ref: 's:quiet', id: 'quiet', title: 'Leaves no trace', guards: ['doc-drift'], footprint: [] },
    { ref: 's:seen', id: 'seen', title: 'Leaves a trace', guards: ['seam-break'], footprint: ['tool:seams'] },
    { ref: 's:done', id: 'done', title: 'Already tried', guards: ['loop'], footprint: ['runs'] },
] }];

test('hypotheses --next: tested ones are left out; field data first (effect unknown, then ignored); otherwise observable rules first', () => {
    const results = [{ facet: 's:done', model: 'm', runs: 3, with: '3/3', without: '0/3', verdict: 'confirmed' }];
    const bare = nextTrials(skills, results, 5);
    assert.match(bare, /^2 hypotheses to try first \(no field reports/);
    assert.ok(bare.indexOf('s:seen') < bare.indexOf('s:quiet'), 'a footprint makes a rule cheaper to judge');
    assert.ok(!bare.includes('s:done'));
    const field = [{ facets: [{ facet: 's:quiet', exposed: 9, verdict: 'followed; effect unknown' }, { facet: 's:seen', exposed: 20, verdict: 'ignored' }] }];
    const ranked = nextTrials(skills, results, 5, { field });
    assert.ok(ranked.indexOf('s:quiet') < ranked.indexOf('s:seen'), 'followed with unknown effect needs a trial most');
    assert.match(ranked, /in the field: followed; effect unknown, exposed 9× in 1 project/);
    assert.equal(nextTrials(skills, [...results, { facet: 's:quiet' }, { facet: 's:seen' }], 5), 'every hypothesis has at least one reported trial');
});

test('hypotheses --check: passes on the shipped registry, fails on a stale one', () => {
    assert.equal(spawnSync(process.execPath, [CLI, 'hypotheses', '--check', 'HYPOTHESES.md'], { cwd: KIT, encoding: 'utf-8' }).status, 0);
    const stale = path.join(tmp(), 'H.md');
    fs.writeFileSync(stale, fs.readFileSync(path.join(KIT, 'HYPOTHESES.md'), 'utf-8').replace('untested', 'confirmed'));
    const r = spawnSync(process.execPath, [CLI, 'hypotheses', '--check', stale], { cwd: KIT, encoding: 'utf-8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /out of date/);
});
