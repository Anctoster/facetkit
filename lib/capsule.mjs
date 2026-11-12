// capsule: hash-anchored references. A handoff cites code as `path:start-end#hash`; the hash is
// taken over the cited lines. The receiver verifies anchors in one command and re-reads only what
// changed or moved — instead of re-reading everything "to be safe" or trusting stale notes.
import fs from 'node:fs';
import path from 'node:path';
import { sha } from './text.mjs';

const ANCHOR = /`([\w./@-][\w./@ -]*?\.[\w]+):(\d+)(?:-(\d+))?(?:#([0-9a-f]{8}))?`/g;
const norm = (lines) => lines.map((l) => l.replace(/\s+$/, '')).join('\n');

export function hashRange(root, file, start, end) {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) return null;
    const lines = fs.readFileSync(abs, 'utf-8').split(/\r?\n/);
    if (start < 1 || end > lines.length || end < start) return null;
    return sha(norm(lines.slice(start - 1, end)));
}

/** Adds or refreshes the hash of every anchor in a handoff text. Returns { text, sealed, broken[] }. */
export function seal(text, root) {
    const broken = [];
    let sealed = 0;
    const out = text.replace(ANCHOR, (whole, file, a, b) => {
        const start = Number(a);
        const end = Number(b ?? a);
        const hash = hashRange(root, file, start, end);
        if (!hash) {
            broken.push(`${file}:${start}-${end}`);
            return whole;
        }
        sealed++;
        return `\`${file}:${start}-${end}#${hash}\``;
    });
    return { text: out, sealed, broken };
}

/** Looks for the same block elsewhere in the file (the code moved but did not change). */
function relocate(root, file, length, hash) {
    const lines = fs.readFileSync(path.join(root, file), 'utf-8').split(/\r?\n/);
    for (let i = 0; i + length <= lines.length; i++) if (sha(norm(lines.slice(i, i + length))) === hash) return [i + 1, i + length];
    return null;
}

/** Checks every sealed anchor: ok | moved | drifted | missing | unsealed. */
export function verify(text, root) {
    const results = [];
    for (const m of text.matchAll(ANCHOR)) {
        const [, file, a, b, hash] = m;
        const start = Number(a);
        const end = Number(b ?? a);
        const ref = `${file}:${start}-${end}`;
        if (!hash) results.push({ ref, state: 'unsealed' });
        else if (!fs.existsSync(path.join(root, file))) results.push({ ref, state: 'missing' });
        else if (hashRange(root, file, start, end) === hash) results.push({ ref, state: 'ok' });
        else {
            const moved = relocate(root, file, end - start + 1, hash);
            results.push(moved ? { ref, state: 'moved', to: `${file}:${moved[0]}-${moved[1]}` } : { ref, state: 'drifted' });
        }
    }
    return results;
}
