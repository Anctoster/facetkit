import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { changedLines, maskNonCode, mutateLine, planMutants, probe } from '../lib/mutaprobe.mjs';
import { buildGraph, importsOf, isTest, neighbours } from '../lib/seams.mjs';
import { gitInit, tmp, write } from './helpers.mjs';

const PRICE = `export function total(price, qty, vip) {
    if (qty < 1) return 0;
    const base = price * qty;
    if (vip && base > 100) return base - 10;
    return base;
}
`;
const testFile = (asserts) => `import assert from 'node:assert/strict';\nimport { total } from './price.mjs';\n${asserts}\n`;
const WEAK = testFile("assert.equal(typeof total(10, 2, false), 'number');");
const STRONG = testFile(`assert.equal(total(10, 0, false), 0);
assert.equal(total(10, 1, false), 10);
assert.equal(total(10, 2, false), 20);
assert.equal(total(60, 2, true), 110);
assert.equal(total(50, 2, true), 100);
assert.equal(total(101, 1, true), 91);
assert.equal(total(60, 2, false), 120);`);

test('strings and comments are masked so operators are found in code only', () => {
    const line = `a === 'x < y' // b && c`;
    const masked = maskNonCode(line);
    assert.equal(masked.length, line.length, 'positions are preserved');
    assert.ok(masked.startsWith("a === '"));
    assert.ok(!masked.includes('<') && !masked.includes('&&'));
    assert.deepEqual(mutateLine(`const s = 'a && b';`), []);
    assert.deepEqual(mutateLine('// if (a < b) return true;'), []);
    assert.deepEqual(mutateLine("import { a } from './a.js';"), []);
});

test('each operator produces the expected mutant', () => {
    const ops = (line) => Object.fromEntries(mutateLine(line).map((m) => [m.op, m.after.trim()]));
    assert.equal(ops('if (a < b) {').compare, 'if (a >= b) {');
    assert.equal(ops('if (a === b) {').compare, 'if (a !== b) {');
    assert.equal(ops('if (a && b) {').logic, 'if (a || b) {');
    assert.equal(ops('const on = true;').boolean, 'const on = false;');
    assert.equal(ops('const c = a + b;').arith, 'const c = a - b;');
    assert.equal(ops('const max = 12;').number, 'const max = 13;');
    assert.equal(ops('if (!ready) {').negate, 'if (ready) {');
    assert.equal(ops('return a.b;').return, 'return undefined;');
    assert.equal(ops('    await save(record);').statement, ';');
    assert.equal(ops('const f = (a) => a;').compare, undefined, 'an arrow is not a comparison');
    assert.equal(ops('x += 1;').arith, undefined, 'compound assignment is left alone');
});

test('a weak test lets mutants survive; a strong test kills them all; the file is restored', () => {
    const root = tmp();
    write(root, 'price.mjs', PRICE);
    write(root, 'price.test.mjs', WEAK);
    const weak = probe({ cwd: root, files: ['price.mjs'], test: `"${process.execPath}" price.test.mjs`, max: 20 });
    assert.equal(weak.baseline, 'green');
    assert.ok(weak.survived.length >= 3, `weak test must leave survivors, got ${weak.survived.length}`);
    assert.ok(weak.score < 0.6);
    assert.equal(fs.readFileSync(path.join(root, 'price.mjs'), 'utf-8'), PRICE);

    write(root, 'price.test.mjs', STRONG);
    const strong = probe({ cwd: root, files: ['price.mjs'], test: `"${process.execPath}" price.test.mjs`, max: 20 });
    assert.deepEqual(strong.survived, []);
    assert.equal(strong.score, 1);
    assert.ok(strong.killed >= 6);
    assert.equal(fs.readFileSync(path.join(root, 'price.mjs'), 'utf-8'), PRICE);
});

