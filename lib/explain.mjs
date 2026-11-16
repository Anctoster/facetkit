// explain: the same record, told to the person who has to act on it. A developer wants the next
// command; a team lead wants where time and rework go; a client wants what is done and how sure
// we are, in words; an auditor wants every rule, exception and signature. None of them should have
// to learn the journal to get their answer.
import { itemState } from './flow.mjs';
import { evaluate, trust } from './govern.mjs';
import { closedItems, minutesBetween, ofItem, openItems } from './journal.mjs';

export const AUDIENCES = { dev: 'developer', lead: 'team lead', client: 'client or product owner', auditor: 'auditor' };
// The client's page is read by people who do not read English every day: its words come in three languages.
const CLIENT = {
    en: { title: 'Where the work stands', count: (c, o) => `${c} piece(s) of work finished, ${o} in progress.`, done: 'done. How sure we are', progress: 'in progress', now: 'now', waiting: 'waiting for an answer from you', exception: 'A person accepted an exception', record: (n, c) => `So far ${n} of ${c} finished pieces needed a fix afterwards.`, none: 'Nothing is finished yet, so there is no track record to quote.', limit: 'What this does not say: that there are no mistakes nobody has found yet.',
        levels: ['reported as done, but not independently checked', 'checked again by someone who did not do the work; nothing was skipped; no secrets or forbidden files', 'every requirement has a test or scenario, and the project checks pass on the final version', 'the tests were shown to catch deliberately planted mistakes', 'as above, with no exceptions, and the checkers themselves were shown to catch planted defects'] },
    pl: { title: 'Stan prac', count: (c, o) => `Ukończone: ${c}, w toku: ${o}.`, done: 'gotowe. Na ile jesteśmy pewni', progress: 'w toku', now: 'teraz', waiting: 'czeka na Państwa odpowiedź', exception: 'Osoba odpowiedzialna zaakceptowała wyjątek', record: (n, c) => `Dotąd ${n} z ${c} ukończonych prac wymagało późniejszej poprawki.`, none: 'Nic nie jest jeszcze ukończone, więc nie ma jeszcze historii do pokazania.', limit: 'Czego to nie mówi: że nie ma błędów, których nikt jeszcze nie znalazł.',
        levels: ['zgłoszone jako gotowe, ale nie sprawdzone niezależnie', 'sprawdzone ponownie przez kogoś, kto nie wykonywał pracy; żaden krok nie został pominięty; brak sekretów i zakazanych plików', 'każde wymaganie ma test lub scenariusz, a kontrole projektu przechodzą na wersji końcowej', 'wykazano, że testy wychwytują celowo wprowadzone błędy', 'jak wyżej, bez wyjątków, a same kontrole wykazały, że wychwytują podrzucone usterki'] },
    ru: { title: 'Состояние работ', count: (c, o) => `Завершено: ${c}, в работе: ${o}.`, done: 'готово. Насколько мы уверены', progress: 'в работе', now: 'сейчас', waiting: 'ждёт вашего ответа', exception: 'Ответственный человек принял исключение', record: (n, c) => `Пока ${n} из ${c} завершённых работ потребовали исправления позже.`, none: 'Пока ничего не завершено, поэтому истории ещё нет.', limit: 'Чего это не утверждает: что нет ошибок, которых ещё никто не нашёл.',
        levels: ['заявлено как готовое, но не проверено независимо', 'проверено повторно тем, кто не делал работу; шаги не пропускались; нет секретов и запрещённых файлов', 'у каждого требования есть тест или сценарий, а проверки проекта проходят на итоговой версии', 'показано, что тесты ловят намеренно внесённые ошибки', 'как выше, без исключений, а сами проверяющие показали, что ловят подброшенные дефекты'] },
};
export const LANGS = Object.keys(CLIENT);
const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
const num = (n) => (n === null || n === undefined ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n));

