// domainproof: which files a domain item's proof rests on (plan 2.3).
//
// A domain item (a model, a scene, a set of renders) is not a git tree. Its proof is bound to the
// files the domain declares as its artifacts: `artifacts` in domain.json, globs relative to the
// domain root, where <ITEM> stands for the item's own id in the domain journal. The domain root is
// the folder of the domain journal the item was imported from (facet domain import), so nothing
// has to be configured twice.
//
// Where the list comes from, first found wins: <domain root>/domain.json (the project's own),
// the domain.json the kit ships for that domain, then work/<ITEM>/** — where both engines write.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAFE_ITEM } from './shell.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_ARTIFACTS = ['work/<ITEM>/**'];
const SAFE_DOMAIN = /^[a-z][a-z0-9-]{0,31}$/;

/** The kit's own domain file for a domain, if it ships one. */
export const kitDomainFile = (domain) => path.join(KIT, 'domains', domain, 'skills', `${domain}-item`, 'scripts', 'domain.json');

/** A declared pattern stays inside the domain root: relative, no "..", no backslashes, no drive. */
function checkPattern(p, from) {
    if (typeof p !== 'string' || !p.trim()) throw new Error(`${from}: an artifact pattern is a non-empty string`);
    if (p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.includes('\\') || p.split('/').includes('..')) throw new Error(`${from}: artifact pattern ${JSON.stringify(p)} leaves the domain root — patterns are relative, with "/" and without ".."`);
    return p;
}

function artifactsFrom(file) {
    if (!fs.existsSync(file)) return null;
    let d;
    try {
        d = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (error) {
        throw new Error(`${file}: not JSON (${error.message})`);
    }
    if (d.artifacts === undefined) return null;
    if (!Array.isArray(d.artifacts) || !d.artifacts.length) throw new Error(`${file}: "artifacts" is a non-empty list of globs`);
    return d.artifacts.map((p) => checkPattern(p, file));
}

/**
 * The declared artifacts of one imported item, as globs relative to `cwd` (the proof's root):
 * { root, domainItem, from, globs }. Throws with a message a person can act on.
 */
export function declaredArtifacts({ cwd, events, item, domain, root = null }) {
    if (!SAFE_DOMAIN.test(domain ?? '')) throw new Error('name the domain, e.g. --domain arch or --domain viz');
    const mine = events.filter((e) => e.item === item && e.domain === domain && e.src?.journal);
    if (!mine.length && !root) throw new Error(`${item} has no events imported from a ${domain} journal — facet domain import <journal.jsonl> --domain ${domain} first, or name the folder with --domain-root`);
    const journals = [...new Set(mine.map((e) => e.src.journal))];
    if (journals.length > 1 && !root) throw new Error(`${item} was imported from more than one ${domain} journal (${journals.join(', ')}) — name the one with --domain-root`);
    const rootAbs = path.resolve(cwd, root ?? path.dirname(journals[0]));
    const rel = path.relative(cwd, rootAbs).split(path.sep).join('/');
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`the domain root ${rootAbs} is outside this project — a proof covers files under the project only`);
    const domainItem = mine.find((e) => e.domainItem)?.domainItem ?? item;
    if (!SAFE_ITEM.test(domainItem)) throw new Error(`item ${JSON.stringify(domainItem)} is not usable in a path`);
    const own = path.join(rootAbs, 'domain.json');
    let from = own;
    let patterns = artifactsFrom(own);
    if (!patterns) [from, patterns] = [kitDomainFile(domain), artifactsFrom(kitDomainFile(domain))];
    if (!patterns) [from, patterns] = ['default', DEFAULT_ARTIFACTS];
    const globs = patterns.map((p) => `${rel ? `${rel}/` : ''}${p.replaceAll('<ITEM>', domainItem)}`);
    return { root: rel || '.', domainItem, from: from === 'default' ? from : path.relative(cwd, from).split(path.sep).join('/') || from, globs };
}
