import fs from 'node:fs';

export function renderPrReport({ itemId, level, minLevel, passed, mode, checks, proofFile }) {
    const badge = passed ? '✅' : '❌';
    const row = (label, c) => {
        if (!c || c.status === 'SKIPPED') return `| **${label}** | ⚪ NOT RUN | ${c?.details ?? '—'} |`;
        const icon = { PASS: '✅ PASS', FAIL: '❌ FAIL', WARN: '⚠️ WARN', STALE: '⏳ STALE', TAMPERED: '🚨 TAMPERED' }[c.status] ?? c.status;
        return `| **${label}** | ${icon} | ${c.details ?? '—'} |`;
    };

    return [
        '<!-- facetkit-assurance-report -->',
        `### ${badge} FacetKit Verification — **Assurance level: ${level}** (target: ${minLevel})`,
        '',
        `> **Item:** \`${itemId}\` · **Mode:** \`${mode}\`${proofFile ? ` · **Proof:** \`${proofFile}\`` : ''}`,
        '',
        '| Check | Status | Details |',
        '| :--- | :--- | :--- |',
        row('Specification', checks.spec),
        row('Tests', checks.tests),
        row('Mutation probe', checks.mutate),
        row('Neighbour tests', checks.seams),
        row('Security scan', checks.scan),
        row('Journal', checks.journal),
        row('Proof pack', checks.proof),
        '',
        '<details>',
        '<summary>🔍 Verification details</summary>',
        '',
        `- Verified by: \`GitHub Actions Witness\``,
        `- Policy gate (\`${minLevel}\`): **${passed ? 'ALLOW' : 'DENY'}**`,
        '</details>',
    ].join('\n');
}

export async function postPrComment(markdownBody) {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPOSITORY;
    const eventPath = process.env.GITHUB_EVENT_PATH;

    if (!token || !repo || !eventPath || !fs.existsSync(eventPath)) return false;

    const event = JSON.parse(fs.readFileSync(eventPath, 'utf-8'));
    const prNumber = event.pull_request?.number;
    if (!prNumber) return false;

    const apiBase = `https://github.com{repo}`;
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'facetkit-cli',
        'Content-Type': 'application/json',
    };

    const marker = '<!-- facetkit-assurance-report -->';
    const listRes = await fetch(`${apiBase}/issues/${prNumber}/comments`, { headers });
    const comments = listRes.ok ? await listRes.json() : [];
    const existing = Array.isArray(comments) ? comments.find((c) => c.body?.includes(marker)) : null;

    const url = existing ? `${apiBase}/issues/comments/${existing.id}` : `${apiBase}/issues/${prNumber}/comments`;
    const method = existing ? 'PATCH' : 'POST';

    const res = await fetch(url, { method, headers, body: JSON.stringify({ body: markdownBody }) });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    return true;
}
