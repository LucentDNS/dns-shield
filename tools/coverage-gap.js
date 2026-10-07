#!/usr/bin/env node
/**
 * coverage-gap.js - explain the distance between our published list and a peer's.
 *
 * A benchmark number like "we carry 95% of OISD Big" is only actionable if the missing 5% is
 * explained. Every reason a peer rule does not reach our output needs a different response:
 *
 *   coveredByAncestor   a parent rule already blocks it - DNS never sees the query   -> intended
 *   excluded            upstream or local policy removed it after a breakage report -> intended
 *   guarded             a shared CDN/hosting apex we release on purpose              -> intended
 *   whitelisted         our own whitelist releases it                                -> intended
 *   unspecified         it reaches the emitted rule list but is not published        -> BUG
 *   droppedAtCompile    it never survived hostlist-compiler                          -> BUG
 *
 * The classification is derived from the build's own artifacts rather than by re-implementing the
 * pipeline: `unspecified` is computed by inversion (peer minus every set we can positively
 * identify), so anything the tool fails to model shows up as a defect instead of being silently
 * absorbed by a bucket. An earlier version re-implemented the stages and produced counts that
 * disagreed with the build log; that is exactly the failure mode this shape avoids.
 *
 *   node tools/coverage-gap.js [peer-id]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, '.cache', 'sources');
const DIST = path.join(ROOT, 'dist');

const RE_LABEL = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const RE_BLOCK = /^\|\|([a-z0-9][a-z0-9.-]*)\^$/;
// The trailing `|` is optional and AdGuard's own exception feed starts using it: of 172 allow
// rules in .cache/sources/adguard-exceptions.txt, the ones near the top look like
// `@@||aax-fe.amazon.co.jp^|`. An earlier `\^$` here parsed 0 of them, which silently removed the
// whole allow section from this model and made 19 legitimately-released domains look like defects.
const RE_ALLOW = /^@@\|\|([a-z0-9][a-z0-9.-]*)\^\|?$/;
const num = (n) => Number(n).toLocaleString('en-US');

/** Accepts both raw adblock feeds and build-normalised caches (one bare domain per line). */
function loadNormalised(p) {
    const s = new Set();
    if (!fs.existsSync(p)) { console.error(`missing input: ${p}`); return s; }
    for (const raw of fs.readFileSync(p, 'utf8').split('\n')) {
        const d = raw.trim().toLowerCase();
        if (!d || d.startsWith('#') || d.startsWith('!')) continue;
        if (RE_LABEL.test(d)) { s.add(d); continue; }
        const m = d.match(RE_BLOCK);
        if (m && RE_LABEL.test(m[1])) s.add(m[1]);
    }
    return s;
}

/** Reads a published or intermediate rule file into its block and allow sets. */
function loadRules(p) {
    const block = new Set();
    const allow = new Set();
    if (!fs.existsSync(p)) { console.error(`missing input: ${p}`); return { block, allow }; }
    for (const raw of fs.readFileSync(p, 'utf8').split('\n')) {
        const l = raw.trim().toLowerCase();
        if (!l || l.startsWith('!') || l.startsWith('#')) continue;
        let m = l.match(RE_ALLOW);
        if (m) { if (RE_LABEL.test(m[1])) allow.add(m[1]); continue; }
        m = l.match(RE_BLOCK);
        if (m) { if (RE_LABEL.test(m[1])) block.add(m[1]); continue; }
        if (!l.includes('/') && !l.includes(' ') && RE_LABEL.test(l)) block.add(l);
    }
    return { block, allow };
}

function subtree(root) {
    const p = root.split('.');
    const out = [];
    for (let i = 0; i <= p.length - 2; i += 1) out.push(p.slice(i).join('.'));
    return out;
}

const peerId = process.argv[2] || 'oisd-big';

const peer = loadNormalised(path.join(CACHE, `${peerId}.txt`));
const ours = loadRules(path.join(DIST, 'dns-shield.txt'));
const compiled = loadRules(path.join(DIST, '.compiled.raw'));

// The build logs its policy sets directly, so the classifier never has to guess at them.
const exclusions = new Set([
    ...loadNormalised(path.join(CACHE, 'adguard-exclusions.txt')),
    ...loadNormalised(path.join(ROOT, 'data', 'private-exclusions.txt')),
]);
const guards = loadNormalised(path.join(ROOT, 'data', 'guards.txt'));
const never = loadNormalised(path.join(ROOT, 'data', 'never-whitelist.txt'));