/** Facts per item, computed once: title, state, level, time, tokens, rework causes, waivers, what is unverified. */
export function itemFacts(events, item, { titles = {}, policy, checks, project } = {}) {
    const mine = ofItem(events, item);
    const state = itemState(events, item);
    const e = evaluate(events, item, { policy, checks, project });
    const opened = mine.find((x) => x.kind === 'item.open');
    const closed = mine.find((x) => x.kind === 'item.close');
    const causes = mine.filter((x) => x.kind === 'verdict').flatMap((v) => (v.fixes ?? []).map((f) => f.mode ?? 'other'));
    return {
        item, title: titles[item] ?? null, closed: !!closed, level: e.level, label: e.label,
        minutes: opened ? Math.round(minutesBetween(opened.at, closed?.at ?? mine.at(-1).at)) : null,
        tokens: mine.filter((x) => x.kind === 'step.end').reduce((s, x) => s + (x.tokens ?? 0), 0),
        rework: state?.cycles ?? 0, causes,
        waivers: mine.filter((x) => x.kind === 'waiver').map((w) => `${w.rule} by ${w.by}: ${w.reason}`),
        unmet: e.results.filter((r) => !r.pass).map((r) => `${r.id}${r.waived ? ' (waived)' : ''}`),
        questions: mine.filter((x) => x.kind === 'step.end' && x.status === 'NEEDS-USER').length,
        adapted: mine.filter((x) => x.kind === 'route.adapt').map((a) => a.why),
        step: state?.steps.find((s) => s.status !== 'done') ?? null,
    };
}

