import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { buildAtlas, card, findSymbol } from '../lib/atlas.mjs';
import { isTestFile, langOf } from '../lib/lang.mjs';
import { mutateLine, probe } from '../lib/mutaprobe.mjs';
import { buildGraph, neighbours } from '../lib/seams.mjs';
import { trace } from '../lib/trace.mjs';
import { tmp, write } from './helpers.mjs';

const has = (cmd, ...args) => spawnSync(cmd, args, { encoding: 'utf-8' }).status === 0;

test('languages: sources and tests are told apart by each language\'s own convention', () => {
    assert.deepEqual(['a.ts', 'a.py', 'a.go', 'A.java', 'a.rb'].map((f) => langOf(f)?.id ?? null), ['js', 'py', 'go', 'java', null]);
    for (const f of ['src/a.test.ts', 'tests/test_price.py', 'pkg/price_test.go', 'src/test/java/shop/PriceTest.java', 'app/price_test.py']) assert.equal(isTestFile(f), true, f);
    for (const f of ['src/a.ts', 'shop/price.py', 'tests/conftest.py', 'pkg/price.go', 'src/main/java/shop/Price.java', 'README.md']) assert.equal(isTestFile(f), false, f);
});

function pythonProject() {
    const root = tmp();
    write(root, 'shop/__init__.py', '');
    write(root, 'shop/price.py', 'TAX = 0.23\n\ndef total(price, qty, member):\n    amount = price * qty\n    if member and amount > 100:\n        return amount - 10\n    return amount\n\ndef _private():\n    return 1\n');
    write(root, 'shop/cart.py', 'from .price import total\nfrom shop import labels\n\ndef cart(items):\n    return sum(total(i["p"], i["q"], False) for i in items)\n');
    write(root, 'shop/labels.py', 'TITLE = "Total"\n');
    write(root, 'tests/test_cart.py', 'from shop.cart import cart\n\ndef test_cart():\n    assert cart([{"p": 2, "q": 3}]) == 6  # [R1]\n\nif __name__ == "__main__":\n    test_cart()\n');
    write(root, 'spec.md', '- R1: a cart sums price times quantity (verify: test)\n- R2: members get 10 off above 100 (verify: test)\n');
    return root;
}

test('python: relative and absolute imports, tests behind a file, exports, clause trace', () => {
    const root = pythonProject();
    const g = buildGraph(root, ['shop', 'tests']);
    assert.deepEqual(g.imports.get('shop/cart.py'), ['shop/price.py', 'shop/labels.py']);
    assert.deepEqual(g.imports.get('tests/test_cart.py'), ['shop/cart.py']);
    const n = neighbours(g, ['shop/price.py']);
    assert.deepEqual([n.consumers, n.neighbourTests], [['shop/cart.py'], ['tests/test_cart.py']]);
    const a = buildAtlas(root, ['shop', 'tests'], { withHistory: false });
    assert.deepEqual(a.files['shop/price.py'].exports.map((e) => e.name), ['TAX', 'total']);
    assert.deepEqual(findSymbol(a, 'total')[0].users, ['shop/cart.py']);
    assert.match(card(a, ['shop/price.py']).text, /used by shop\/cart\.py: total/);
    const t = trace(root, { spec: ['spec.md'], tests: ['tests'] });
    assert.deepEqual([Object.keys(t.claims), t.uncovered.map((c) => c.id)], [['R1'], ['R2']]);
});

test('python: mutation operators speak Python, and the probe finds what the tests do not check', { skip: !has('python3', '--version') }, () => {
    assert.deepEqual(mutateLine('    if member and amount > 100:', 'a.py').map((m) => m.after.trim()), ['if member and amount <= 100:', 'if member or amount > 100:', 'if member and amount > 101:']);
    assert.deepEqual(mutateLine('    return not ok  # not a comment mutation', 'a.py').map((m) => m.op), ['negate', 'return']);
    assert.deepEqual(mutateLine('def total(price, qty):', 'a.py'), []);
    assert.deepEqual(mutateLine('    flag = True', 'a.py')[0].after.trim(), 'flag = False');
    const root = pythonProject();
    const r = probe({ cwd: root, files: ['shop/price.py'], test: 'PYTHONPATH=. python3 tests/test_cart.py', max: 8, timeoutSec: 30 });
    assert.equal(r.baseline, 'green', r.message);
    assert.ok(r.killed >= 1, 'breaking the multiplication is noticed');
    assert.ok(r.survived.some((m) => /100|10\b|member/.test(m.before)), 'the member discount is not tested, so its mutants survive');
});

