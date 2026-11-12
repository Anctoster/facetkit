import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { seal, verify } from '../lib/capsule.mjs';
import { EXIT_CAP, digest, excerpt, ledgerStatus, readLedger, repeatedFailures, run } from '../lib/thrift.mjs';
import { tmp, write } from './helpers.mjs';

const node = (code) => [process.execPath, '-e', code];

test('run returns a short digest and keeps the full output in a log', async () => {
    const root = tmp();
    const ledger = path.join(root, 'ledger.jsonl');
    const r = await run(node("for (let i = 0; i < 500; i++) console.log('line ' + i); console.error('Error: boom at step 7'); process.exitCode = 2"), { cwd: root, ledger, logDir: path.join(root, 'logs') });
    assert.equal(r.exit, 2);
    assert.match(r.text, /→ exit 2/);
    assert.match(r.text, /501 lines/);
    assert.match(r.text, /Error: boom at step 7/);
    assert.ok(r.text.split('\n').length < 20, 'digest stays small');
    assert.equal(fs.readFileSync(r.log, 'utf-8').split('\n').filter(Boolean).length, 501);
    const [entry] = readLedger(ledger);
    assert.equal(entry.exit, 2);
    assert.ok(entry.saved > entry.tokens, 'most of the output stayed out of the context');
});

test('a successful run shows no signal block', async () => {
    const r = await run(node("console.log('ok')"), { cwd: tmp() });
    assert.equal(r.exit, 0);
    assert.ok(!r.text.includes('signal:'));
});

test('a command that hangs is killed at the timeout', async () => {
    const r = await run(node('setTimeout(() => {}, 60000)'), { cwd: tmp(), timeoutSec: 1 });
    assert.equal(r.exit, 124);
    assert.match(r.text, /timeout 1s/);
});

test('a missing command reports 127 instead of throwing', async () => {
    const r = await run(['definitely-not-a-command-xyz'], { cwd: tmp() });
    assert.equal(r.exit, 127);
});

test('caps stop further runs with exit 3', async () => {
    const root = tmp();
    const ledger = path.join(root, 'ledger.jsonl');
    await run(node('0'), { cwd: root, ledger, caps: { runs: 2 } });
    await run(node('0'), { cwd: root, ledger, caps: { runs: 2 } });
    const third = await run(node("require('fs').writeFileSync('ran.txt','x')"), { cwd: root, ledger, caps: { runs: 2 } });
    assert.equal(third.exit, EXIT_CAP);
    assert.match(third.text, /BUDGET EXCEEDED: runs/);
    assert.ok(!fs.existsSync(path.join(root, 'ran.txt')), 'the command must not run');
    assert.equal(ledgerStatus(readLedger(ledger), { runs: 2 }).exceeded, 'runs');
    assert.equal(ledgerStatus(readLedger(ledger), { tokens: 1 }).exceeded, 'tokens');
    assert.equal(ledgerStatus(readLedger(ledger), {}).exceeded, null);
});

test('the same failing command three times in a row is refused as a loop', async () => {
    const root = tmp();
    const ledger = path.join(root, 'ledger.jsonl');
    const failing = node('process.exit(1)');
    for (let i = 0; i < 3; i++) assert.equal((await run(failing, { cwd: root, ledger })).exit, 1);
    assert.equal(repeatedFailures(readLedger(ledger), failing.join(' ')), 3);
    const fourth = await run(failing, { cwd: root, ledger });
    assert.equal(fourth.exit, EXIT_CAP);
    assert.match(fourth.text, /LOOP/);
    // a different command in between resets the streak
    await run(node('0'), { cwd: root, ledger });
    assert.equal((await run(failing, { cwd: root, ledger })).exit, 1);
});

test('digest keeps signal lines with their numbers and the tail', () => {
    const d = digest(['a', 'b', 'TypeError: x is not a function', '    at foo (src/a.ts:10:5)', 'c', 'd'].join('\n'), { tail: 2 });
    assert.deepEqual(d.signal.map((l) => l.split(':')[0]), ['3', '4']);
    assert.deepEqual(d.tail, ['5: c', '6: d']);
});

test('excerpt returns the asked range, numbered and bounded', () => {
    const root = tmp();
    write(root, 'f.txt', Array.from({ length: 300 }, (_, i) => `row ${i + 1}`).join('\n'));
    const r = excerpt(path.join(root, 'f.txt'), 10, 12);
    assert.equal(r.text, '   10  row 10\n   11  row 11\n   12  row 12');
    const big = excerpt(path.join(root, 'f.txt'), 1, 300, { max: 50 });
    assert.equal(big.to, 50);
    assert.equal(big.cut, true);
});

test('capsule: seal adds hashes, verify tells ok, moved, drifted, missing and unsealed apart', () => {
    const root = tmp();
    const code = ['function a() {', '  return 1;', '}', '', 'function b() {', '  return 2;', '}'].join('\n');
    write(root, 'src/x.ts', code);
    write(root, 'src/y.ts', 'export const y = 1;\n');
    const handoff = 'See `src/x.ts:1-3`, `src/x.ts:5-7`, `src/y.ts:1` and `src/gone.ts:1-2`. Not an anchor: `npm run build`.';
    const sealed = seal(handoff, root);
    assert.equal(sealed.sealed, 3);
    assert.deepEqual(sealed.broken, ['src/gone.ts:1-2']);
    assert.match(sealed.text, /`src\/x\.ts:1-3#[0-9a-f]{8}`/);
    assert.ok(sealed.text.includes('`npm run build`'));
    assert.deepEqual(verify(sealed.text, root).map((r) => r.state), ['ok', 'ok', 'ok', 'unsealed']);

    // a() changes; b() moves down two lines unchanged; y.ts is deleted
    write(root, 'src/x.ts', ['// header', '', 'function a() {', '  return 100;', '}', '', 'function b() {', '  return 2;', '}'].join('\n'));
    fs.rmSync(path.join(root, 'src/y.ts'));
    const after = verify(sealed.text, root);
    assert.equal(after[0].state, 'drifted');
    assert.deepEqual([after[1].state, after[1].to], ['moved', 'src/x.ts:7-9']);
    assert.equal(after[2].state, 'missing');
});

test('capsule ignores trailing whitespace changes', () => {
    const root = tmp();
    write(root, 'a.js', 'const a = 1;\nconst b = 2;\n');
    const sealed = seal('`a.js:1-2`', root).text;
    write(root, 'a.js', 'const a = 1;   \nconst b = 2;\t\n');
    assert.equal(verify(sealed, root)[0].state, 'ok');
});
