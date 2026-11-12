import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { checkBudgets, digestProbe, parseBudgets, probeUrl } from '../lib/uiprobe.mjs';
import { tmp } from './helpers.mjs';

const GOOD = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Good</title></head><body><main><h1>Apartments</h1><img src="/a.png" alt="plan"><button style="min-width:48px;min-height:48px">Open</button></main></body></html>';
const BAD = '<!doctype html><html><head><title>Bad</title></head><body><h1>One</h1><h1>Two</h1><img src="/a.png"><button></button><input type="text"><script>console.error("boom"); fetch("/missing");</script></body></html>';

const result = (over = {}) => ({ device: 'desktop', totalBytes: 1000, requests: 3, lcp: 900, cls: 0, consoleErrors: [], pageErrors: [], failed: [], rules: [], thirdParty: {}, bytes: { html: 1000 }, textHash: 'abcd1234', ...over });

test('budgets turn numbers into failures', () => {
    assert.deepEqual(parseBudgets('bytes=2000,lcp=2500,errors=0'), { bytes: 2000, lcp: 2500, errors: 0 });
    assert.deepEqual(checkBudgets(result(), parseBudgets('bytes=2000,lcp=2500,errors=0,rules=0')), []);
    const failures = checkBudgets(result({ totalBytes: 5000, consoleErrors: ['x'], rules: [{ rule: 'r', count: 2, sample: '<a>' }] }), parseBudgets('bytes=2000,errors=0,rules=1'));
    assert.deepEqual(failures, ['desktop: bytes 5000 > 2000', 'desktop: errors 1 > 0', 'desktop: rules 2 > 1']);
});

test('the digest stays short and names the details file', () => {
    const text = digestProbe([result({ rules: Array.from({ length: 9 }, (_, i) => ({ rule: `r${i}`, count: 1, sample: '<a>' })) })], ['desktop: lcp 3000 > 2500'], 'out.json');
    assert.ok(text.split('\n').length <= 8);
    assert.match(text, /BUDGET desktop: lcp/);
    assert.match(text, /details: out\.json/);
});

test('a real page is probed in two viewports', async (t) => {
    try {
        await import('playwright');
    } catch {
        return t.skip('Playwright is not installed');
    }
    const server = http.createServer((req, res) => {
        if (req.url === '/good') res.end(GOOD);
        else if (req.url === '/bad') res.end(BAD);
        else if (req.url === '/a.png') res.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
        else res.writeHead(404).end('no');
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        let good;
        try {
            good = await probeUrl(`${base}/good`, { outDir: tmp(), budgets: parseBudgets('errors=0,rules=0,thirdparty=0') });
        } catch (error) {
            if (/Executable doesn't exist|browserType\.launch/.test(error.message)) return t.skip('no browser binary');
            throw error;
        }
        assert.equal(good.results.length, 2);
        assert.deepEqual(good.failures, []);
        assert.deepEqual(good.results[0].rules, []);
        assert.equal(good.results[0].textHash, good.results[1].textHash, 'same text on both viewports');
        assert.ok(good.results[0].bytes.html > 0 && good.results[0].bytes.img > 0);

        const bad = await probeUrl(`${base}/bad`, { devices: ['desktop'], outDir: tmp(), budgets: parseBudgets('errors=0,rules=0') });
        const rules = bad.results[0].rules.map((r) => r.rule).join('|');
        for (const expected of ['html has no lang', 'exactly one h1', 'no viewport meta', 'no main landmark', 'image without alt', 'control without accessible name', 'form field without label']) assert.match(rules, new RegExp(expected));
        assert.ok(bad.results[0].consoleErrors.length >= 1);
        assert.ok(bad.results[0].failed.some((f) => f.startsWith('404')));
        assert.equal(bad.failures.length, 2);
        assert.notEqual(bad.results[0].textHash, good.results[0].textHash);
    } finally {
        server.close();
    }
});
