// Shared text helpers: word counts, frontmatter, similarity. No dependencies.
import crypto from 'node:crypto';

const STOP = new Set('a an and are as at be by for from has have if in into is it its of on or that the then this to was were will with not no you your must never always only when which each one any all can do does'.split(' '));

export const words = (text) => text.split(/\s+/).filter(Boolean);
export const wordCount = (text) => words(text).length;
/** Lower-case content words without punctuation and stop words. */
export function tokens(text) {
    return text
        .toLowerCase()
        .replace(/`[^`]*`/g, ' ') // commands are not prose; they would dominate similarity
        .replace(/[^a-z0-9а-яё]+/gi, ' ')
        .split(' ')
        .filter((w) => w.length > 2 && !STOP.has(w));
}
/** Set of k-word shingles. */
export function shingles(text, k = 3) {
    const t = tokens(text);
    const out = new Set();
    for (let i = 0; i + k <= t.length; i++) out.add(t.slice(i, i + k).join(' '));
    return out;
}
export function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let both = 0;
    for (const x of a) if (b.has(x)) both++;
    return both / (a.size + b.size - both);
}
/** Cosine similarity of term-frequency vectors — catches paraphrase that shingles miss. */
export function cosine(textA, textB) {
    const tf = (text) => {
        const m = new Map();
        for (const w of tokens(text)) m.set(w, (m.get(w) ?? 0) + 1);
        return m;
    };
    const a = tf(textA);
    const b = tf(textB);
    let dot = 0;
    for (const [w, n] of a) dot += n * (b.get(w) ?? 0);
    const norm = (m) => Math.sqrt([...m.values()].reduce((s, n) => s + n * n, 0));
    return dot && norm(a) && norm(b) ? dot / (norm(a) * norm(b)) : 0;
}
/** Similarity used by the audit: the larger of shingle overlap and (damped) vocabulary overlap. */
export const similarity = (a, b) => Math.max(jaccard(shingles(a), shingles(b)), cosine(a, b) * 0.5);

/**
 * Minimal frontmatter: `key: value` lines between --- markers.
 * `[a, b]` becomes an array, `k=1, m=2` after `bounds:` becomes an object of numbers.
 */
export function parseFrontmatter(source) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
    if (!m) return { meta: {}, body: source };
    const meta = {};
    for (const line of m[1].split(/\r?\n/)) {
        const i = line.indexOf(':');
        if (i < 0) continue;
        const key = line.slice(0, i).trim();
        const raw = line.slice(i + 1).trim();
        if (/^\[.*\]$/.test(raw)) meta[key] = raw.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
        else if (key === 'bounds') meta[key] = Object.fromEntries(raw.split(',').map((p) => p.split('=').map((s) => s.trim())).filter((p) => p.length === 2).map(([k, v]) => [k, Number(v)]));
        else meta[key] = raw.replace(/^["']|["']$/g, '');
    }
    return { meta, body: m[2] };
}
export const sha = (text, n = 8) => crypto.createHash('sha1').update(text).digest('hex').slice(0, n);
/** SHA-256, whole or cut to `n` hex characters: for everything that has to resist a deliberate collision. */
export const sha256 = (data, n = 64) => crypto.createHash('sha256').update(data).digest('hex').slice(0, n);
/** Rough token estimate for budgeting (English prose and code average about four characters per token). */
export const estimateTokens = (chars) => Math.ceil(chars / 4);

/** Precomputed similarity profile — use when comparing one text against many. */
export function profile(text) {
    const tf = new Map();
    for (const w of tokens(text)) tf.set(w, (tf.get(w) ?? 0) + 1);
    return { sh: shingles(text), tf, norm: Math.sqrt([...tf.values()].reduce((s, n) => s + n * n, 0)) };
}
export function profileSimilarity(a, b) {
    let dot = 0;
    for (const [w, n] of a.tf) dot += n * (b.tf.get(w) ?? 0);
    const cos = dot && a.norm && b.norm ? dot / (a.norm * b.norm) : 0;
    return Math.max(jaccard(a.sh, b.sh), cos * 0.5);
}
