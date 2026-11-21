// explain-pr: the result of `facet ci-verify` as a Markdown report, and that report as one PR comment
// that is updated in place on every run.
import { pullRequestNumber } from './github-context.mjs';

export const MARKER = '<!-- facetkit-assurance-report -->';

/** Text from a command's output, safe inside one table cell: one line, no Markdown that could break out. */
export const cell = (text, max = 160) => {
    const one = String(text ?? '').replace(/\s+/g, ' ').trim().replace(/[|`<>]/g, (c) => ({ '|': '\\|', '`': "'", '<': '&lt;', '>': '&gt;' })[c]);
    return one.length > max ? `${one.slice(0, max - 1)}…` : one || '—';
};

const ICON = { PASS: '✅ PASS', FAIL: '❌ FAIL', WARN: '⚠️ WARN', SKIPPED: '⚪ not run', 'NOT-NEEDED': '➖ not needed' };

export function renderPrReport({ itemId, level, minLevel, passed, mode, base, checks, reportFile, run }) {
    const row = (label, c) => `| ${label} | ${c ? ICON[c.status] ?? cell(c.status) : ICON.SKIPPED} | ${cell(c?.details)} |`;
    const rows = [
        ['Security scan', checks.scan],
        ['Tests', checks.tests],
        ['Mutation probe', checks.mutate],
        ['Neighbours', checks.seams],
        ['Journal', checks.journal],
        ['Assurance (journal)', checks.assure],
        ['Proof pack', checks.proof],
    ].filter(([, c]) => c);
    return [
        MARKER,
        `### ${passed ? '✅' : '❌'} FacetKit — level **${level}** (required: ${minLevel})`,
        '',
        `Item \`${cell(itemId, 64)}\` · mode \`${mode}\`${base ? ` · change: ${cell(base, 80)}` : ''}`,
        '',
        '| Check | Result | Details |',
        '| :--- | :--- | :--- |',
        ...rows.map(([label, c]) => row(label, c)),
        '',
        mode === 'stateless'
            ? '_Stateless: the level describes this CI run only — no journal, no independent verdict, no signature. It is not a proof pack._'
            : '_The level is computed from the project journal; the journal and the proof pack were checked on these sources._',
        ...(run ? ['', `<sub>${cell(run, 200)}${reportFile ? ` · details: ${cell(reportFile, 80)}` : ''}</sub>`] : []),
    ].join('\n');
}

/** Creates or updates the one FacetKit comment on the pull request. Returns false when there is no PR to comment on. */
export async function postPrComment(body, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
    const token = env.GITHUB_TOKEN;
    const repo = env.GITHUB_REPOSITORY;
    const number = pullRequestNumber(env);
    if (!token || !repo || !number) return false;
    const api = `${(env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '')}/repos/${repo}`;
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'facetkit', 'Content-Type': 'application/json' };
    const list = await fetchImpl(`${api}/issues/${number}/comments?per_page=100`, { headers });
    const comments = list.ok ? await list.json() : [];
    const mine = Array.isArray(comments) ? comments.find((c) => typeof c.body === 'string' && c.body.startsWith(MARKER)) : null;
    const res = await fetchImpl(mine ? `${api}/issues/comments/${mine.id}` : `${api}/issues/${number}/comments`, { method: mine ? 'PATCH' : 'POST', headers, body: JSON.stringify({ body }) });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}${res.status === 403 ? ' — the token cannot write comments (a PR from a fork, or the workflow lacks permissions: pull-requests: write)' : ''}`);
    return true;
}
