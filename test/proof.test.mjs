import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluate, gate } from '../lib/govern.mjs';
import { createProof, proofDigest, sourceState, verifyProof } from '../lib/proof.mjs';
import { gitInit, story, tmp, write } from './helpers.mjs';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');
const VERIFIED = { project: { journalIntact: true } };
function passed(src) {
    const s = story();
    s.open('A', [{ id: 'build', agent: 'builder', phase: 'build' }, { id: 'proof', agent: 'inspector', phase: 'proof', verdict: true }]);
    s.run('A', 'build', 'builder');
    s.say({ kind: 'step.start', item: 'A', step: 'proof', agent: 'inspector' });
    s.say({ kind: 'evidence', item: 'A', name: 'scan', ok: true, value: 0, approvals: [], src });
    s.say({ kind: 'step.end', item: 'A', step: 'proof', agent: 'inspector', status: 'DONE' });
    s.say({ kind: 'verdict', item: 'A', verdict: 'PASS', fixes: [] });
    return s.events;
}

test('govern: what nobody established does not pass — an unverified journal blocks, and cannot be waived away', () => {
    const events = passed();
    const unknown = evaluate(events, 'A');
    assert.equal(unknown.level, 0);
    assert.equal(unknown.results.find((r) => r.id === 'journal-intact').unknown, true);
    assert.equal(gate(unknown).allow, false);
    assert.equal(evaluate(events, 'A', { project: { journalIntact: false } }).level, 0);
    assert.equal(evaluate(events, 'A', VERIFIED).level, 1);
    const waived = evaluate([...events, { kind: 'waiver', item: 'A', rule: 'journal-intact', reason: 'in a hurry', at: '2026-01-05T12:00:00.000Z' }], 'A');
    assert.equal(waived.level, 0, 'a waiver never raises the level');
    assert.equal(gate(waived).allow, false, 'an unknown is established, not waived');
});

test('proof: the source state follows content — committing changes nothing, editing changes everything', () => {
    const root = tmp();
    write(root, 'src/a.mjs', 'export const a = 1;\n');
    write(root, '.work/journal.jsonl', '');
    gitInit(root);
    const first = sourceState(root);
    write(root, 'src/b.mjs', 'export const b = 2;\n');
    const edited = sourceState(root);
    assert.notEqual(edited.state, first.state);
    assert.deepEqual(edited.dirty.map((d) => d.path), ['src/b.mjs']);
    gitInit(root); // commits the same content
    assert.equal(sourceState(root).state, edited.state, 'a commit of the same content is the same state');
    write(root, '.work/journal.jsonl', '{"kind":"note"}\n');
    assert.equal(sourceState(root).state, edited.state, 'records about the work are not the work');
    const bare = tmp();
    write(bare, 'x.txt', 'x');
    assert.equal(sourceState(bare).git, false);
    assert.equal(sourceState(bare).files, 1);
});

test('proof: evidence measured on other sources is stale; a proof pack is VALID only for its own state', () => {
    const root = tmp();
    write(root, 'src/a.mjs', 'export const a = 1;\n');
    gitInit(root);
    const src = sourceState(root).state;
    const events = passed(src);
    const m = createProof(root, events, 'A', VERIFIED);
    assert.equal(m.level, 'L1 reproduced');
    assert.equal(m.source.state, src);
    assert.equal(verifyProof(root, events, m, VERIFIED).status, 'VALID');
    assert.equal(verifyProof(root, events, m).status, 'UNKNOWN', 'without a verified journal nothing is confirmed');
    assert.equal(verifyProof(root, events, { ...m, level: 'L4 calibrated' }, VERIFIED).status, 'TAMPERED');
    const forged = { ...m, level: 'L4 calibrated' };
    assert.equal(verifyProof(root, events, { ...forged, digest: proofDigest(forged) }, VERIFIED).status, 'MISMATCH', 're-signing a forged manifest does not make the journal agree');
    const clone = tmp();
    write(clone, 'src/a.mjs', 'export const a = 1;\n');
    assert.equal(verifyProof(clone, events, m, VERIFIED).status, 'VALID', 'another copy with the same sources confirms it');
    write(root, 'src/a.mjs', 'export const a = 2;\n');
    const after = verifyProof(root, events, m, VERIFIED);
    assert.equal(after.status, 'STALE');
    assert.match(after.reasons[0], /src\/a\.mjs/);
    const now = evaluate(events, 'A', { ...VERIFIED, source: sourceState(root).state });
    assert.equal(now.evidence.scan.stale, true);
    assert.equal(now.level, 0, 'a proof of the old state does not carry over to the new one');
});

test('facet proof: create, verify, and STALE after an edit — through the command line', () => {
    const root = tmp();
    write(root, 'src/a.mjs', 'export const a = 1;\n');
    write(root, 'package.json', '{"name":"p","version":"1.0.0"}\n');
    gitInit(root);
    const facet = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf-8' });
    assert.equal(facet('flow', 'open', 'P1').status, 0);
    const made = facet('proof', 'create', '--item', 'P1');
    assert.equal(made.status, 0, made.stderr);
    assert.match(made.stdout, /L0 claimed/);
    assert.equal(facet('proof', 'verify', '--item', 'P1').status, 0);
    write(root, 'src/a.mjs', 'export const a = 3;\n');
    const stale = facet('proof', 'verify', '--item', 'P1');
    assert.equal(stale.status, 1);
    assert.match(stale.stdout, /STALE/);
    fs.appendFileSync(path.join(root, '.work', 'journal.jsonl'), '{"kind":"note","te');
    assert.match(facet('proof', 'status', '--item', 'P1').stdout, /UNKNOWN/);
    assert.equal(facet('journal').status, 1);
    assert.match(facet('journal', 'repair').stdout, /set aside/);
    assert.equal(facet('journal').status, 0);
});
