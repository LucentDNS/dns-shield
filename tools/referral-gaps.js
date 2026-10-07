/**
 * Write REFERRAL-GAPS.md: every domain that HaGeZi's Allowlist Referral would release from
 * dist/dns-shield.txt, grouped and annotated so a human can pick which referral links to keep.
 *
 * The allowlist is a legitimate trade-off (it keeps affiliate/referral click-tracking resolvable),
 * but AdGuard Home applies whitelist filters over blocklists, so it punches 273 holes straight
 * through this list. This report exists so that decision can be made from data.
 *
 *   node tools/referral-gaps.js [allowlist-file] [out-file]
 *   node tools/referral-gaps.js --check        # verify REFERRAL-GAPS.md is up to date
 *
 * The allowlist is not one of this project's sources, so it is not fetched into .cache/sources.
 * By default the compiler's own record of AdGuard's exception feed is used when present, which
 * keeps the report reproducible on any machine; point the first argument at an installed copy
 * (e.g. C:\AdGuardHome\data\filters\45.txt) to document exactly what a live instance would do.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const RE_ALLOW_RULE = /^@@\|\|([a-z0-9*][a-z0-9.*-]*)\^$/i;
const RE_BLOCK = /^\|\|([a-z0-9][a-z0-9.-]*)\^$/;

const ROOT = path.join(__dirname, '..');
const checkOnly = process.argv.includes('--check');
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/**
 * Candidate allowlist inputs, most specific first. The project's own cache wins so the report is
 * reproducible on any machine (tools/fetch.js caches the feed it names); an installed AdGuard Home
 * copy is used next, because documenting exactly what a live instance does is the more useful
 * answer when one is available.
 */
const WL_CANDIDATES = [
    positional[0],
    path.join(ROOT, '.cache', 'sources', 'allowlist-referral.txt'),
    'C:\\AdGuardHome\\data\\filters\\45.txt',
].filter(Boolean);

const wlPath = WL_CANDIDATES.find((p) => { try { return fs.statSync(p).size > 0; } catch (e) { return false; } });
if (!wlPath) {
    console.error('no allowlist file found; tried:');
    for (const p of WL_CANDIDATES) console.error(`  ${p}`);
    console.error('\npass one explicitly: node tools/referral-gaps.js <allowlist-file>');
    process.exit(2);
}

const outPath = positional[1] || path.join(ROOT, 'REFERRAL-GAPS.md');
const listPath = path.join(ROOT, 'dist', 'dns-shield.txt');

/**
 * Why a released domain matters, by registrable domain. Only entries that actually appear in the
 * report are listed here; everything else is reported as "referral / affiliate link tracker".
 */
const WHY = {
    'adjust.com': 'mobile app attribution SDK (installs, sessions, in-app events)',
    'adjust.cn': 'mobile app attribution SDK, China',
    'adjust.io': 'mobile app attribution SDK',
    'adjust.world': 'mobile app attribution SDK',
    'appsflyer.com': 'mobile app attribution and fraud SDK',
    'adform.net': 'programmatic ad serving',
    'adform.com': 'programmatic ad serving',
    'amazon-adsystem.com': 'Amazon advertising',
    'a9.com': 'Amazon advertising',
    'doubleclick.net': 'Google advertising',
    'adzerk.com': 'ad serving platform',
    'adzerk.net': 'ad serving platform',
    'flashtalking.com': 'ad serving and creative analytics',
    'revjet.com': 'ad serving',
    'adverticum.net': 'ad serving',
    'kochava.com': 'mobile attribution',
    'branch.io': 'mobile attribution and deep linking',
    'impactradius.com': 'affiliate network',
    'narrativ.com': 'affiliate link monetisation',
    'pstmrk.it': 'affiliate link shortener (Postmark)',
    'clickguard.com': 'click fraud and affiliate tracking',
    'sp-trk.com': 'affiliate tracking',
    '2performant.com': 'affiliate network',
    'accesstrade.net': 'affiliate network',
    'affiliatefuture.com': 'affiliate network',
    'affilired.com': 'affiliate network',
    'metaffiliation.com': 'affiliate network',
    'effiliation.com': 'affiliate network',
    'reddit.com': 'ads.reddit.com (advertising)',
    'adservice.google.com': 'Google ad serving (wildcard rule)',
    'customeriomail.com': 'marketing email click tracking (wildcard rule)',
    'klclick.com': 'marketing email click tracking (wildcard rule)',
};

