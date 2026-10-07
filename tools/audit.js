#!/usr/bin/env node
/**
 * Audit dist/dns-shield.txt and report who released what.
 *
 * A whitelist is where a filter list loses its value by accident, so this tool treats every
 * release as a claim to be checked rather than a fact to be trusted:
 *
 *   1. syntax    - only `||domain^` and `@@||domain^`, nothing else can survive to a DNS server
 *   2. hygiene   - duplicates, blank lines, and the same domain blocked AND allowed
 *   3. coverage  - how many known ad/tracker hosts we catch, and which we miss
 *   4. releases  - per whitelist rule, how many domains it actually released (cost of the claim)
 *   5. guards    - shared-infrastructure apexes that must never be blocked wholesale
 *   6. sanity    - domains that must NOT be released, and domains that MUST be released
 *
 * Usage: node tools/audit.js [--out dist/dns-shield.txt]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = (() => {
    const i = process.argv.indexOf('--out');
    return i > -1 ? path.resolve(process.argv[i + 1]) : path.join(ROOT, 'dist', 'dns-shield.txt');
})();

const RE_BLOCK = /^\|\|([a-z0-9][a-z0-9.-]*)\^$/;
const RE_ALLOW = /^@@\|\|([a-z0-9][a-z0-9.-]*)\^$/;
const RE_LABEL = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

let failures = 0;
let warnings = 0;
const report = [];
function say(line) { report.push(line); console.log(line); }
function fail(line) { failures += 1; say(`  FAIL  ${line}`); }
function warn(line) { warnings += 1; say(`  WARN  ${line}`); }
function head(t) { say(`\n${'='.repeat(72)}\n${t}\n${'='.repeat(72)}`); }

/**
 * Hosts that any list claiming to block ads/tracking must catch. Deliberately drawn from
 * well-known ad and analytics infrastructure rather than from our own sources, so this is an
 * independent check rather than a tautology.
 */
const MUST_BLOCK = [
    'doubleclick.net', 'googleadservices.com', 'googlesyndication.com', 'googletagmanager.com',
    'google-analytics.com', 'adservice.google.com', 'pagead2.googlesyndication.com',
    'scorecardresearch.com', 'adnxs.com', 'adsrvr.org', 'pubmatic.com', 'rubiconproject.com',
    'openx.net', 'criteo.com', 'taboola.com', 'outbrain.com', 'casalemedia.com', 'adform.net',
    'quantserve.com', 'bluekai.com', 'demdex.net', 'everesttech.net', 'omtrdc.net', '2o7.net',
    'hotjar.com', 'mouseflow.com', 'crazyegg.com', 'fullstory.com', 'inspectlet.com',
    'mixpanel.com', 'amplitude.com', 'segment.io', 'heapanalytics.com', 'kissmetrics.com',
    'appsflyer.com', 'adjust.com', 'branch.io', 'kochava.com', 'singular.net',
    'inmobi.com', 'applovin.com', 'vungle.com', 'chartboost.com', 'ironsrc.com', 'mopub.com',
    'amazon-adsystem.com', 'adsafeprotected.com', 'moatads.com', 'doubleverify.com',
    'coinhive.com', 'webminepool.com', 'crypto-loot.com', 'minero.cc',
    'talkingdata.com', 'umeng.com', 'cnzz.com', '51.la', 'mmstat.com',
    'hm.baidu.com', 'pos.baidu.com', 'gdt.qq.com', 'pingjs.qq.com', 'log.mmstat.com',
    'ut.taobao.com', 'ad.sina.com.cn', 'sax.sina.com.cn', 'analytics.163.com',
    'adsystem.amazon.com', 'bidswitch.net', 'smartadserver.com', 'teads.tv', 'sharethrough.com',
    'yieldmo.com', 'smaato.net', 'improvedigital.com', '33across.com',
];

