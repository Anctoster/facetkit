import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function tmp(prefix = 'facetkit-') {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
export function write(root, file, content) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
}
export function gitInit(root) {
    const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf-8' });
    git('init', '-q');
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'init');
}
export const facet = (id, { body, meta = '' } = {}) => `---\nid: ${id}\n${meta}---\n# ${id} title\n\n${body ?? `Do: perform the ${id} step with care.\nCheck: \`facet run -- echo ${id}\` prints the id back.\nStop: after 3 attempts report BLOCKED.\nWhy: prevents ${id} mistakes.`}\n`;
export const skillIndex = (name, ids) => `---\nname: ${name}\ndescription: Use when testing ${name}.\n---\n# ${name}\n\n## Facets\n${ids.map((i) => `- \`${i}\``).join('\n')}\n\n## Trials\n1. Pressure: hurry. Pass: follows the facet.\n2. Pressure: sunk cost. Pass: stops at the bound.\n`;

/** An in-memory journal with a clock that advances by `step` minutes per event. */
export function story(start = '2026-01-05T09:00:00.000Z') {
    const events = [];
    let t = new Date(start).getTime();
    const say = (e, minutes = 1) => {
        t += minutes * 60000;
        events.push({ at: new Date(t).toISOString(), ...e });
        return events;
    };
    const api = {
        events,
        say,
        open: (item, steps, extra = {}) => say({ kind: 'item.open', item, tier: 'normal', steps, rerun: ['proof'], ...extra }),
        run: (item, step, agent, { model = 'sonnet', status = 'DONE', minutes = 10, tokens = 1000, ...rest } = {}) => {
            say({ kind: 'step.start', item, step, agent, model });
            return say({ kind: 'step.end', item, step, agent, status, tokens, ...rest }, minutes);
        },
        /** A whole item: map → build → proof, optionally with one rework addressed to `blame`. */
        item: (item, { models = {}, blame = null, score = {}, tier = 'normal', tokens = {}, minutes = 10, version = 'v1' } = {}) => {
            api.open(item, STEPS, { tier, version });
            api.run(item, 'map', 'mapper', { model: models.mapper ?? 'haiku', tokens: tokens.mapper ?? 1000, minutes });
            api.run(item, 'build', 'builder', { model: models.builder ?? 'sonnet', tokens: tokens.builder ?? 5000, minutes });
            api.run(item, 'proof', 'inspector', { model: models.inspector ?? 'sonnet', tokens: tokens.inspector ?? 2000, minutes });
            if (blame) {
                say({ kind: 'verdict', item, verdict: 'REWORK', fixes: [{ agent: blame }] });
                const step = STEPS.find((s) => s.agent === blame).id;
                api.run(item, step, blame, { model: models[blame] ?? 'sonnet', minutes });
                api.run(item, 'proof', 'inspector', { minutes });
            }
            say({ kind: 'verdict', item, verdict: 'PASS', fixes: [], scores: score });
            return say({ kind: 'item.close', item, commit: `c0ffee${item}` });
        },
    };
    return api;
}
export const STEPS = [
    { id: 'map', agent: 'mapper', phase: 'map' },
    { id: 'build', agent: 'builder', phase: 'build' },
    { id: 'proof', agent: 'inspector', phase: 'proof', verdict: true },
];