test('the probe refuses to run on red tests and respects its limits', () => {
    const root = tmp();
    write(root, 'price.mjs', PRICE);
    write(root, 'price.test.mjs', testFile('assert.equal(total(1, 1, false), 999);'));
    assert.equal(probe({ cwd: root, files: ['price.mjs'], test: `"${process.execPath}" price.test.mjs` }).baseline, 'red');
    write(root, 'price.test.mjs', STRONG);
    const limited = probe({ cwd: root, files: ['price.mjs'], test: `"${process.execPath}" price.test.mjs`, max: 3 });
    assert.equal(limited.planned, 3);
    assert.ok(limited.total > 3);
    const noTime = probe({ cwd: root, files: ['price.mjs'], test: `"${process.execPath}" price.test.mjs`, max: 5, maxMinutes: -1 });
    assert.equal(noTime.notRun, 5);
    assert.equal(noTime.score, null);
});

test('with a git ref only changed lines are mutated', () => {
    const root = tmp();
    write(root, 'price.mjs', PRICE);
    gitInit(root);
    write(root, 'price.mjs', PRICE.replace('return base - 10;', 'return base - 15;'));
    assert.deepEqual([...changedLines(root, 'HEAD', 'price.mjs')], [4]);
    const { picked } = planMutants(root, ['price.mjs'], { ref: 'HEAD', max: 20 });
    assert.ok(picked.length > 0);
    assert.ok(picked.every((m) => m.line === 4));
    const kinds = new Set(planMutants(root, ['price.mjs'], { max: 4 }).picked.map((m) => m.op));
    assert.ok(kinds.size >= 3, 'a small sample still mixes operators');
});

test('imports are read from static, dynamic and require forms', () => {
    const specs = importsOf(`import a from './a';\nexport { b } from "../b.js";\nimport './side.css';\nconst c = await import('./c');\nconst d = require('./d');\nimport type { T } from './types';`);
    assert.deepEqual(specs.sort(), ['../b.js', './a', './c', './d', './side.css', './types'].sort());
    assert.ok(isTest('tests/unit/price.test.ts'));
    assert.ok(isTest('e2e/site.spec.ts'));
    assert.ok(!isTest('src/price.ts'));
});

test('neighbours finds consumers, providers, tests outside the slice and untested consumers', () => {
    const root = tmp();
    write(root, 'src/price.ts', "import { round } from './money';\nexport const total = (a: number) => round(a);\n");
    write(root, 'src/money.ts', 'export const round = (n: number) => Math.round(n);\n');
    write(root, 'src/cart.ts', "import { total } from './price.js';\nexport const cart = () => total(1);\n");
    write(root, 'src/invoice.ts', "import { total } from './price';\nexport const invoice = () => total(2);\n");
    write(root, 'src/page.tsx', "import { cart } from './cart';\nexport const Page = () => cart();\n");
    write(root, 'src/unrelated.ts', 'export const u = 1;\n');
    write(root, 'tests/price.test.ts', "import { total } from '../src/price';\n");
    write(root, 'tests/cart.test.ts', "import { cart } from '../src/cart';\n");
    write(root, 'tests/page.test.ts', "import { Page } from '../src/page';\n");
    write(root, 'tests/unrelated.test.ts', "import { u } from '../src/unrelated';\n");
    const graph = buildGraph(root, ['src', 'tests']);
    assert.deepEqual(graph.imports.get('src/cart.ts'), ['src/price.ts'], 'a .js specifier resolves to the .ts file');
    const n = neighbours(graph, ['src/price.ts', 'README.md'], { depth: 2, own: ['tests/price.test.ts'] });
    assert.deepEqual(n.changed, ['src/price.ts']);
    assert.deepEqual(n.unknown, ['README.md']);
    assert.deepEqual(n.consumers, ['src/cart.ts', 'src/invoice.ts']);
    assert.deepEqual(n.providers, ['src/money.ts']);
    assert.deepEqual(n.neighbourTests, ['tests/cart.test.ts']);
    assert.deepEqual(n.untestedConsumers, ['src/invoice.ts']);
    assert.deepEqual(neighbours(graph, ['src/price.ts'], { depth: 3, own: ['tests/price.test.ts'] }).neighbourTests, ['tests/cart.test.ts', 'tests/page.test.ts']);
});
