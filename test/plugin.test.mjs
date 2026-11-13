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

test('plugin: only Markdown, the manifest, the licence and the icon — what the directory accepts from any publisher', () => {
    const rel = files(PLUGIN).map((f) => path.relative(PLUGIN, f));
    const allowed = ['LICENSE', path.join('.claude-plugin', 'plugin.json'), path.join('.claude-plugin', 'icon.png')];
    assert.deepEqual(rel.filter((f) => !f.endsWith('.md') && !allowed.includes(f)), []);
    assert.ok(!fs.existsSync(path.join(PLUGIN, 'bin')));
    const icon = fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'icon.png'));
    assert.equal(icon.subarray(1, 4).toString(), 'PNG');
    const [w, h] = [icon.readUInt32BE(16), icon.readUInt32BE(20)];
    assert.ok(w === h && w >= 512 && w <= 2048 && icon.length < 2 * 1024 * 1024, `icon: ${w}×${h}, ${icon.length} B — the directory wants a square PNG of 512–2048 px under 2 MB`);
    for (const f of files(PLUGIN).filter((x) => !x.endsWith('.png'))) assert.ok(!fs.readFileSync(f).includes(0), `${f}: NUL byte`);
    const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf-8'));
    assert.deepEqual(Object.keys(manifest).filter((k) => !['name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords'].includes(k)), []);
    assert.equal(manifest.version, JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).version);
});

test('plugin: the marketplace points at plugin/, and every agent and command says where `facet` comes from', () => {
    const market = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf-8'));
    assert.equal(market.plugins[0].source, './plugin');
    for (const dir of ['agents', 'commands']) for (const f of fs.readdirSync(path.join(PLUGIN, dir))) assert.match(fs.readFileSync(path.join(PLUGIN, dir, f), 'utf-8'), /npx --yes facetkit@/, `${dir}/${f}`);
});

test('plugin: every package launcher and install names an exact version (the directory blocks unpinned npx)', () => {
    const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).version;
    for (const f of files(PLUGIN)) {
        const text = fs.readFileSync(f, 'utf-8');
        for (const m of text.matchAll(/\b(?:npx|bunx|pnpm dlx|yarn dlx|npm i(?:nstall)?(?: -g)?)\b[^`\n]*?\bfacetkit(@[^\s`]*)?/g)) assert.equal(m[1], `@${version}`, `${path.relative(PLUGIN, f)}: ${m[0]}`);
    }
});

test('plugin: a front-matter value with ": " or " #" is quoted, so YAML cannot misread it', () => {
    for (const f of files(PLUGIN).filter((x) => x.endsWith('.md'))) {
        const head = /^---\n([\s\S]*?)\n---\n/.exec(fs.readFileSync(f, 'utf-8'))?.[1] ?? '';
        for (const line of head.split('\n')) {
            const value = /^[\w-]+: (.*)$/.exec(line)?.[1] ?? '';
            if (/^["'[{>|]/.test(value)) continue;
            assert.ok(!/: | #/.test(value), `${path.relative(PLUGIN, f)}: ${line.slice(0, 80)}`);
        }
    }
});
