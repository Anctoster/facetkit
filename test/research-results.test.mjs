import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { audit, cell, classify, contradictions, fill, validate } from '../scripts/research.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = (verdict, without, withRule, o = {}) => ({ facet: 's:f', model: 'M1 (self-reported), web', runs: 3, verdict, without: `${without} passed`, with: `${withRule} passed`, by: 'a', date: '2026-11-26', link: 'https://x/1', note: '', ...o });

test('research: the records are valid, RESULTS and READMEs are current, no field report contradicts the records', () => {
    const { problems, writes } = audit(ROOT);
    assert.deepEqual(problems, []);
    assert.deepEqual(writes.map((w) => `${w.f}: ${w.stale.join(', ')}`), [], 'run: npm run research');
});

test('research: a record whose verdict does not follow from its scores, or with a broken field, is an error', () => {
    const ids = new Set(['s:f']);
    assert.deepEqual(validate([r('confirmed', '0/3', '3/3')], ids), []);
    assert.match(validate([r('confirmed', '2/3', '2/3')], ids).join(), /"confirmed" but with the rule 2 is not above 2/);
    assert.match(validate([r('no difference', '0/3', '3/3')], ids).join(), /"no difference" but the scores differ by 3/);
    assert.match(validate([r('refuted', '1/3', '2/3')], ids).join(), /"refuted"/);
    assert.match(validate([r('confirmed', '0/5', '3/3')], ids).join(), /runs is 3/);
    assert.match(validate([r('works', '0/3', '3/3')], ids).join(), /not one of/);
    assert.match(validate([r('confirmed', '0/3', '3/3', { facet: 's:nope' })], ids).join(), /no such facet/);
    assert.match(validate([r('confirmed', '0/3', '3/3'), r('confirmed', '0/3', '3/3')], ids).join(), /duplicate/);
});

test('research: statuses follow the written criteria and are never raised beyond them', () => {
    const m2 = { model: 'M2, web' };
    assert.equal(classify([r('confirmed', '0/3', '3/3')]).status, 'INCONCLUSIVE', 'one model is not enough for SUPPORTED');
    assert.equal(classify([r('confirmed', '0/3', '3/3'), r('confirmed', '0/3', '2/3', m2)]).status, 'SUPPORTED');
    assert.equal(classify([r('confirmed', '0/3', '3/3'), r('no difference', '3/3', '3/3', m2)]).status, 'MIXED');
    assert.equal(classify([r('no difference', '0/3', '0/3'), r('no difference', '0/3', '0/3', m2)]).status, 'NOT_SUPPORTED');
    assert.equal(classify([r('no difference', '0/3', '0/3'), r('no difference', '3/3', '3/3', m2)]).status, 'INCONCLUSIVE', 'a ceiling shows nothing');
    assert.equal(cell(r('no difference', '3/3', '3/3'), 'en'), 'ceiling 3/3 → 3/3');
    assert.equal(cell(r('confirmed', '0/3', '2/3'), 'en'), '**confirmed** 0/3 → 2/3');
});

test('research: a hand-written table that disagrees with the records is named', () => {
    const recs = [r('confirmed', '0/3', '2/3', { facet: 'spec-trace:numbered-clauses', model: 'Gemma 4 31B, Duck.ai' })];
    const good = '| Facet | Gemma 4 31B |\n|---|---|\n| `numbered-clauses` | **confirmed** 0/3 → 2/3 |\n';
    const bad = good.replace('2/3 |', '3/3 |');
    assert.deepEqual(contradictions(good, recs), []);
    assert.match(contradictions(bad, recs, 'README.md').join(), /README.md: numbered-clauses on Gemma 4 31B says 0 → 3, the records say 0 → 2/);
    assert.throws(() => fill('<!-- research:typo -->1<!-- /research -->', recs, 'en', ROOT), /unknown research block "typo"/);
});
