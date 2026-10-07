/**
 * Which domains does a whitelist filter release from the published list?
 *
 * AdGuard Home applies whitelist filters over blocklists, so an `@@` rule in an installed allowlist
 * silently punches a hole through dist/dns-shield.txt. This prints every hole, grouped by the
 * registrable domain, so the trade-off can be judged instead of guessed.
 *
 *   node tools/whitelist-impact.js <whitelist-file> [list-file]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const RE_ALLOW_RULE = /^@@\|\|([a-z0-9*][a-z0-9.*-]*)\^$/i;
const RE_BLOCK = /^\|\|([a-z0-9][a-z0-9.-]*)\^$/;

const wlPath = process.argv[2];
if (!wlPath) {
    console.error('usage: node tools/whitelist-impact.js <whitelist-file> [list-file]');
    process.exit(2);
}
const listPath = process.argv[3] || path.join(__dirname, '..', 'dist', 'dns-shield.txt');

function readList(p) {
    return fs.readFileSync(p, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
}

// Our block set, plus a helper that walks ancestors the way AdGuard does.
const blocked = new Set();
for (const line of readList(listPath)) {
    const m = line.match(RE_BLOCK);
    if (m) blocked.add(m[1]);
}

function registrable(host) {
    const parts = host.split('.');
    return parts.length <= 2 ? host : parts.slice(-2).join('.');
}

const allow = readList(wlPath).map((l) => l.match(RE_ALLOW_RULE)).filter(Boolean).map((m) => m[1].toLowerCase());
const exact = [];
const wildcard = [];
for (const rule of allow) {
    if (rule.includes('*')) wildcard.push(rule);
    else exact.push(rule);
}

const hit = new Set();
const hitWildcard = new Set();
for (const d of exact) {
    if (blocked.has(d)) { hit.add(d); continue; }
    // An allow rule with no exact match still matters when a narrower ancestor is blocked.
    const parts = d.split('.');
    for (let i = 0; i <= parts.length - 1; i += 1) {
        if (blocked.has(parts.slice(i).join('.'))) { hit.add(d); break; }
    }
}
for (const w of wildcard) {
    // Turn the wildcard into a loose prefix/suffix test against blocked names.
    const rx = new RegExp('^' + w.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9.-]*') + '$');
    for (const b of blocked) if (rx.test(b)) { hitWildcard.add(w); break; }
}

const byDomain = new Map();
for (const d of hit) {
    const key = registrable(d);
    if (!byDomain.has(key)) byDomain.set(key, []);
    byDomain.get(key).push(d);
}

console.log(`${path.basename(wlPath)}: ${allow.length} allow rules (${exact.length} exact, ${wildcard.length} wildcard)`);
console.log(`${path.basename(listPath)}: ${blocked.size.toLocaleString('en-US')} block rules`);
console.log('');
console.log(`holes opened in our list: ${hit.size} exact + ${hitWildcard.size} wildcard`);
console.log(`distinct registrable domains affected: ${byDomain.size}`);
console.log('');
const sorted = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [dom, hosts] of sorted.slice(0, 60)) {
    console.log(`  ${dom.padEnd(34)} ${hosts.length} host(s)  ${hosts.slice(0, 4).join(', ')}${hosts.length > 4 ? ', ...' : ''}`);
}
if (sorted.length > 60) console.log(`  ...and ${sorted.length - 60} more registrable domains`);
if (hitWildcard.size) {
    console.log('');
    console.log('wildcard rules that cover something we block:');
    for (const w of hitWildcard) console.log(`  @@||${w}^`);
}
