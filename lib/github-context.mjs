import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Автоопределение ID задачи из флага, имени ветки или заголовка PR
 */
export function resolveItemId(cliFlagItem) {
    if (cliFlagItem && cliFlagItem.trim() !== '') return cliFlagItem.trim();

    const pattern = /\b([A-Z]+-\d+|P\d+|ITEM-\d+)\b/i;

    // 1. Из имени ветки в PR (например, feat/P07-login -> P07)
    const branchName = process.env.GITHUB_HEAD_REF || '';
    const branchMatch = branchName.match(pattern);
    if (branchMatch) return branchMatch[0].toUpperCase();

    // 2. Из JSON-события GitHub Actions
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (eventPath && fs.existsSync(eventPath)) {
        try {
            const event = JSON.parse(fs.readFileSync(eventPath, 'utf-8'));
            const prTitle = event.pull_request?.title || '';
            const titleMatch = prTitle.match(pattern);
            if (titleMatch) return titleMatch[0].toUpperCase();
            if (event.pull_request?.number) return `PR-${event.pull_request.number}`;
        } catch {
            // Игнорируем ошибку чтения события
        }
    }

    return 'LOCAL-CHECK';
}

/**
 * Определение режима (есть ли конфиг/журнал в проекте) и измененных файлов
 */
export function detectCiContext(cwd, project = {}) {
    const hasFacetJson = fs.existsSync(path.join(cwd, 'facet.json'));
    const hasPkgConfig = Object.keys(project).length > 0;
    const isConfigured = hasFacetJson || hasPkgConfig;

    const baseBranch = process.env.GITHUB_BASE_REF;
    const diffTarget = baseBranch ? `origin/${baseBranch}...HEAD` : 'HEAD~1...HEAD';
    const res = spawnSync('git', ['diff', '--name-only', diffTarget], { cwd, encoding: 'utf-8' });
    const changedFiles = (res.stdout || '')
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);

    return {
        mode: isConfigured ? 'full-journal' : 'stateless-ci',
        changedFiles,
    };
}

/**
 * Автоопределение команды запуска тестов для Zero-Config режима
 */
export function detectTestCommand(cwd, explicitCmd = '') {
    if (explicitCmd && explicitCmd.trim() !== '') return explicitCmd.trim();

    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            const testScript = pkg.scripts?.test || '';
            if (testScript && !testScript.includes('no test specified')) {
                if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm test';
                if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn test';
                if (fs.existsSync(path.join(cwd, 'bun.lockb'))) return 'bun test';
                return 'npm test';
            }
        } catch {}
    }

    if (['pytest.ini', 'pyproject.toml', 'requirements.txt', 'tests'].some((f) => fs.existsSync(path.join(cwd, f)))) {
        return 'pytest -q';
    }
    if (fs.existsSync(path.join(cwd, 'go.mod'))) return 'go test ./...';
    if (fs.existsSync(path.join(cwd, 'pom.xml'))) return 'mvn test -q';
    if (fs.existsSync(path.join(cwd, 'build.gradle')) || fs.existsSync(path.join(cwd, 'build.gradle.kts'))) {
        return './gradlew test';
    }

    return null;
}