function readLines(p) {
    return fs.readFileSync(p, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
}

const blocked = new Set();
for (const line of readLines(listPath)) {
    const m = line.match(RE_BLOCK);
    if (m) blocked.add(m[1].toLowerCase());
}

function registered(host) {
    const parts = host.split('.');
    return parts.length <= 2 ? host : parts.slice(-2).join('.');
}

/**
 * A co.uk / ne.jp / com.tw style public suffix, so two-label tail is not always the registrable domain.
 */
const MULTI_LABEL_SUFFIX = new Set([
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk', 'sch.uk',
    'com.au', 'net.au', 'org.au', 'com.br', 'com.cn', 'net.cn', 'org.cn',
    'com.tw', 'org.tw', 'com.hk', 'com.sg', 'com.my', 'co.jp', 'ne.jp', 'or.jp', 'ac.jp',
    'co.kr', 'or.kr', 'com.mx', 'com.ar', 'co.nz', 'co.za', 'com.tr', 'com.pl', 'com.ua',
]);

function groupingKey(host) {
    const parts = host.split('.');
    if (parts.length <= 2) return host;
    const lastTwo = parts.slice(-2).join('.');
    if (MULTI_LABEL_SUFFIX.has(lastTwo) && parts.length >= 3) return parts.slice(-3).join('.');
    return lastTwo;
}

const allowRules = readLines(wlPath)
    .map((l) => l.match(RE_ALLOW_RULE))
    .filter(Boolean)
    .map((m) => m[1].toLowerCase());

const exact = allowRules.filter((r) => !r.includes('*'));
const wildcard = allowRules.filter((r) => r.includes('*'));

const released = new Set();
for (const d of exact) {
    if (blocked.has(d)) { released.add(d); continue; }
    const parts = d.split('.');
    for (let i = 0; i < parts.length; i += 1) {
        if (blocked.has(parts.slice(i).join('.'))) { released.add(d); break; }
    }
}

const wildcardHits = [];
for (const w of wildcard) {
    const rx = new RegExp('^' + w.split('*')
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('[a-z0-9.-]*') + '$');
    const covered = [];
    for (const b of blocked) if (rx.test(b)) covered.push(b);
    if (covered.length) wildcardHits.push({ rule: w, covered: covered.sort() });
}

const groups = new Map();
for (const host of released) {
    const key = groupingKey(host);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(host);
}
const ordered = [...groups.entries()].sort((a, b) => {
    const an = WHY[a[0]] ? 0 : 1;
    const bn = WHY[b[0]] ? 0 : 1;
    if (an !== bn) return an - bn;
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0]);
});

