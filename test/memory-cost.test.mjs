import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { attribute, costReport, fold, parseTranscript, price, renderCost } from '../lib/cost.mjs';
import { condition, credit, loadMemory, recall, remember, utility } from '../lib/memory.mjs';
import { story, tmp, write, STEPS } from './helpers.mjs';

test('memory: needs a kind, a territory and one sentence; near-duplicates are refused', () => {
    const root = tmp();
    const file = path.join(root, 'memory.jsonl');
    assert.equal(remember(file, { kind: 'rumour', text: 'x', about: ['a'] }).ok, false);
    assert.equal(remember(file, { kind: 'fact', text: 'x', about: [] }).ok, false);
    assert.equal(remember(file, { kind: 'fact', text: 'word '.repeat(60), about: ['a'] }).ok, false);
    assert.equal(remember(file, { kind: 'pitfall', text: 'The SSE route must stay outside the compression middleware.', about: ['server/**'] }, { root }).ok, true);
    const twin = remember(file, { kind: 'pitfall', text: 'The SSE route must stay outside of the compression middleware!', about: ['server/**'] }, { root });
    assert.equal(twin.ok, false);
    assert.match(twin.reason, /already known/);
    assert.equal(loadMemory(file).length, 1);
});

test('memory: recalled only inside its territory, best first, within the budget', () => {
    const root = tmp();
    const file = path.join(root, 'memory.jsonl');
    remember(file, { kind: 'pitfall', text: 'Server routes read DATA_DIR at import time, set it before importing.', about: ['server/**'] }, { root });
    remember(file, { kind: 'how', text: 'Locale keys are added to all three locale files in the same commit.', about: ['src/i18n/**', 'i18n'] }, { root });
    remember(file, { kind: 'fact', text: 'The viewer disposes geometries on unmount through a shared helper.', about: ['src/components/viewer/**'] }, { root });
    assert.deepEqual(recall(file, { files: ['docs/readme.md'], root }).used, []);
    assert.equal(recall(file, { files: ['server/routes/leads.js'], root }).used.length, 1);
    assert.equal(recall(file, { topics: ['i18n'], root }).used[0].kind, 'how');
    const tight = recall(file, { files: ['server/x.js', 'src/i18n/pl.json', 'src/components/viewer/A.tsx'], budgetWords: 25, root });
    assert.equal(tight.used.length, 2);
    assert.equal(tight.skipped, 1);
    assert.equal(loadMemory(file).find((m) => m.kind === 'pitfall').uses, 2);
});

test('memory: an anchored memory goes stale when the code it points at changes', () => {
    const root = tmp();
    const file = path.join(root, 'memory.jsonl');
    write(root, 'server/index.js', 'a\nuse(compression)\nuse(sse)\n');
    const r = remember(file, { kind: 'decision', text: 'Compression is registered before the event stream on purpose.', about: ['server/**'], anchor: 'server/index.js:2-3' }, { root });
    assert.match(r.entry.anchor, /^server\/index\.js:2-3#[0-9a-f]{8}$/);
    assert.equal(recall(file, { files: ['server/index.js'], root }).used.length, 1);
    write(root, 'server/index.js', 'a\nuse(sse)\nuse(compression)\n');
    const after = recall(file, { files: ['server/index.js'], root });
    assert.deepEqual([after.used.length, after.stale.length], [0, 1]);
    assert.equal(condition(loadMemory(file)[0], root), 'stale');
    assert.equal(remember(file, { kind: 'fact', text: 'Anchored to nothing at all.', about: ['x'], anchor: 'nope.js:1-2' }, { root }).ok, false);
});

test('memory: credited by outcomes; retired after five chances without helping', () => {
    const root = tmp();
    const file = path.join(root, 'memory.jsonl');
    const { entry } = remember(file, { kind: 'how', text: 'Run the migration on a copy first.', about: ['deploy/**'] }, { root });
    credit(file, [entry.id], true);
    assert.equal(utility(loadMemory(file)[0]), 2 / 3);
    let retired = [];
    for (let i = 0; i < 12; i++) retired = [...retired, ...credit(file, [entry.id], false).retired];
    assert.deepEqual(retired, [entry.id]);
    assert.equal(recall(file, { files: ['deploy/vis.sh'], root }).used.length, 0);
});

const line = (o) => JSON.stringify(o);
const msg = (id, at, usage, extra = {}) => line({ type: 'assistant', timestamp: at, isSidechain: false, ...extra, message: { id, model: extra.model ?? 'claude-sonnet-5', usage } });

test('cost: streamed duplicates count once; usage is attributed to the step it happened in', () => {
    const root = tmp();
    const s = story('2026-01-05T09:00:00.000Z');
    s.open('A', STEPS);
    s.run('A', 'map', 'mapper', { model: 'haiku' }); // 09:02 → 09:12
    s.run('A', 'build', 'builder', { status: 'BLOCKED' }); // 09:13 → 09:23
    const u = (i, o) => ({ input_tokens: i, output_tokens: o, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 });
    write(root, 't.jsonl', [
        msg('m1', '2026-01-05T08:00:00.000Z', u(10, 10)),
        msg('m2', '2026-01-05T09:05:00.000Z', u(100, 50), { isSidechain: true, model: 'claude-haiku-5' }),
        msg('m2', '2026-01-05T09:05:00.100Z', u(100, 50), { isSidechain: true, model: 'claude-haiku-5' }),
        msg('m3', '2026-01-05T09:06:00.000Z', u(20, 5)),
        msg('m4', '2026-01-05T09:15:00.000Z', u(300, 200), { isSidechain: true }),
        'not json at all',
        line({ type: 'user', timestamp: '2026-01-05T09:16:00.000Z', message: { content: 'the word "usage" in text' } }),
    ].join('\n'));
    const usage = parseTranscript(path.join(root, 't.jsonl'));
    assert.equal(usage.length, 4);
    const rows = attribute(usage, s.events);
    assert.deepEqual(rows.map((r) => [r.step, r.agent]), [['outside', 'orchestrator'], ['map', 'mapper'], ['orchestrator', 'orchestrator'], ['build', 'builder']]);
    const folded = fold(rows, 't.jsonl');
    assert.equal(folded.length, 4);
    const r = costReport(folded, s.events);
    assert.equal(r.total.tokens, 10 + 10 + 150 + 25 + 500 + 4000);
    assert.equal(r.byAgent.builder.tokens, 1500);
    assert.equal(r.shares.wasted, +(1500 / r.total.tokens).toFixed(3));
    assert.equal(r.money, null);
    assert.match(renderCost(r), /no price table: tokens only/);
    assert.equal(price({ model: 'claude-haiku-5', input: 1e6, output: 1e6 }, { haiku: { input: 1, output: 5 } }), 6);
    assert.equal(price({ model: 'other' }, { haiku: { input: 1 } }), null);
});

test('cost: without a transcript the tokens reported at the end of a step are used', () => {
    const s = story();
    s.item('A', { tokens: { mapper: 1000, builder: 5000, inspector: 2000 } });
    const r = costReport([], s.events);
    assert.equal(r.total.tokens, 8000);
    assert.equal(r.reportedOnly, 8000);
    assert.deepEqual([r.items.closed, r.items.passedFirst, r.items.tokensPerClosed], [1, 1, 8000]);
    assert.ok(fs.existsSync(tmp()));
});