function goProject() {
    const root = tmp();
    write(root, 'go.mod', 'module example.com/shop\n\ngo 1.21\n');
    write(root, 'price/price.go', 'package price\n\n// Total is price times quantity.\nfunc Total(p, q int) int {\n\tif q > 10 {\n\t\treturn p*q - 5\n\t}\n\treturn p * q\n}\n\nfunc helper() int { return 1 }\n');
    write(root, 'price/price_test.go', 'package price\n\nimport "testing"\n\nfunc TestTotal(t *testing.T) {\n\tif Total(2, 3) != 6 {\n\t\tt.Fatal("want 6")\n\t}\n}\n');
    write(root, 'cart/cart.go', 'package cart\n\nimport (\n\t"fmt"\n\n\t"example.com/shop/price"\n)\n\nfunc Sum(p, q int) string { return fmt.Sprint(price.Total(p, q)) }\n');
    return root;
}

test('go: packages are directories, the module path comes from go.mod, a test reaches its package without importing it', () => {
    const root = goProject();
    const g = buildGraph(root, ['price', 'cart']);
    assert.deepEqual(g.imports.get('cart/cart.go'), ['price/price.go']);
    assert.deepEqual(g.imports.get('price/price_test.go'), ['price/price.go']);
    const n = neighbours(g, ['price/price.go']);
    assert.deepEqual([n.consumers, n.neighbourTests, n.untestedConsumers], [['cart/cart.go'], ['price/price_test.go'], ['cart/cart.go']]);
    const a = buildAtlas(root, ['price', 'cart'], { withHistory: false });
    assert.deepEqual(a.files['price/price.go'].exports.map((e) => e.name), ['Total']);
    assert.deepEqual(mutateLine('\tif q > 10 {', 'a.go').map((m) => m.after.trim()), ['if q <= 10 {', 'if q > 11 {']);
    assert.deepEqual(mutateLine('\treturn "a" + b', 'a.go'), [], 'string concatenation is left alone: the compiler would catch it, not a test');
    assert.deepEqual(mutateLine('\treturn p*q - 5', 'a.go').map((m) => m.op), ['arith', 'number']);
});

test('go: the probe runs against go test', { skip: !has('go', 'version') }, () => {
    const root = goProject();
    const r = probe({ cwd: root, files: ['price/price.go'], test: 'go test ./price/', max: 4, timeoutSec: 120, maxMinutes: 4 });
    assert.equal(r.baseline, 'green', r.message);
    assert.ok(r.planned >= 2 && r.killed + r.survived.length + r.notRun === r.planned);
    assert.ok(r.survived.some((m) => /q > 10|- 5/.test(m.before)), 'the branch for large quantities has no test');
});

test('java: imports resolve under any source root; a test class reaches the class it is named after', () => {
    const root = tmp();
    write(root, 'src/main/java/shop/Price.java', 'package shop;\n\npublic final class Price {\n    public static int total(int p, int q) {\n        return p * q;\n    }\n}\n');
    write(root, 'src/main/java/shop/cart/Cart.java', 'package shop.cart;\n\nimport shop.Price;\nimport static shop.Price.total;\nimport java.util.List;\n\npublic class Cart {\n    int sum(int p, int q) { return Price.total(p, q); }\n}\n');
    write(root, 'src/test/java/shop/PriceTest.java', 'package shop;\n\nclass PriceTest {\n    void multiplies() { assert Price.total(2, 3) == 6; } // [R1]\n}\n');
    const g = buildGraph(root, ['src']);
    assert.deepEqual(g.imports.get('src/main/java/shop/cart/Cart.java'), ['src/main/java/shop/Price.java']);
    assert.deepEqual(g.imports.get('src/test/java/shop/PriceTest.java'), ['src/main/java/shop/Price.java']);
    const n = neighbours(g, ['src/main/java/shop/Price.java']);
    assert.deepEqual([n.consumers, n.neighbourTests], [['src/main/java/shop/cart/Cart.java'], ['src/test/java/shop/PriceTest.java']]);
    const a = buildAtlas(root, ['src'], { withHistory: false });
    assert.deepEqual(a.files['src/main/java/shop/Price.java'].exports, [{ name: 'Price', kind: 'class', line: 3 }]);
    assert.deepEqual(mutateLine('        return p * q;', 'A.java'), [], 'typed arithmetic that may not compile is not mutated');
    assert.deepEqual(mutateLine('        if (a >= b && !done) {', 'A.java').map((m) => m.op), ['compare', 'logic', 'negate']);
    write(root, 'spec.md', '- R1: total is price times quantity (verify: test)\n');
    assert.equal(trace(root, { spec: ['spec.md'], tests: ['src'] }).uncovered.length, 0);
});
