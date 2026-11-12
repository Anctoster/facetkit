// An example extension: a project rule that facetkit does not ship — "an item that changes
// product code must also change the changelog" — added as a check (which produces evidence)
// and a policy rule (which requires that evidence at level 2).
//
// Enable it in package.json:  "facetkit": { "extensions": ["./examples/extension-changelog.mjs"] }
// Then:                        facet check changelog --item <ID>
//
// An extension is a module whose default export may have:
//   checks    { name: async ({ cwd, item, events }) => ({ ok, value }) }   evidence producers
//   rules     [ policy rules ]                                             appended to the policy
//   route     (step, { state, base, events }) => model | null              overrides the model of a step
//   commands  { name: () => void }                                         extra `facet <name>` commands
import { spawnSync } from 'node:child_process';

export default {
    name: 'changelog',
    checks: {
        async changelog({ cwd, item, events }) {
            const base = events.find((e) => e.kind === 'item.open' && e.item === item)?.base ?? 'HEAD';
            const git = (...args) => (spawnSync('git', args, { cwd, encoding: 'utf-8' }).stdout ?? '').split('\n').filter(Boolean);
            const changed = [...git('diff', '--name-only', base), ...git('ls-files', '--others', '--exclude-standard')];
            const product = changed.filter((f) => /^(src|server|lib)\//.test(f));
            const ok = product.length === 0 || changed.includes('CHANGELOG.md');
            return { ok, value: ok ? 'present' : `${product.length} product file(s) changed, CHANGELOG.md untouched` };
        },
    },
    rules: [{ id: 'changelog', level: 2, evidence: ['changelog'], ok: true, why: 'a change of product code is described in the changelog' }],
};
