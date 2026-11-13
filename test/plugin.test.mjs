import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = path.join(ROOT, 'plugin');
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));

test('plugin: plugin/ is generated from agents, commands and skills and is up to date', () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-plugin.mjs'), '--check'], { encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('plugin: only Markdown, the manifest and the licence — what the directory accepts from any publisher', () => {
    const rel = files(PLUGIN).map((f) => path.relative(PLUGIN, f));
    assert.deepEqual(rel.filter((f) => !f.endsWith('.md') && f !== 'LICENSE' && f !== path.join('.claude-plugin', 'plugin.json')), []);
    assert.ok(!fs.existsSync(path.join(PLUGIN, 'bin')));
    for (const f of files(PLUGIN)) assert.ok(!fs.readFileSync(f).includes(0), `${f}: NUL byte`);
    const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf-8'));
    assert.deepEqual(Object.keys(manifest).filter((k) => !['name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords'].includes(k)), []);
    assert.equal(manifest.version, JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).version);
});

test('plugin: the marketplace points at plugin/, and every agent and command says where `facet` comes from', () => {
    const market = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf-8'));
    assert.equal(market.plugins[0].source, './plugin');
    for (const dir of ['agents', 'commands']) for (const f of fs.readdirSync(path.join(PLUGIN, dir))) assert.match(fs.readFileSync(path.join(PLUGIN, dir, f), 'utf-8'), /npx --yes facetkit/, `${dir}/${f}`);
});
