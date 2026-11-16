// Regenerates the damaged journals under benchmark/fixtures/journal. The fixtures are committed:
// run this only when the journal format changes, and review the diff of benchmark/expected.json by hand.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { record } from '../lib/journal.mjs';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'benchmark', 'fixtures', 'journal');
fs.rmSync(out, { recursive: true, force: true });
const at = (i) => new Date(Date.UTC(2026, 0, 5, 9, i)).toISOString();
function clean(name) {
    const dir = path.join(out, name);
    for (let i = 0; i < 4; i++) record(dir, { kind: 'note', item: 'A', text: `ann ${i}`, at: at(i) }, { writer: 'ann' });
    for (let i = 0; i < 3; i++) record(dir, { kind: 'note', item: 'A', text: `bob ${i}`, at: at(10 + i) }, { writer: 'bob' });
    return dir;
}
const edit = (file, fn) => fs.writeFileSync(file, fn(fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)).map((l) => `${l}\n`).join(''));
const seg = (dir, w) => path.join(dir, `${w}.jsonl`);

clean('clean');
edit(seg(clean('edited-line'), 'ann'), (l) => l.map((x, i) => (i === 1 ? x.replace('ann 1', 'ann one') : x)));
edit(seg(clean('missing-event'), 'ann'), (l) => l.filter((_, i) => i !== 2));
edit(seg(clean('duplicate-sequence'), 'bob'), (l) => [...l, l.at(-1)]);
edit(seg(clean('foreign-writer'), 'bob'), (l) => l.map((x, i) => (i === 0 ? x.replace('"w":"bob"', '"w":"ann"') : x)));
edit(seg(clean('clock-backwards'), 'bob'), (l) => l.map((x, i) => (i === 2 ? x.replace(/"lc":\d+/, '"lc":1') : x)));
const torn = seg(clean('torn-tail'), 'ann');
fs.appendFileSync(torn, '{"at":"2026-01-05T09:30:00.000Z","kind":"note","item":"A","te');
// two writers open the same item: each chain is sound, the claim is not
const dbl = path.join(out, 'double-open');
record(dbl, { kind: 'item.open', item: 'A', at: at(0) }, { writer: 'ann' });
record(dbl, { kind: 'item.open', item: 'A', at: at(1) }, { writer: 'bob' });
for (const d of fs.readdirSync(out)) fs.rmSync(path.join(out, d, '.lock'), { force: true });
console.log(fs.readdirSync(out).join(' '));
