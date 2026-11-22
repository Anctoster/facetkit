#!/usr/bin/env node
// release-prepare: what a release pull request changes, done by one command (RELEASING.md).
//
//   npm run release:prepare <version> [-- --date YYYY-MM-DD]
//
// 1. the version in package.json, and the plugin folder built from it;
// 2. the READMEs' numbers recounted from their sources — one source of truth, scripts/counts.mjs, for both;
// 3. changelog.d/ gathered into the dated section of <version> in CHANGELOG.md, the fragments removed only
//    after CHANGELOG.md was written and read back;
// 4. scripts/release-check.mjs v<version>: anything still off is an error.
// Run twice, it changes nothing the second time.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
const at = process.argv.indexOf('--date');
const date = at > 0 ? process.argv[at + 1] : new Date().toISOString().slice(0, 10);
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('usage: npm run release:prepare <version> [-- --date YYYY-MM-DD]');
    process.exit(2);
}
const step = (what, args) => {
    const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) {
        console.error(`release:prepare: ${what} failed — nothing after it was done`);
        process.exit(r.status ?? 1);
    }
};
const pkgFile = path.join(ROOT, 'package.json');
const pkg = fs.readFileSync(pkgFile, 'utf-8');
fs.writeFileSync(pkgFile, pkg.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`));
step('the plugin folder', ['scripts/build-plugin.mjs']);
step('the READMEs\' numbers', ['scripts/counts.mjs']);
step('the changelog', ['scripts/changelog.mjs', 'release', version, '--date', date]);
step('the release check', ['scripts/release-check.mjs', `v${version}`]);
console.log(`release:prepare: ${version} is ready — commit, open the release pull request (branch release/${version}), merge, then tag the merge commit on main`);
