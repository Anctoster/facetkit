// uiprobe: browser evidence in a dozen lines. Opens a page in desktop and phone viewports with
// Playwright (optional peer dependency), stores everything it saw as JSON and returns a digest:
// errors, failed requests, bytes by kind, third parties, LCP/CLS, a text snapshot hash and a few
// interface rules. Budgets turn the numbers into pass/fail. No screenshots unless asked.
import fs from 'node:fs';
import path from 'node:path';
import { sha } from './text.mjs';

export const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844, isMobile: true, hasTouch: true } };

/** Runs in the page: interface rules that need no library. Returns [{ rule, count, sample }]. */
export function domRules() {
    const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const describe = (el) => `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''}>`;
    const findings = [];
    const add = (rule, els) => els.length && findings.push({ rule, count: els.length, sample: describe(els[0]) });
    const all = (sel) => [...document.querySelectorAll(sel)].filter(visible);
    if (!document.documentElement.lang) findings.push({ rule: 'html has no lang', count: 1, sample: '<html>' });
    if (document.querySelectorAll('h1').length !== 1) findings.push({ rule: 'page must have exactly one h1', count: document.querySelectorAll('h1').length, sample: '<h1>' });
    if (!document.querySelector('meta[name="viewport"]')) findings.push({ rule: 'no viewport meta', count: 1, sample: '<head>' });
    if (!document.querySelector('main, [role="main"]')) findings.push({ rule: 'no main landmark', count: 1, sample: '<body>' });
    add('image without alt', all('img:not([alt])'));
    add('control without accessible name', all('button, a[href], [role="button"]').filter((el) => !name(el) && !el.querySelector('img[alt]:not([alt=""])')));
    add('form field without label', all('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea').filter((el) => !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')));
    add('positive tabindex', all('[tabindex]').filter((el) => Number(el.getAttribute('tabindex')) > 0));
    add('link opens new window without rel=noopener', all('a[target="_blank"]').filter((el) => !/noopener/.test(el.getAttribute('rel') || '')));
    add('tap target under 24px', all('button, a[href]').filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.width < 24 || r.height < 24) && getComputedStyle(el).display !== 'inline';
    }));
    return findings;
}

const KIND = { script: 'js', stylesheet: 'css', image: 'img', media: 'media', font: 'font', document: 'html', fetch: 'api', xhr: 'api' };

