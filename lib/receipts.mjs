// receipts: a small cache of "I read the current documentation for X" records. An agent that is
// about to use a fast-moving API first checks for a fresh receipt; if there is none it reads the
// primary source once and writes down the URL, the version and the few facts it relied on.
import fs from 'node:fs';
import path from 'node:path';

const slug = (topic) => topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const DAY = 86_400_000;

export function addReceipt(dir, { topic, url, version = '', facts = [], ttlDays = 30, now = Date.now() }) {
    if (!topic || !url) throw new Error('a receipt needs --topic and --url');
    if (!/^https?:\/\//.test(url)) throw new Error('the source must be an http(s) URL of a primary source');
    if (!facts.length) throw new Error('a receipt needs at least one --fact: what you relied on');
    fs.mkdirSync(dir, { recursive: true });
    const receipt = { topic, url, version, facts, fetchedAt: new Date(now).toISOString(), ttlDays };
    fs.writeFileSync(path.join(dir, `${slug(topic)}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
}

/** fresh | stale | missing | version-mismatch (the installed version differs from the receipt's). */
export function checkReceipt(dir, topic, { now = Date.now(), installed } = {}) {
    const file = path.join(dir, `${slug(topic)}.json`);
    if (!fs.existsSync(file)) return { state: 'missing' };
    const receipt = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const ageDays = Math.floor((now - Date.parse(receipt.fetchedAt)) / DAY);
    if (installed && receipt.version && installed !== receipt.version) return { state: 'version-mismatch', receipt, ageDays, installed };
    return { state: ageDays > receipt.ttlDays ? 'stale' : 'fresh', receipt, ageDays };
}

export function listReceipts(dir, now = Date.now()) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
        const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
        const ageDays = Math.floor((now - Date.parse(r.fetchedAt)) / DAY);
        return { ...r, ageDays, state: ageDays > r.ttlDays ? 'stale' : 'fresh' };
    });
}

/** Version of a package as installed (node_modules first, then package-lock.json); null if unknown. */
export function installedVersion(root, name) {
    try {
        return JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf-8')).version;
    } catch {
        try {
            return JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf-8')).packages?.[`node_modules/${name}`]?.version ?? null;
        } catch {
            return null;
        }
    }
}