const out = [];
out.push('# Referral allowlist gaps / 返利白名单漏洞清单');
out.push('');
out.push('<!-- Generated by tools/referral-gaps.js - do not edit by hand. -->');
out.push('');
out.push(`Source allowlist: \`${path.basename(wlPath)}\` (HaGeZi's Allowlist Referral, AdGuard Home filter_45)`);
out.push('');
out.push(`Against \`dist/dns-shield.txt\` (${blocked.size.toLocaleString('en-US')} block rules) that allowlist`);
out.push(`releases **${released.size} exact hostnames** across **${groups.size} registrable domains**,`);
out.push(`plus **${wildcardHits.length} wildcard rules** that each cover blocked names.`);
out.push('');
out.push('AdGuard Home applies whitelist filters *over* blocklists, so while that filter is enabled');
out.push('these hostnames resolve normally instead of being blocked. The filter is off by default in');
out.push('this deployment; the list below is what you give up by turning it off, and what comes back');
out.push('if you turn it on.');
out.push('');
out.push('## The trade-off / 取舍');
out.push('');
out.push('- **Leave it off** (current): all of these stay blocked. Referral and affiliate links that');
out.push('  funnel through these trackers may fail to redirect.');
out.push('- **Leave it on**: referral links work, but mobile attribution SDKs such as `adjust.com` and');
out.push('  `appsflyer.com`, plus `a9.com`, `ad.doubleclick.net` and `amazon-adsystem.com`, resolve again.');
out.push('- **Middle path** (recommended): keep it off and add only the referral hosts you actually use');
out.push('  to `user_rules` in `C:\\AdGuardHome\\AdGuardHome.yaml`, as `@@||host^` lines.');
out.push('');
out.push('## Ad and attribution infrastructure worth a second look / 值得留意的广告与归因基础设施');
out.push('');
out.push('| Domain | Hosts released | What it is |');
out.push('| --- | --- | --- |');
for (const [domain, hosts] of ordered) {
    if (!WHY[domain]) continue;
    out.push(`| \`${domain}\` | ${hosts.length} | ${WHY[domain]} |`);
}
out.push('');
out.push('## All released hostnames / 全部被放行的主机名');
out.push('');
for (const [domain, hosts] of ordered) {
    const note = WHY[domain] ? ` - _${WHY[domain]}_` : '';
    out.push(`### ${domain} (${hosts.length})${note}`);
    out.push('');
    for (const h of hosts.sort()) out.push(`- \`${h}\``);
    out.push('');
}
out.push('## Wildcard rules that cover blocked names / 覆盖了拦截项的通配符规则');
out.push('');
for (const { rule, covered } of wildcardHits) {
    out.push(`- \`@@||${rule}^\` covers ${covered.length} blocked name(s): ${covered.slice(0, 6).map((c) => `\`${c}\``).join(', ')}${covered.length > 6 ? ', ...' : ''}`);
}
out.push('');
out.push('## How to keep a referral host working / 如何保留某个返利域名');
out.push('');
out.push('Add the exact hostname to `user_rules` in `C:\\AdGuardHome\\AdGuardHome.yaml`, then restart');
out.push('the service. User rules are applied last and win over the blocklist:');
out.push('');
out.push('```yaml');
out.push('user_rules:');
out.push("  - '@@||adjust.com^'   # only if you really need the Adjust SDK to resolve");
out.push('```');
out.push('');

const rendered = out.join('\n');
const summary = [
    `  released hostnames: ${released.size}`,
    `  registrable domains: ${groups.size}`,
    `  annotated (WHY) entries: ${ordered.filter(([d]) => WHY[d]).length}`,
    `  wildcard rules covering blocked names: ${wildcardHits.length}`,
];

if (checkOnly) {
    let current = null;
    try { current = fs.readFileSync(outPath, 'utf8'); } catch (e) { current = null; }
    if (current === rendered) {
        console.log(`referral-gaps: ${path.basename(outPath)} is up to date`);
        if (summary) summary.forEach((s) => console.log(s));
        process.exit(0);
    }
    console.error(`referral-gaps: ${path.basename(outPath)} is STALE`);
    if (current === null) console.error('  the file does not exist');
    else console.error(`  on disk ${current.length} chars, regenerated ${rendered.length} chars`);
    console.error('  run: node tools/referral-gaps.js');
    summary.forEach((s) => console.error(s));
    process.exit(1);
}

fs.writeFileSync(outPath, rendered, 'utf8');
console.log(`wrote ${outPath}`);
summary.forEach((s) => console.log(s));
console.log(`  source allowlist: ${wlPath}`);
console.log(`  bytes: ${fs.statSync(outPath).size}`);