/** Probes one viewport. `launch` is injected so the module loads without Playwright installed. */
export async function probeViewport(browser, url, device, { settleMs = 1500, screenshot } = {}) {
    const context = await browser.newContext({ viewport: VIEWPORTS[device], isMobile: !!VIEWPORTS[device].isMobile, hasTouch: !!VIEWPORTS[device].hasTouch });
    const page = await context.newPage();
    const result = { device, consoleErrors: [], pageErrors: [], failed: [], bytes: {}, requests: 0, thirdParty: {} };
    const origin = new URL(url).origin;
    const pending = [];
    page.on('console', (m) => m.type() === 'error' && result.consoleErrors.push(m.text().slice(0, 200)));
    page.on('pageerror', (e) => result.pageErrors.push(String(e.message).slice(0, 200)));
    page.on('requestfailed', (r) => result.failed.push(`${r.failure()?.errorText ?? 'failed'} ${r.url().slice(0, 120)}`));
    page.on('response', (response) => {
        result.requests++;
        if (response.status() >= 400) result.failed.push(`${response.status()} ${response.url().slice(0, 120)}`);
        const host = new URL(response.url()).origin;
        if (host !== origin && !response.url().startsWith('data:')) result.thirdParty[host] = (result.thirdParty[host] ?? 0) + 1;
        const kind = KIND[response.request().resourceType()] ?? 'other';
        pending.push(response.body().then((b) => (result.bytes[kind] = (result.bytes[kind] ?? 0) + b.length)).catch(() => undefined));
    });
    await page.addInitScript(() => {
        window.__facet = { lcp: 0, cls: 0 };
        new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__facet.lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((l) => l.getEntries().forEach((e) => !e.hadRecentInput && (window.__facet.cls += e.value))).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(settleMs);
    await Promise.all(pending);
    const vitals = await page.evaluate(() => window.__facet);
    result.lcp = Math.round(vitals.lcp);
    result.cls = +vitals.cls.toFixed(3);
    result.title = await page.title();
    result.rules = await page.evaluate(domRules);
    const text = await page.evaluate(() => (document.querySelector('main') ?? document.body).innerText.replace(/\s+/g, ' ').trim());
    result.textHash = sha(text);
    result.textLength = text.length;
    result.totalBytes = Object.values(result.bytes).reduce((a, b) => a + b, 0);
    if (screenshot) await page.screenshot({ path: screenshot.replace('{device}', device) });
    await context.close();
    return result;
}

/** "bytes=2500000,requests=40,lcp=2500,cls=0.1,errors=0,rules=0,thirdparty=0" → failures per viewport. */
export function checkBudgets(result, budgets) {
    const actual = {
        bytes: result.totalBytes,
        requests: result.requests,
        lcp: result.lcp,
        cls: result.cls,
        errors: result.consoleErrors.length + result.pageErrors.length + result.failed.length,
        rules: result.rules.reduce((s, r) => s + r.count, 0),
        thirdparty: Object.keys(result.thirdParty).length,
    };
    return Object.entries(budgets).filter(([k, limit]) => k in actual && actual[k] > limit).map(([k, limit]) => `${result.device}: ${k} ${actual[k]} > ${limit}`);
}
export const parseBudgets = (text) => Object.fromEntries((text ?? '').split(',').filter(Boolean).map((p) => p.split('=')).map(([k, v]) => [k.trim(), Number(v)]));

export function digestProbe(results, failures, outFile) {
    const kb = (n) => `${Math.round((n ?? 0) / 1024)} kB`;
    const lines = [];
    for (const r of results) {
        lines.push(`${r.device}: ${r.requests} requests, ${kb(r.totalBytes)} (${Object.entries(r.bytes).map(([k, v]) => `${k} ${kb(v)}`).join(', ')}), LCP ${r.lcp} ms, CLS ${r.cls}, text #${r.textHash}`);
        const errors = [...r.pageErrors, ...r.consoleErrors, ...r.failed];
        if (errors.length) lines.push(`  errors ${errors.length}: ${errors[0]}`);
        if (Object.keys(r.thirdParty).length) lines.push(`  third parties: ${Object.keys(r.thirdParty).join(', ')}`);
        for (const f of r.rules.slice(0, 4)) lines.push(`  rule: ${f.rule} ×${f.count} e.g. ${f.sample}`);
    }
    if (failures.length) lines.push(...failures.map((f) => `BUDGET ${f}`));
    lines.push(`details: ${outFile}`);
    return lines.join('\n');
}

export async function probeUrl(url, { devices = ['desktop', 'phone'], outDir = '.', budgets = {}, screenshot, launchArgs = [] } = {}) {
    let chromium;
    try {
        ({ chromium } = await import('playwright'));
    } catch {
        throw Object.assign(new Error('Playwright is not installed: npm i -D playwright && npx playwright install chromium'), { code: 'NO_BROWSER' });
    }
    const browser = await chromium.launch({ args: launchArgs });
    try {
        const results = [];
        for (const device of devices) results.push(await probeViewport(browser, url, device, { screenshot }));
        fs.mkdirSync(outDir, { recursive: true });
        const outFile = path.join(outDir, `uiprobe-${sha(url + Date.now())}.json`);
        fs.writeFileSync(outFile, JSON.stringify({ url, at: new Date().toISOString(), results }, null, 2));
        const failures = results.flatMap((r) => checkBudgets(r, budgets));
        return { results, failures, outFile, text: digestProbe(results, failures, outFile) };
    } finally {
        await browser.close();
    }
}
