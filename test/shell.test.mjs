import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { SAFE_ITEM, itemEnv, runCommand, withItem } from '../lib/shell.mjs';
import { run } from '../lib/thrift.mjs';
import { checkDecision } from '../lib/decisions.mjs';
import { tmp } from './helpers.mjs';

const node = JSON.stringify(process.execPath); // quoted: on Windows it lives under "Program Files"

test('shell: an item id becomes part of a command only when no shell can read it as more than a name', () => {
    assert.equal(withItem('npm test -- {item}', 'D1-02'), 'npm test -- D1-02');
    assert.equal(withItem('npm test', 'x; rm -rf ~'), 'npm test', 'no placeholder: the id is not used, nothing to refuse');
    for (const bad of ['x; rm -rf ~', 'a && b', '$(id)', '`id`', 'a|b', '../x', '-rf', '.hidden', 'a b', '%PATH%', 'a"b', '', null, 'x'.repeat(65)]) {
        assert.throws(() => withItem('check {item}', bad), /cannot be put into a command line/, String(bad));
    }
    assert.ok(SAFE_ITEM.test('V-014') && SAFE_ITEM.test('item_3.b'));
    // cmd.exe expands %FACET_ITEM% before parsing: an unsafe id never reaches the environment either
    assert.equal(itemEnv('A-1', {}).FACET_ITEM, 'A-1');
    assert.equal('FACET_ITEM' in itemEnv('x&calc', { FACET_ITEM: 'x&calc' }), false);
});

test('shell: the same command line runs on every platform, with spaces in the path and its exit code kept', () => {
    const dir = tmp();
    const sub = path.join(dir, 'folder with spaces');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'exit3.mjs'), 'process.exit(3)\n');
    const r = runCommand(`${node} "${path.join(sub, 'exit3.mjs')}"`, { cwd: dir });
    assert.equal(r.status, 3);
    assert.equal(runCommand(`${node} -e "console.log(40 + 2)"`, { cwd: dir }).stdout.trim(), '42');
});

test('shell: a decision measure and a check command go through the platform shell', async () => {
    const dir = tmp();
    const d = { id: 'D1', title: 't', measures: [{ run: `${node} -e "console.log(7)"`, max: 10 }, { run: `${node} -e "process.exit(1)"` }] };
    const c = checkDecision(dir, d);
    assert.equal(c.rows[0].holds, true);
    assert.equal(c.rows[1].holds, false);
    const r = await run(`${node} -e "process.exit(5)"`, { cwd: dir });
    assert.equal(r.exit, 5);
    const ok = await run(`${node} -e "console.log(process.env.FACET_ITEM)"`, { cwd: dir, env: { ...process.env, FACET_ITEM: 'A-1' }, logDir: path.join(dir, 'logs') });
    assert.equal(ok.exit, 0);
    assert.match(fs.readFileSync(ok.log, 'utf-8'), /A-1/);
});

test('shell: a timeout stops the command and what it started, not only the shell', async () => {
    const dir = tmp();
    const marker = path.join(dir, 'grandchild-alive');
    // the command starts a grandchild that writes the marker after 3 s; a kill of the shell alone would leave it running
    const child = `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'), 3000)`;
    const parent = `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(child)}], { stdio: 'inherit' }); setTimeout(() => {}, 10000)`;
    fs.writeFileSync(path.join(dir, 'parent.js'), parent);
    const started = Date.now();
    const r = await run(`${node} parent.js`, { cwd: dir, timeoutSec: 1 });
    assert.equal(r.exit, 124);
    assert.ok(Date.now() - started < 3000, 'returned at the timeout, not when the grandchild closed the pipe');
    await new Promise((resolve) => setTimeout(resolve, 3500));
    assert.equal(fs.existsSync(marker), false, 'the grandchild was stopped with the tree');
});

test('shell: when facet is interrupted, the command it started is stopped with it', { skip: process.platform === 'win32' && 'Windows has no process groups to escape Ctrl-C' }, async () => {
    const dir = tmp();
    const marker = path.join(dir, 'still-running');
    const lib = JSON.stringify(new URL('../lib/thrift.mjs', import.meta.url).href);
    // a facet-like process runs a long command, then is sent SIGINT; the command must not write its marker afterwards
    const cmd = `${node} -e "setTimeout(() => require('fs').writeFileSync(${JSON.stringify(marker).replace(/"/g, '\\"')}, 'x'), 2500)"`;
    const host = `import(${lib}).then((m) => m.run(${JSON.stringify(cmd)}, { cwd: ${JSON.stringify(dir)}, timeoutSec: 30 }))`;
    const { spawn } = await import('node:child_process');
    const p = spawn(process.execPath, ['--input-type=module', '-e', host], { stdio: 'ignore' });
    await new Promise((resolve) => setTimeout(resolve, 800));
    p.kill('SIGINT');
    await new Promise((resolve) => p.once('exit', resolve));
    await new Promise((resolve) => setTimeout(resolve, 3000));
    assert.equal(fs.existsSync(marker), false, 'the command outlived facet');
});