/** Hosts that must remain reachable. Breaking any of these is worse than missing an ad. */
const MUST_ALLOW = [
    'weixin.qq.com', 'mp.weixin.qq.com', 'short.weixin.qq.com', 'qlogo.cn', 'gtimg.cn',
    'taobao.com', 'alicdn.com', 'alipay.com', 'baidu.com', 'bdstatic.com',
    'jd.com', '360buyimg.com', 'bilibili.com', 'hdslb.com', 'douyin.com', 'douyinpic.com',
    'zhihu.com', 'zhimg.com', 'weibo.com', 'sinaimg.cn', 'meituan.com', 'dpfile.com',
    '12306.cn', 'unionpay.com', 'icbc.com.cn', 'pinduoduo.com', 'xiaomi.com', 'miui.com',
    'huawei.com', 'vivo.com.cn', 'oppomobile.com', 'qq.com', '163.com', '126.net',
    'windowsupdate.com', 'download.windowsupdate.com', 'ctldl.windowsupdate.com',
    'msftconnecttest.com', 'msftncsi.com', 'time.windows.com', 'crl.microsoft.com',
    'apple.com', 'swscan.apple.com', 'ocsp.apple.com', 'gs.apple.com', 'captive.apple.com',
    'ocsp.digicert.com', 'crl3.digicert.com', 'ocsp.sectigo.com', 'crt.sectigo.com',
    'connectivitycheck.gstatic.com', 'connectivitycheck.platform.hicloud.com',
    'detectportal.firefox.com', 'local.adguard.org', 'adguard-dns.com',
    'github.com', 'githubusercontent.com', 'raw.githubusercontent.com', 'objects.githubusercontent.com',
    'npmjs.com', 'registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org',
    'steampowered.com', 'steamstatic.com', 'steamcontent.com', 'epicgames.com',
    's3.amazonaws.com', 'cloudfront.net', 'azurewebsites.net', 'akamai.net',
];

/** Shared hosting/CDN apexes: blocking the apex kills every tenant, not just the bad one. */
const SHARED_APEXES = [
    'azurewebsites.net', 'azureedge.net', 'blob.core.windows.net', 'akamai.net',
    'cloudfront.net', 'fastly.net', 'googlecode.com', 'blogspot.com', 'wordpress.com',
    'github.io', 'gitlab.io', 'netlify.app', 'vercel.app', 'pages.dev', 'workers.dev',
    'replit.app', 'glitch.me', 'herokuapp.com', 'onrender.com', 'firebaseapp.com',
    'web.app', 'surge.sh', 'weebly.com', 'wixsite.com', 'squarespace.com', 'webflow.io',
    'telegra.ph', 'medium.com', 'substack.com', 'googleusercontent.com', 'ggpht.com',
    'cloudinary.com', 'imgix.net', 'unsplash.com', 'gravatar.com', 'jsdelivr.net',
    'unpkg.com', 'cdnjs.cloudflare.com', 'bootstrapcdn.com', 'gstatic.com', 'googleapis.com',
    'amazonaws.com', 'r2.dev', 'digitaloceanspaces.com', 'cachefly.net', 'hwcdn.net',
    'llnwd.net', 'edgekey.net', 'edgesuite.net', 'bitbucket.org', 'atlassian.net',
    'zendesk.com', 'freshdesk.com', 'intercom.io', 'hubspot.com', 'mailchimp.com',
    'sendgrid.net', 'mailgun.org', 'list-manage.com', 'rs6.net', 'constantcontact.com',
];

/** One-off DNS providers and URL shorteners: upstream abuse feeds list them, but they are dual-use. */
const DUAL_USE = [
    'bit.ly', 'tinyurl.com', 'adf.ly', 'dnsking.ch', 'dnsup.net', 'dynserv.org',
    'now-dns.net', 'myiphost.com', 'vpndns.net', 'freeddns.us', 'hicam.net',
    'soundcast.me', 'tcp4.me', 'nttdll.top', 'forumz.info',
];

function isUnder(domain, tree) { return domain === tree || domain.endsWith(`.${tree}`); }

function readOut(p) {
    if (!fs.existsSync(p)) { console.error(`not found: ${p} (run tools/build.js first)`); process.exit(2); }
    return fs.readFileSync(p, 'utf8');
}

