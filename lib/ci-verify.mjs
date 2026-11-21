// ci-verify: one CI run of FacetKit against a change, for projects with or without the agent flow.
//   stateless — no journal for this item: scan the change, run the tests, probe the changed code with mutants.
//   journal   — the item is in the project journal: verify the journal, compute the level from it, check the proof pack.
// The level is never higher than what this run itself saw; a stateless level is no proof pack and no signed witness.
import { spawnSync } from 'node:child_process';
import { readJournal } from './journal.mjs';
import { probe } from './mutaprobe.mjs';
import { buildGraph, neighbours } from './seams.mjs';
import { runShellSync, safeEnv } from './shell.mjs';
import { changeBase, changedFiles, detectTestCommand, sourceFiles } from './github-context.mjs';

export const LEVEL_RANK = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 };

export function parseLevel(text) {
    const level = String(text ?? '').trim().toUpperCase();
    if (!(level in LEVEL_RANK)) throw new Error(`level ${JSON.stringify(text)}: use L0, L1, L2, L3 or L4`);
    return level;
}

const firstLine = (r) => `${r.stdout ?? ''}\n${r.stderr ?? ''}`.split('\n').map((l) => l.trim()).find(Boolean) ?? '';

/** The scan verdict from `facet scan`'s exit code: 0 clean, 2 clean but part of the change was not read, else blocked. */
export const scanStatus = (exit) => (exit === 0 ? 'PASS' : exit === 2 ? 'WARN' : 'FAIL');

/**
 * @param {object} o
 * @param {string} o.cwd           the project
 * @param {string} o.facetBin      bin/facet.mjs, run as a child for scan, journal, assure and proof
 * @param {object} o.project       facet.json (or package.json → facetkit), may be {}
 * @param {string} o.journal       the journal path the project uses
 * @param {string} o.itemId
 * @param {string} o.minLevel      L0…L4
 * @param {string} [o.testCmd]     overrides the guess
 * @param {string} [o.base]        the commit the change starts from (else from the CI environment)
 */
export function ciVerify({ cwd, facetBin, project = {}, journal, itemId, minLevel = 'L2', testCmd = '', base, max = 10, maxMinutes = 10, env = process.env }) {
    const required = parseLevel(minLevel);
    // the children see no token: they print to a log that a PR author can influence
    const childEnv = Object.fromEntries(Object.entries(env).filter(([k]) => !/^(GITHUB_TOKEN|ACTIONS_RUNTIME_TOKEN|ACTIONS_ID_TOKEN_REQUEST_TOKEN|FACET_KEYS?)$/.test(k)));
    const facet = (...args) => spawnSync(process.execPath, [facetBin, ...args], { cwd, env: childEnv, encoding: 'utf-8', timeout: 15 * 60 * 1000 });
    const commandEnv = safeEnv({ allow: project.govern?.env ?? [] });
    const checks = {};

    const b = changeBase(cwd, { base, env });
    if (b.error) {
        checks.scan = { status: 'FAIL', details: b.error };
        return finish({ itemId, mode: 'stateless', base: null, level: 'L0', required, checks, error: b.error });
    }

    const scan = facet('scan', '--ref', b.ref);
    checks.scan = { status: scanStatus(scan.status), details: firstLine(scan) };

    const inJournal = Object.keys(project).length > 0 && readJournal(journal).some((e) => e.item === itemId);
    if (inJournal) {
        const j = facet('journal');
        checks.journal = { status: j.status === 0 ? 'PASS' : 'FAIL', details: firstLine(j) };
        const a = facet('assure', '--item', itemId, '--json', '--level', '0');
        let level = 0;
        try {
            level = Number(JSON.parse(a.stdout).level) || 0;
            checks.assure = { status: 'PASS', details: `L${level} from the journal` };
        } catch {
            checks.assure = { status: 'FAIL', details: firstLine(a) || 'facet assure gave no answer' };
        }
        const p = facet('proof', 'verify', '--item', itemId);
        const noPack = /has no proof pack/.test(`${p.stdout}${p.stderr}`);
        checks.proof = noPack ? { status: 'SKIPPED', details: 'no proof pack for this item in this checkout' } : { status: p.status === 0 ? 'PASS' : 'FAIL', details: (`${p.stdout}`.match(/\b(VALID|STALE|TAMPERED|UNSIGNED|DECAYED)\b/) ?? [firstLine(p)])[0] };
        const sound = checks.scan.status !== 'FAIL' && checks.journal.status === 'PASS' && checks.assure.status === 'PASS' && checks.proof.status !== 'FAIL';
        return finish({ itemId, mode: 'journal', base: b.how, level: sound ? `L${level}` : 'L0', required, checks });
    }

    // stateless: L1 a clean scan · L2 the tests pass · L3 deliberate breakages of the changed code are noticed (≥ 80 %)
    let level = checks.scan.status === 'FAIL' ? 0 : 1;
    const files = changedFiles(cwd, b.ref);
    const sources = sourceFiles(cwd, files);
    const test = detectTestCommand(cwd, testCmd);
    if (!test) {
        checks.tests = { status: 'FAIL', details: 'no test command found — give one: test-command (action) or --test-cmd' };
        return finish({ itemId, mode: 'stateless', base: b.how, level: 'L0', required, checks, files });
    }
    if (sources.length) {
        const dirs = project.dirs ?? ['src', 'lib', 'app', 'server', 'pkg', 'cmd', 'internal', 'tests', 'test'];
        const n = neighbours(buildGraph(cwd, dirs), sources, { depth: 2 });
        const r = probe({ cwd, files: sources, test, ref: b.ref, max, maxMinutes, env: commandEnv });
        if (r.baseline !== 'green') {
            checks.tests = { status: 'FAIL', details: `${test}: ${r.message}` };
            level = 0;
        } else {
            checks.tests = { status: 'PASS', details: `${test} passed` };
            checks.seams = { status: 'PASS', details: `${n.consumers.length} file(s) depend on the change; their tests ran in the full suite` };
            if (level >= 1) level = 2;
            if (!r.planned) checks.mutate = { status: 'SKIPPED', details: 'no line of the change can be mutated' };
            else {
                const pct = Math.round((r.score ?? 0) * 100);
                checks.mutate = { status: pct >= 80 ? 'PASS' : 'WARN', details: `${pct} % of mutants noticed (${r.killed}/${r.planned})${r.survived.length ? ` · survived: ${r.survived.slice(0, 3).map((s) => `${s.file}:${s.line}`).join(', ')}` : ''}` };
                if (level >= 2 && pct >= 80) level = 3;
            }
        }
    } else {
        const r = runShellSync(test, { cwd, env: commandEnv, timeoutSec: maxMinutes * 60 });
        checks.tests = r.status === 0 ? { status: 'PASS', details: `${test} passed` } : { status: 'FAIL', details: `${test}: exit ${r.status}${r.timedOut ? ' (time limit)' : ''}` };
        checks.mutate = { status: 'NOT-NEEDED', details: 'the change touches no source code (only docs, configuration or tests), so there is nothing to mutate' };
        if (r.status === 0 && level >= 1) level = 2;
        else if (r.status !== 0) level = 0;
    }
    return finish({ itemId, mode: 'stateless', base: b.how, level: `L${level}`, required, checks, files });
}

function finish({ itemId, mode, base, level, required, checks, files, error }) {
    const passed = LEVEL_RANK[level] >= LEVEL_RANK[required] && checks.scan?.status !== 'FAIL' && !Object.values(checks).some((c) => c.status === 'FAIL');
    return { itemId, mode, base, level, minLevel: required, passed, checks, changed: files, error, at: new Date().toISOString() };
}