export function explain(events, audience, { titles = {}, policy, checks, project = {}, cost = null, next = null, lang = 'en' } = {}) {
    const closed = closedItems(events);
    const open = openItems(events);
    const facts = [...closed, ...open].map((i) => itemFacts(events, i, { titles, policy, checks, project }));
    const t = trust(events, { policy, checks, project });
    const lines = [];
    const name = (f) => `${f.item}${f.title ? ` — ${f.title}` : ''}`;
    if (audience === 'client') {
        const w = CLIENT[lang] ?? CLIENT.en;
        lines.push(`# ${w.title}`, '', w.count(closed.length, open.length), '');
        for (const f of facts.filter((x) => x.closed)) lines.push(`- **${name(f)}**: ${w.done}: ${w.levels[f.level]}.${f.waivers.length ? ` ${w.exception}: ${f.waivers.join('; ')}.` : ''}`);
        for (const f of facts.filter((x) => !x.closed)) lines.push(`- **${name(f)}**: ${w.progress}${f.step ? ` (${w.now}: ${f.step.id})` : ''}${f.questions ? ` — ${w.waiting}` : ''}.`);
        lines.push('', t.closed ? w.record(t.escapes.n, t.closed) : w.none, '', `_${w.limit}_`);
    } else if (audience === 'lead') {
        const rework = facts.filter((x) => x.closed);
        const causes = {};
        for (const f of rework) for (const c of f.causes) causes[c] = (causes[c] ?? 0) + 1;
        const top = Object.entries(causes).sort((a, b) => b[1] - a[1]);
        lines.push('# Team health', '', `Closed ${closed.length} · first time right ${pct(t.firstPass)} · rework cycles ${rework.reduce((s, f) => s + f.rework, 0)} · median time per item ${rework.length ? rework.map((f) => f.minutes).sort((a, b) => a - b)[Math.floor((rework.length - 1) / 2)] : '—'} min`, '');
        if (top.length) lines.push('## Why work was sent back', '', ...top.slice(0, 6).map(([c, n]) => `- ${c}: ${n}`), '');
        if (cost) lines.push('## Where the tokens go', '', `orchestration ${pct(cost.shares?.orchestration)} · rework ${pct(cost.shares?.rework)} · blocked steps ${pct(cost.shares?.wasted)} · per closed item ${num(cost.items?.tokensPerClosed)} tokens`, '');
        lines.push('## Items', '', '| Item | Level | Rework | Minutes | Adapted |', '|---|---|---|---|---|', ...facts.map((f) => `| ${name(f)} | ${f.closed ? f.label : 'open'} | ${f.rework} | ${f.minutes ?? '—'} | ${f.adapted.length || ''} |`));
    } else if (audience === 'auditor') {
        lines.push('# Audit trail', '', `Journal intact: ${project.journalIntact === true ? 'yes' : project.journalIntact === false ? 'NO' : 'not verified'} · guards calibrated: ${t.calibration.length ? t.calibration.map((c) => `${c.guard} ${c.caught}/${c.n}`).join(', ') : 'no'}`, '');
        for (const f of facts.filter((x) => x.closed)) lines.push(`## ${name(f)} — ${f.label}`, '', f.unmet.length ? `Not met: ${f.unmet.join(', ')}` : 'Every rule of the policy met.', ...(f.waivers.length ? [`Waivers: ${f.waivers.join('; ')}`] : []), ...(f.adapted.length ? [`Route adapted: ${f.adapted.join('; ')}`] : []), '');
    } else {
        lines.push('# What to do now', '');
        if (next) lines.push('```', next, '```', '');
        for (const f of facts.filter((x) => !x.closed)) lines.push(`- ${name(f)}: ${f.step ? `${f.step.id} is ${f.step.status}` : 'every step done'}${f.unmet.length ? ` · not met yet: ${f.unmet.slice(0, 4).join(', ')}` : ''}`);
        const weak = facts.filter((x) => x.closed && x.level < 2);
        if (weak.length) lines.push('', `Closed below L2: ${weak.map((f) => f.item).join(', ')} — \`facet assure --item <id>\` shows what is missing.`);
    }
    return { text: lines.join('\n'), facts };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** One page per audience, no dependencies: markdown headings, lists and tables only. */
export function explainHtml(text, { title = 'facetkit', lang = 'en' } = {}) {
    const out = [];
    let table = null;
    let list = false;
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/_(.+?)_/g, '<i>$1</i>');
    const flush = () => {
        if (list) out.push('</ul>');
        list = false;
        if (table) out.push(`<table>${table.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`)).join('')}</tr>`).join('')}</table>`);
        table = null;
    };
    let pre = false;
    for (const line of text.split('\n')) {
        if (line.startsWith('```')) {
            flush();
            out.push(pre ? '</pre>' : '<pre>');
            pre = !pre;
        } else if (pre) out.push(esc(line));
        else if (line.startsWith('|')) {
            if (/^\|[-| ]+\|$/.test(line)) continue;
            if (list) flush();
            (table ??= []).push(line.split('|').slice(1, -1).map((c) => c.trim()));
        } else if (line.startsWith('- ')) {
            if (table) flush();
            if (!list) out.push('<ul>');
            list = true;
            out.push(`<li>${inline(line.slice(2))}</li>`);
        } else {
            flush();
            const h = /^(#{1,3}) (.+)$/.exec(line);
            if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
            else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
        }
    }
    flush();
    return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
:root{--bg:#fbfaf7;--ink:#1d1c1a;--mute:#6f6c66;--line:#dedbd3;--chip:#efede7}@media (prefers-color-scheme:dark){:root{--bg:#151514;--ink:#ecebe6;--mute:#9a978f;--line:#2e2d2a;--chip:#232321}}
body{background:var(--bg);color:var(--ink);font:16px/1.55 ui-sans-serif,system-ui,sans-serif;max-width:860px;margin:0 auto;padding:28px 16px 60px}h1{font-size:26px;letter-spacing:-.01em}h2{font-size:18px;margin-top:28px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;display:block;overflow-x:auto}td,th{border-bottom:1px solid var(--line);padding:7px 10px;text-align:left}th{color:var(--mute);font-size:13px}
code,pre{font:13px ui-monospace,Menlo,monospace;background:var(--chip);border-radius:6px}code{padding:1px 5px}pre{padding:12px;overflow-x:auto}i{color:var(--mute)}li{margin:4px 0}
</style></head><body>${out.join('\n')}</body></html>`;
}