function main() {
    const raw = readOut(OUT);
    head(`audit  ${OUT}`);
    say(`bytes ${raw.length.toLocaleString()}  (${(raw.length / 1048576).toFixed(2)} MiB)`);

    const lines = raw.split('\n');
    const blocked = new Set();
    const allowed = new Set();
    const seenBlock = new Set();
    const seenAllow = new Set();
    const dupBlock = [];
    const dupAllow = [];
    const badSyntax = [];
    const ipRules = [];
    const blanks = [];

    lines.forEach((rawLine, idx) => {
        const l = rawLine.trim();
        if (l === '') { if (idx < lines.length - 1) blanks.push(idx + 1); return; }
        if (l.startsWith('!') || l.startsWith('#')) return;
        const a = l.match(RE_ALLOW);
        if (a) {
            const d = a[1];
            if (seenAllow.has(d)) dupAllow.push(d); else seenAllow.add(d);
            allowed.add(d);
            return;
        }
        const b = l.match(RE_BLOCK);
        if (b) {
            const d = b[1];
            if (/^\d{1,3}(\.\d{1,3}){3}$/.test(d)) ipRules.push(d);
            if (seenBlock.has(d)) dupBlock.push(d); else seenBlock.add(d);
            blocked.add(d);
            return;
        }
        badSyntax.push(`${idx + 1}: ${l.slice(0, 70)}`);
    });

    head('1  syntax');
    say(`block rules     ${blocked.size.toLocaleString()}`);
    say(`allow rules     ${allowed.size.toLocaleString()}`);
    if (badSyntax.length) badSyntax.slice(0, 10).forEach((s) => fail(`unsupported rule shape -> ${s}`));
    else say('  OK    every rule is ||domain^ or @@||domain^');
    if (badSyntax.length > 10) fail(`...and ${badSyntax.length - 10} more`);
    if (ipRules.length) fail(`${ipRules.length} rules target a literal IP - unreachable at DNS level`);
    else say('  OK    no literal-IP rules');
    const nonAscii = lines.filter((l) => /[^\x00-\x7F]/.test(l));
    if (nonAscii.length) warn(`${nonAscii.length} lines contain non-ASCII bytes (usually a stray comment)`);
    else say('  OK    pure ASCII');
    const wildcards = lines.filter((l) => {
        if (!l || l.startsWith('!') || l.startsWith('#')) return false;
        return /[*|$]/.test(l.replace(/^\|\|/, '').replace(/^@@\|\|/, '').replace(/\^$/, ''));
    });
    if (wildcards.length) warn(`${wildcards.length} lines carry wildcard/modifier syntax, e.g. ${wildcards[0].slice(0, 60)}`);
    else say('  OK    no wildcard or modifier syntax');

    head('2  hygiene');
    if (dupBlock.length) fail(`${dupBlock.length} duplicate block rule(s), e.g. ${dupBlock.slice(0, 3).join(', ')}`);
    else say('  OK    no duplicate block rules');
    if (dupAllow.length) fail(`${dupAllow.length} duplicate allow rule(s)`);
    else say('  OK    no duplicate allow rules');
    if (blanks.length) fail(`${blanks.length} blank line(s) inside the list`);
    else say('  OK    no blank lines');
    const conflict = [...allowed].filter((d) => blocked.has(d));
    if (conflict.length) fail(`${conflict.length} domain(s) both blocked and allowed: ${conflict.slice(0, 5).join(', ')}`);
    else say('  OK    no domain is both blocked and allowed');

    head('3  coverage - must block');
    // Four verdicts, because they need four different fixes:
    //   direct    - the host has its own block rule. What we want.
    //   ancestor  - covered because an ancestor is blocked. The host IS unreachable, which is all
    //               a DNS blocklist promises; it only means a future exception for that ancestor
    //               would release this host too, so it is reported but not a failure.
    //   released  - an allow rule or whitelisted tree keeps it up on purpose. This is the case
    //               the never-whitelist exists to catch, so it is listed explicitly.
    //   absent    - no feed lists it and no ancestor is blocked. A real hole.
    const direct = [];
    const viaAncestor = [];
    const released = [];
    const absent = [];
    MUST_BLOCK.forEach((d) => {
        if (blocked.has(d)) { direct.push(d); return; }
        const parts = d.split('.');
        for (let i = 1; i <= parts.length - 2; i += 1) {
            if (blocked.has(parts.slice(i).join('.'))) { viaAncestor.push(d); return; }
        }
        if ([...allowed].some((a) => isUnder(d, a))) { released.push(d); return; }
        absent.push(d);
    });
    say(`known ad/tracker hosts: ${direct.length} blocked directly, ${viaAncestor.length} via a blocked ancestor (of ${MUST_BLOCK.length})`);
    if (viaAncestor.length) say(`  via ancestor: ${viaAncestor.join(', ')}`);
    if (released.length) released.forEach((d) => fail(`released by a whitelist/exception decision: ${d}`));
    if (absent.length) absent.forEach((d) => fail(`absent from the published list and from every feed: ${d}`));
    if (!released.length && !absent.length) say('  OK    every known host is unreachable');

    head('4  coverage - must stay reachable');
    const broken = MUST_ALLOW.filter((d) => {
        if (blocked.has(d)) return true;
        // a blocked ancestor is just as fatal as blocking the host itself. The loop must reach
        // the registrable root (parts.length - 2): `adguard-dns.com` sits at index 0 of its own
        // name, and starting at 1 never tested it.
        const parts = d.split('.');
        for (let i = 0; i <= parts.length - 2; i += 1) {
            if (blocked.has(parts.slice(i).join('.'))) return true;
        }
        return false;
    });
    say(`essential hosts: ${MUST_ALLOW.length - broken.length}/${MUST_ALLOW.length} reachable`);
    if (broken.length) broken.forEach((d) => fail(`unreachable: ${d} (blocked directly or via an ancestor)`));
    else say('  OK    every essential host is reachable');

    head('5  shared infrastructure apexes');
    const apexBlocked = SHARED_APEXES.filter((d) => seenBlock.has(d));
    if (apexBlocked.length) apexBlocked.forEach((d) => fail(`whole platform blocked: ||${d}^`));
    else say(`  OK    none of the ${SHARED_APEXES.length} shared apexes is blocked wholesale`);

    head('6  dual-use services (informational)');
    const dualBlocked = DUAL_USE.filter((d) => seenBlock.has(d));
    if (dualBlocked.length) {
        warn(`${dualBlocked.length} dual-use service(s) blocked whole: ${dualBlocked.join(', ')}`);
        say('        These come from abuse feeds. Blocking them breaks ordinary link sharing and');
        say('        should be a deliberate decision, not a side effect - remove them in');
        say('        data/whitelist.txt if you want them reachable.');
    } else say('  OK    no dual-use service blocked whole');

    head('7  whitelist effect');
    say('  Measured against the compiled blocking set, not against the published file: a private');
    say('  whitelist entry removes a block rule, so it leaves nothing behind in the output.');
    const compiledPath = path.join(ROOT, 'dist', '.compiled.raw');
    const compiled = new Set();
    if (fs.existsSync(compiledPath)) {
        fs.readFileSync(compiledPath, 'utf8').split('\n').forEach((l) => {
            const m = l.trim().match(RE_BLOCK);
            if (m && RE_LABEL.test(m[1])) compiled.add(m[1]);
        });
    }
    const wlPath = path.join(ROOT, 'data', 'whitelist.txt');
    const wlRules = fs.existsSync(wlPath)
        ? fs.readFileSync(wlPath, 'utf8').split('\n').map((s) => s.trim().toLowerCase()).filter((s) => s && !s.startsWith('#'))
        : [];
    const neverPath = path.join(ROOT, 'data', 'never-whitelist.txt');
    const neverSet = fs.existsSync(neverPath)
        ? new Set(fs.readFileSync(neverPath, 'utf8').split('\n').map((s) => s.trim().toLowerCase()).filter((s) => s && !s.startsWith('#')))
        : new Set();

    const rows = [];
    wlRules.forEach((rule) => {
        const isTree = rule.startsWith('@');
        const d = isTree ? rule.slice(1).replace(/^\./, '') : rule;
        if (!RE_LABEL.test(d)) return;
        const n = isTree
            ? [...compiled].filter((c) => isUnder(c, d)).length
            : (compiled.has(d) ? 1 : 0);
        if (n > 0) rows.push({ rule, n });
    });
    rows.sort((a, b) => b.n - a.n);
    say(`  compiled set ${compiled.size.toLocaleString()} domains; ${rows.length} whitelist rule(s) released something`);
    if (rows.length) {
        say(`  ${'rule'.padEnd(34)} released`);
        rows.slice(0, 30).forEach((r) => {
            say(`  ${r.rule.padEnd(34)} ${String(r.n).padStart(8)}${r.n > 500 ? '   <- broad' : ''}`);
        });
        if (rows.length > 30) say(`  ...and ${rows.length - 30} more rules with releases`);
    }

    head('8  never-whitelist protection');
    const unprotectedButBlocked = [...neverSet].filter((d) => blocked.has(d));
    say(`  ${neverSet.size} protected domain(s); ${unprotectedButBlocked.length} currently present as block rules`);
    const leaked = [...neverSet].filter((d) => allowed.has(d));
    if (leaked.length) fail(`${leaked.length} protected domain(s) appear as allow rules: ${leaked.slice(0, 5).join(', ')}`);
    else say('  OK    no protected domain is released by an allow rule');

    head('9  whitelist entries that released nothing');
    const inert = wlRules.filter((rule) => {
        const isTree = rule.startsWith('@');
        const d = isTree ? rule.slice(1).replace(/^\./, '') : rule;
        if (!RE_LABEL.test(d)) return false;
        return !(isTree ? [...compiled].some((c) => isUnder(c, d)) : compiled.has(d));
    });
    say(`  ${inert.length} entr(ies) released nothing in this build - harmless, and they will start`);
    say('  working the moment a feed picks those domains up:');
    inert.slice(0, 20).forEach((r) => say(`    ${r}`));
    if (inert.length > 20) say(`    ...and ${inert.length - 20} more`);

    head('result');
    say(`failures ${failures}   warnings ${warnings}`);
    if (failures === 0) say('\nAUDIT PASSED - the list is safe to publish');
    else say('\nAUDIT FAILED - fix the FAIL lines above before publishing');
    fs.writeFileSync(path.join(ROOT, 'dist', 'audit.log'), `${report.join('\n')}\n`, 'utf8');
    say(`\nlog written to ${path.join(ROOT, 'dist', 'audit.log')}`);
    process.exit(failures === 0 ? 0 : 1);
}

main();
