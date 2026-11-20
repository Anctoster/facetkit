// Runs the test files in test/ with node --test. npm runs scripts through cmd.exe on Windows, which
// does not expand test/*.test.mjs, and Node 20's test runner does not expand it either; listing the
// files here works with every shell and every supported Node version. Extra arguments are passed on.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => path.join(dir, f));
if (!files.length) {
    console.error(`no test files in ${dir}`);
    process.exit(1);
}
const r = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
