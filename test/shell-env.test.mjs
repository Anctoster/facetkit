import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkDecision } from '../lib/decisions.mjs';
import { safeEnv } from '../lib/shell.mjs';
import { run } from '../lib/thrift.mjs';
import { tmp, write } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'facet.mjs');
const node = JSON.stringify(process.execPath);
const env = { PATH: '/bin', HOME: '/home/a', AWS_SECRET_ACCESS_KEY: 's3cr3t', GITHUB_TOKEN: 't0k3n', npm_config_cache: '/c', npm_token: 'x', FACET_KEY: '/home/a/.facet/keys/k.pem', FACET_WRITER: 'ann', JAVA_HOME: '/jdk' };

test('env: a command gets the base variables and what govern.env names — not tokens, credentials or the key path', () => {
    const base = safeEnv({ env, platform: 'linux' });
    assert.deepEqual(Object.keys(base).sort(), ['FACET_WRITER', 'HOME', 'JAVA_HOME', 'PATH']);
    const named = safeEnv({ env, allow: ['GITHUB_TOKEN', 'npm_config_*'], platform: 'linux' });
    assert.deepEqual(Object.keys(named).sort(), ['FACET_WRITER', 'GITHUB_TOKEN', 'HOME', 'JAVA_HOME', 'PATH', 'npm_config_cache']);
    assert.equal(safeEnv({ env, allow: ['FACET_KEY', 'FACET_*'], platform: 'linux' }).FACET_KEY, undefined, 'the key path is never handed over');
    const inherit = safeEnv({ env, allow: 'inherit', platform: 'linux' });
    assert.equal(inherit.AWS_SECRET_ACCESS_KEY, 's3cr3t', '"inherit" restores the old behaviour, visibly, in the configuration');
    assert.equal(inherit.FACET_KEY, undefined);
});

test('env: names compare without case on Windows, as its environment does', () => {
    const win = { Path: 'C:\\Windows', SystemRoot: 'C:\\Windows', ComSpec: 'cmd.exe', MyTool_Home: 'C:\\t' };
    assert.deepEqual(Object.keys(safeEnv({ env: win, platform: 'win32' })).sort(), ['ComSpec', 'Path', 'SystemRoot']);
    assert.deepEqual(Object.keys(safeEnv({ env: win, allow: ['MYTOOL_*'], platform: 'win32' })).sort(), ['ComSpec', 'MyTool_Home', 'Path', 'SystemRoot']);
    assert.deepEqual(Object.keys(safeEnv({ env: win, allow: ['MYTOOL_*'], platform: 'linux' })), [], 'elsewhere case matters');
});

test('env: a command run by facet does not see a secret in the environment of the process', async () => {
    const dir = tmp();
    const print = `${node} -e "console.log('seen=' + (process.env.FACET_TEST_SECRET || 'none'))"`;
    process.env.FACET_TEST_SECRET = 'do-not-leak';
    try {
        const r = await run(print, { cwd: dir, logDir: path.join(dir, 'logs') });
        assert.match(r.text, /seen=none/);
        const named = await run(print, { cwd: dir, logDir: path.join(dir, 'logs'), env: safeEnv({ allow: ['FACET_TEST_SECRET'] }) });
        assert.match(named.text, /seen=do-not-leak/);
        const d = checkDecision(dir, { id: 'D1', title: 't', measures: [{ run: `${node} -e "process.exit(process.env.FACET_TEST_SECRET ? 1 : 0)"` }] });
        assert.equal(d.rows[0].holds, true, 'a decision measure does not see it either');
    } finally {
        delete process.env.FACET_TEST_SECRET;
    }
});

test('cli: facet run passes only what govern.env allows', () => {
    const root = tmp();
    const cfg = (govern) => write(root, 'package.json', JSON.stringify({ facetkit: { govern } }));
    const f = () => spawnSync(process.execPath, [CLI, 'run', '--', process.execPath, '-e', "console.log('seen=' + (process.env.FACET_TEST_SECRET || 'none'))"], { cwd: root, encoding: 'utf-8', env: { ...process.env, FACET_TEST_SECRET: 'do-not-leak' } });
    cfg({});
    assert.match(f().stdout, /seen=none/);
    cfg({ env: ['FACET_TEST_SECRET'] });
    assert.match(f().stdout, /seen=do-not-leak/);
});