const wlExact = new Set();
const wlTrees = new Set();
for (const raw of fs.readFileSync(path.join(ROOT, 'data', 'whitelist.txt'), 'utf8').split('\n')) {
    const l = raw.trim().toLowerCase();
    if (!l || l.startsWith('#')) continue;
    const tree = l.startsWith('@');
    const d = tree ? l.slice(1).replace(/^\./, '') : l;
    if (!RE_LABEL.test(d)) continue;
    if (tree) wlTrees.add(d); else wlExact.add(d);
}

/* ── the two sets that actually describe the product ─────────────────────────────────────────
 * emitted  : every rule the build produced (compiled set, minus its policy releases, plus the
 *            curated patch rules and the never-whitelist re-assertions)
 * released : every domain the build deliberately handed back
 * Both are derived from the artifacts, then checked against the published file.
 */
const released = new Set();
const blockedInCompiled = new Set();

// Guards release the bare apex only - every subdomain stays blocked, which is the whole point of
// a guard (`github.io` works, `evil.github.io` does not). So a guarded apex must not release the
// children in this model either, or every blocked subdomain of a guarded apex looks unmodelled.
for (const d of compiled.block) {
    if (exclusions.has(d)) { released.add(d); continue; }
    if (guards.has(d)) { released.add(d); continue; }
    // An exact whitelist entry releases that hostname only - its subdomains stay blocked. Only a
    // whole-tree entry (`@domain.com`) releases descendants. Modelling the exact list as a tree
    // was what made 457 blocked `*.github.io` hosts look like they were published without a rule.
    if (wlExact.has(d)) { released.add(d); continue; }
    let hit = null;
    for (const a of subtree(d)) {
        if (wlTrees.has(a)) { hit = a; break; }
    }
    if (hit) { released.add(d); continue; }
    blockedInCompiled.add(d);
}

// Diagnostic: name the release path for anything the model still cannot account for.
if (process.argv.includes('--debug')) {
    const probe = process.argv[process.argv.indexOf('--debug') + 1];
    if (probe) {
        console.log(`DEBUG ${probe}`);
        console.log(`  compiled.block.has   ${compiled.block.has(probe)}`);
        console.log(`  exclusions.has       ${exclusions.has(probe)}`);
        console.log(`  exclusions ancestor  ${subtree(probe).filter((a) => exclusions.has(a)).join(',') || 'none'}`);
        console.log(`  guards.has           ${guards.has(probe)}`);
        console.log(`  guards ancestor      ${subtree(probe).filter((a) => guards.has(a)).join(',') || 'none'}`);
        console.log(`  wlExact ancestor     ${subtree(probe).filter((a) => wlExact.has(a)).join(',') || 'none'}`);
        console.log(`  wlTrees ancestor     ${subtree(probe).filter((a) => wlTrees.has(a)).join(',') || 'none'}`);
        console.log(`  never.has            ${never.has(probe)}`);
        console.log(`  ours.block.has       ${ours.block.has(probe)}`);
        process.exit(0);
    }
}
// never-whitelist re-asserts protected domains after every release decision. Two ways in:
//   (a) the feeds carry it, so the compiler emitted it, and a whitelist tree released it;
//   (b) the feeds carry only its parent, but a whitelist tree entry released that parent's whole
//       tree, so the protected host has to be put back by hand (see stage 5b in tools/build.js).
for (const d of never) {
    if (compiled.block.has(d)) { blockedInCompiled.add(d); continue; }
    if (subtree(d).some((a) => wlTrees.has(a))) blockedInCompiled.add(d);
}
// curated patch rules are asserted last of all.
for (const raw of fs.readFileSync(path.join(ROOT, 'data', 'extra-block.txt'), 'utf8').split('\n')) {
    const d = raw.trim().toLowerCase().replace(/^\./, '');
    if (d && !d.startsWith('#') && RE_LABEL.test(d)) blockedInCompiled.add(d);
}

// The allow section can only exist for domains that were blocked before the exceptions ran.
const allowRules = ours.allow;
for (const d of allowRules) blockedInCompiled.delete(d);

// Reconcile in both directions, and keep the directions separate. They mean different things:
// emitted-but-unpublished is a defect; published-but-not-derived usually means the model above
// missed a release path (for example a guarded apex whose subdomains survive), and needs the
// model widened rather than the product changed.
const blockedByUs = [...blockedInCompiled].filter((d) => !ours.block.has(d));
const missedByModel = [...ours.block].filter((d) => !blockedInCompiled.has(d));
const reconciliation = [...blockedByUs, ...missedByModel];

