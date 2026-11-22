// Plan 2.8, step 1: numbered criteria with a check and an owner; the gate; approval by hash.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { approvedCriteria, criteriaHash, gateCriteria, parseCheck, readCriteria } from '../lib/criteria.mjs';
import { readJournal } from '../lib/journal.mjs';
import { tmp, write } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');
const block = (list) => `# brief\n\n## Done when\n\`\`\`criteria\n${JSON.stringify(list)}\n\`\`\`\n`;
const c = (id, check, extra = {}) => ({ id, text: `criterion ${id}`, check, by: 'build', ...extra });

test('check: a tool with a threshold, a bare tool, or [user]', () => {
    assert.deepEqual(parseCheck('scene_checks terrain.holes = 0'), { user: false, tool: 'scene_checks', measure: 'terrain.holes', op: '=', value: 0, unit: null });
    assert.deepEqual(parseCheck('junction.step <= 0.05'), { user: false, tool: 'junction.step', measure: null, op: '<=', value: 0.05, unit: null });
    assert.deepEqual(parseCheck('spec_compare wall.thickness = 25 cm'), { user: false, tool: 'spec_compare', measure: 'wall.thickness', op: '=', value: 25, unit: 'cm' });
    assert.equal(parseCheck('unit').tool, 'unit');
    assert.deepEqual(parseCheck('[user]'), { user: true });
    assert.equal(parseCheck('looks good to me'), null);
});

test('gate: no check and no [user] is refused; more than three [user] is refused; ids, owners and chains are checked', () => {
    assert.deepEqual(gateCriteria([c('A1', 'unit'), c('A2', '[user]')], { steps: ['build'], tools: ['unit'] }), []);
    const why = (list, o) => gateCriteria(list, o).map((p) => p.why).join(' | ');
    assert.match(why([c('A1', undefined)]), /no check/);
    assert.match(why([c('A1', 'looks good to me')]), /cannot be read/);
    assert.match(why([c('A1', 'nope')], { tools: ['unit'] }), /not a registered tool/);
    assert.match(why(['A1', 'A2', 'A3', 'A4'].map((id) => c(id, '[user]'))), /4 criteria are \[user\]; at most 3/);
    assert.match(why([c('a1', 'unit')]), /the id is a letter/);
    assert.match(why([c('A1', 'unit'), c('A1', 'unit')]), /used twice/);
    assert.match(why([c('A1', 'unit', { by: 'deploy' })], { steps: ['build'] }), /not a step of this item/);
    assert.match(why([c('A1', 'unit', { chain: 'drawing' })]), /"chain" is a list/);
    assert.match(why([]), /"done" is not stated/);
});

test('block: read from the brief; not JSON or not a list is a problem; no block is said', () => {
    assert.equal(readCriteria(block([c('A1', 'unit')])).criteria[0].id, 'A1');
    assert.equal(readCriteria('# no block').found, false);
    assert.match(readCriteria('```criteria\n[{,]\n```\n').problems[0].why, /not JSON/);
    assert.match(readCriteria('```criteria\n{"id":"A1"}\n```\n').problems[0].why, /is a list/);
    assert.equal(criteriaHash([{ id: 'A1', by: 'b' }]), criteriaHash([{ by: 'b', id: 'A1' }]), 'the order of keys does not change the hash');
});

test('cli: approve records the list and its hash; a changed brief needs a new approval; flow end refuses a bad block', () => {
    const root = tmp();
    write(root, 'facet.json', JSON.stringify({ journal: '.facet/journal', govern: { checks: { unit: 'node -e 0' } } }));
    write(root, 'facet.items.json', '{}');
    const f = (...a) => spawnSync(process.execPath, [CLI, ...a], { cwd: root, encoding: 'utf-8', env: { ...process.env, FACET_WRITER: 'ann' } });
    f('flow', 'open', 'A', '--route', '', '--force');
    write(root, '.work/A/order.md', block([c('C1', 'unit'), c('C2', '[user]')]));
    assert.match(f('criteria', 'check', '--item', 'A').stdout, /2 criteria .* pass the gate — not approved yet/);
    assert.notEqual(f('criteria', 'approve', '--item', 'A').status, 0, 'an approval needs a person');
    assert.equal(f('criteria', 'approve', '--item', 'A', '--by', 'ann').status, 0);
    const a = approvedCriteria(readJournal(path.join(root, '.facet', 'journal')), 'A');
    assert.deepEqual([a.criteria.length, a.by, a.hash], [2, 'ann', criteriaHash([c('C1', 'unit'), c('C2', '[user]')])]);
    write(root, '.work/A/order.md', block([c('C1', 'unit'), c('C2', '[user]', { text: 'something else' })]));
    const changed = f('criteria', 'check', '--item', 'A');
    assert.equal(changed.status, 1);
    assert.match(changed.stdout, /CHANGED since the approval by ann/);
    assert.equal(f('criteria', 'approve', '--item', 'A', '--by', 'ann').status, 0);
    assert.equal(readJournal(path.join(root, '.facet', 'journal')).filter((e) => e.kind === 'criterion').at(-1).replaces, a.hash);
    write(root, '.work/A/order.md', block([c('C1', 'unknown-tool')]));
    const bad = f('criteria', 'check', '--item', 'A');
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /"unknown-tool" is not a registered tool/);
});

test('template: the order handoff carries a criteria block that the handoff check accepts', () => {
    const tpl = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'order.md'), 'utf-8');
    assert.equal(readCriteria(tpl).found, true);
});