console.log(`coverage gap: our list vs ${peerId}`);
console.log(`  peer rules                ${num(peer.size)}`);
console.log(`  published block rules     ${num(ours.block.size)}`);
console.log(`  published allow rules     ${num(allowRules.size)}`);
console.log(`  compiled set              ${num(compiled.block.size)}`);
console.log(`  emitted set (derived)     ${num(blockedInCompiled.size)}`);
console.log(`  peer rules we block       ${num([...peer].filter((d) => ours.block.has(d)).length)}`);
console.log(`  peer rules we do not      ${num([...peer].filter((d) => !ours.block.has(d)).length)}`);
if (reconciliation.length) {
    console.log(`  RECONCILIATION            ${num(blockedByUs.length)} rule(s) we emit but do not publish,`);
    console.log(`                            ${num(missedByModel.length)} rule(s) we publish that the model above`);
    console.log(`                            did not account for.`);
    if (blockedByUs.length) console.log(`    unpublished samples: ${blockedByUs.slice(0, 6).join(', ')}`);
    if (missedByModel.length) console.log(`    unmodelled samples:  ${missedByModel.slice(0, 6).join(', ')}`);
} else {
    console.log('  reconciliation            derived emitted set matches the published file exactly');
}

const missing = [...peer].filter((d) => !ours.block.has(d));
const buckets = {
    coveredByAncestor: [],
    excluded: [],
    guarded: [],
    whitelisted: [],
    droppedAtCompile: [],
    unspecified: [],
};

/* The classifier answers one question per domain: why is this peer rule not in our published list?
 * The order matters. Asking "did the compiler drop it?" first is wrong, because a domain can be
 * present in the compiled set AND absent from the published file for four different policy reasons.
 * Every release test therefore runs before the compiler-loss test, and a domain that no release
 * path explains - and that is also missing from the compiled set - is the only genuine compiler
 * loss. Anything left after all of that reaches the emitted set but not the file, which is a bug.
 */
missing.forEach((d) => {
    // Exclusions release the exact hostname only - tools/build.js stage 3 deletes `exclusions.has(d)`
    // and nothing else, so an excluded parent does NOT release its children. Testing the ancestors
    // here as well would move domains that are genuinely gone-because-the-compiler-folded-them into
    // the `excluded` bucket and hide real regressions behind a policy label.
    if (exclusions.has(d)) { buckets.excluded.push(d); return; }
    if (guards.has(d)) { buckets.guarded.push(d); return; }
    if (wlExact.has(d)) { buckets.whitelisted.push(d); return; }
    if (subtree(d).some((a) => wlTrees.has(a))) { buckets.whitelisted.push(d); return; }
    if (never.has(d)) { buckets.whitelisted.push(d); return; }
    if (allowRules.has(d)) { buckets.whitelisted.push(d); return; }
    if (!compiled.block.has(d)) {
        // Not in the compiled set and no policy released it. Either the compiler folded it away
        // because an ancestor is blocked (harmless - DNS never sees the query), or it was lost.
        if (subtree(d).some((a) => compiled.block.has(a))) { buckets.coveredByAncestor.push(d); return; }
        buckets.droppedAtCompile.push(d);
        return;
    }
    buckets.unspecified.push(d);
});

console.log('');
console.log(`  ${'bucket'.padEnd(24)}count   verdict`);
const verdicts = {
    coveredByAncestor: 'intended - an ancestor rule blocks it',
    excluded: 'intended - upstream policy',
    guarded: 'intended - shared infrastructure',
    whitelisted: 'intended - our own whitelist',
    droppedAtCompile: 'BUG - lost in hostlist-compiler',
    unspecified: 'BUG - blocked but not published',
};
Object.entries(buckets).forEach(([k, v]) => {
    console.log(`  ${k.padEnd(24)}${String(v.length).padStart(6)}   ${verdicts[k]}`);
});

const defects = [...buckets.droppedAtCompile, ...buckets.unspecified];
if (defects.length) {
    console.log('');
    console.log(`  first 25 defects:`);
    defects.slice(0, 25).forEach((d) => console.log(`    ${d}`));
}

const intended = Object.entries(buckets)
    .filter(([k]) => k !== 'droppedAtCompile' && k !== 'unspecified')
    .reduce((s, [, v]) => s + v.length, 0);
console.log('');
console.log(`  ${num(intended)} of ${num(missing.length)} un-carried peer rules are intended; ${num(defects.length)} are defects`);
process.exitCode = defects.length || reconciliation.length ? 1 : 0;
