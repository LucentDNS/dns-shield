#!/usr/bin/env node
/**
 * benchmark.js - measure this list against the peers it claims to beat.
 *
 * The published claim is "as broad as OISD/HaGeZi/AdRules and safer than AdGuard DNS filter".
 * A claim like that is only worth making if it is measured, so this script downloads every peer,
 * puts all of them on one ruler, and reports the numbers that decide it:
 *
 *   coverage      how much of each peer's blocking set we also block (their holes in us)
 *   uniqueness    what we block that a given peer does not (our additions)
 *   false positives  how many hosts AdGuard's own hand-curated exception list names as broken
 *                 products and that a list still blocks. This is the one number where a big list
 *                 loses to a careful one, and it is why this project has a policy layer at all.
 *
 * Peers are read-only here. Nothing from this script reaches dist/.
 *
 *   node tools/benchmark.js [--refresh]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const dns = require('dns');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, '.cache', 'benchmark');
const OUT = path.join(ROOT, 'dist', 'benchmark.txt');
const REFRESH = process.argv.includes('--refresh');

const PEERS = [
    { id: 'adguard-dns-filter', name: 'AdGuard DNS filter', url: 'https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt' },
    { id: 'hagezi-pro', name: "HaGeZi's Pro", url: 'https://adguardteam.github.io/HostlistsRegistry/assets/filter_48.txt' },
    { id: 'oisd-big', name: 'OISD Big', url: 'https://adguardteam.github.io/HostlistsRegistry/assets/filter_27.txt' },
    { id: 'adrules-dns', name: 'AdRules DNS List', url: 'https://adguardteam.github.io/HostlistsRegistry/assets/filter_29.txt' },
];

/** AdGuard's own false-positive fixes, used as an independent ruler for over-blocking. */
const FP_RULER = {
    name: "AdGuard DNS filter exception list",
    url: 'https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/exceptions.txt',
    mirrors: [
        'https://ghproxy.net/https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/exceptions.txt',
        'https://gh-proxy.com/https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/exceptions.txt',
    ],
};

const DNS_SERVERS = ['127.0.0.1', '192.168.3.1'];

const RE_BLOCK = /^\|\|([a-z0-9][a-z0-9.-]*)\^$/;
const RE_ALLOW = /^@@\|\|([a-z0-9][a-z0-9.-]*)\^$/;
const RE_LABEL = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const isUnder = (d, t) => d === t || d.endsWith(`.${t}`);

// ─────────────────────────────────────────────────────────────────────────── output helpers

const LINES = [];
const say = (s = '') => { LINES.push(s); console.log(s); };
const head = (t) => { say(''); say('='.repeat(76)); say(t); say('='.repeat(76)); };
const pad = (s, n) => String(s).padEnd(n);
const num = (n) => Number(n).toLocaleString('en-US');

// ─────────────────────────────────────────────────────────────────────────── network

function resilientLookup(hostname, options, callback) {
    const opts = typeof options === 'function' ? {} : (options || {});
    const cb = typeof options === 'function' ? options : callback;
    const done = (err, addr, fam) => {
        if (opts.all) return err ? cb(err) : cb(null, [{ address: addr, family: fam }]);
        return cb(err, addr, fam);
    };
    const servers = DNS_SERVERS.slice();
    const tryNext = () => {
        if (!servers.length) return dns.lookup(hostname, opts, cb);
        const server = servers.shift();
        const resolver = new dns.Resolver();
        resolver.setServers([server]);
        resolver.resolve4(hostname, (err, addrs) => {
            if (err || !addrs || !addrs.length) return tryNext();
            return done(null, addrs[0], 4);
        });
    };
    tryNext();
}

function httpsGet(url, timeoutMs) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            agent: false,
            lookup: resilientLookup,
            headers: { 'User-Agent': 'dns-shield-benchmark/1.0', Accept: '*/*' },
        }, (res) => {
            const { statusCode, headers } = res;
            if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location) {
                res.resume();
                clearTimeout(timer);
                req.destroy();
                const next = new URL(headers.location, url).toString();
                return httpsGet(next, timeoutMs).then(resolve, reject);
            }
            if (statusCode !== 200) {
                res.resume();
                clearTimeout(timer);
                req.destroy();
                return reject(new Error(`HTTP ${statusCode}`));
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => { clearTimeout(timer); req.destroy(); resolve(Buffer.concat(chunks).toString('utf8')); });
            res.on('error', (e) => { clearTimeout(timer); req.destroy(); reject(e); });
            return undefined;
        });
        const timer = setTimeout(() => { req.destroy(); reject(new Error(`timeout after ${timeoutMs}ms`)); }, timeoutMs);
        req.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
}

async function fetchWithMirrors(entry) {
    const cacheFile = path.join(CACHE, `${entry.id || 'ruler'}.txt`);
    if (!REFRESH && fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 1024) {
        return { text: fs.readFileSync(cacheFile, 'utf8'), cached: true };
    }
    // Reuse the build's own download of the same upstream list before hitting the network. A
    // benchmark that re-downloads 4 MB lists on a line this slow turns a 20-second measurement
    // into a 10-minute one, and the build already proved the bytes arrived intact.
    const sourceCopy = path.join(ROOT, '.cache', 'sources', `${entry.id}.txt`);
    if (!REFRESH && fs.existsSync(sourceCopy) && fs.statSync(sourceCopy).size > 1024) {
        return { text: fs.readFileSync(sourceCopy, 'utf8'), cached: true };
    }
    const urls = [entry.url, ...(entry.mirrors || [])];
    let lastErr;
    for (const u of urls) {
        for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
                const text = await httpsGet(u, 120000);
                if (text.length < 1024) throw new Error(`suspiciously small body (${text.length} B)`);
                fs.mkdirSync(CACHE, { recursive: true });
                fs.writeFileSync(cacheFile, text, 'utf8');
                return { text, cached: false };
            } catch (e) {
                lastErr = e;
                await new Promise((r) => setTimeout(r, 1500 * attempt));
            }
        }
    }
    throw new Error(`all mirrors failed: ${lastErr && lastErr.message}`);
}

// ─────────────────────────────────────────────────────────────────────────── parsing

/**
 * Parse a list in either shape it may arrive in.
 *
 * This has to accept three forms, because the same upstream file is read twice: raw from the
 * network (`||domain^` and `@@||domain^` adblock rules), and from the build's normalised cache
 * (one bare hostname per line, already stripped). Accepting only the adblock form makes every
 * peer parse to zero rules and silently turns the whole comparison into NaN - which is exactly
 * what happened, and why `parseRules` now throws instead of returning an empty set.
 */
function parseRules(text, label) {
    const block = new Set();
    const allow = new Set();
    text.split('\n').forEach((raw) => {
        const l = raw.trim().toLowerCase();
        if (!l || l.startsWith('!') || l.startsWith('#')) return;
        let m = l.match(RE_ALLOW);
        if (m) { if (RE_LABEL.test(m[1])) allow.add(m[1]); return; }
        m = l.match(RE_BLOCK);
        if (m) { if (RE_LABEL.test(m[1])) block.add(m[1]); return; }
        // Normalised cache shape: a bare hostname is a blocking rule.
        if (!l.includes('/') && !l.includes(' ') && RE_LABEL.test(l)) block.add(l);
    });
    if (label && !block.size && !allow.size) {
        throw new Error(`${label}: parsed zero rules from ${text.length} bytes - the parser is wrong, not the list`);
    }
    return { block, allow };
}

// ─────────────────────────────────────────────────────────────────────────── main

async function main() {
    fs.mkdirSync(CACHE, { recursive: true });
    fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });

    say(`benchmark  ${os.hostname()}  ${new Date().toISOString()}`);

    head('our list');
    const oursPath = path.join(ROOT, 'dist', 'dns-shield.txt');
    if (!fs.existsSync(oursPath)) throw new Error(`missing ${oursPath} - run tools/build.js first`);
    const oursText = fs.readFileSync(oursPath, 'utf8');
    const ours = parseRules(oursText, 'our published list');
    say(`  ${pad('file', 34)}${num(oursText.length)} bytes`);
    say(`  ${pad('block rules', 34)}${num(ours.block.size)}`);
    say(`  ${pad('allow rules', 34)}${num(ours.allow.size)}`);

    // A protected host must never be released. Checked here as well as in the audit because a
    // benchmark run on its own should not be able to show a clean sheet while that is broken.
    const neverPath = path.join(ROOT, 'data', 'never-whitelist.txt');
    const never = new Set();
    if (fs.existsSync(neverPath)) {
        fs.readFileSync(neverPath, 'utf8').split('\n').forEach((raw) => {
            const d = raw.trim().toLowerCase();
            if (d && !d.startsWith('#') && RE_LABEL.test(d)) never.add(d);
        });
    }

    head('coverage against peers');
    say(`  ${pad('peer', 22)}${pad('their rules', 13)}${pad('we have %', 12)}${pad('they lack', 12)}we lack`);
    const results = [];
    for (const peer of PEERS) {
        const { text, cached } = await fetchWithMirrors(peer);
        const p = parseRules(text, peer.name);
        let weHave = 0;
        let theyLack = 0;
        p.block.forEach((d) => { if (ours.block.has(d)) weHave += 1; else theyLack += 1; });
        let weLack = 0;
        ours.block.forEach((d) => { if (!p.block.has(d)) weLack += 1; });
        const share = ((weHave / p.block.size) * 100).toFixed(1);
        results.push({ peer, p, weHave, theyLack, weLack, share, cached });
        say(`  ${pad(peer.name, 22)}${pad(num(p.block.size), 13)}${pad(`${share}%`, 12)}${pad(num(theyLack), 12)}${num(weLack)}`);
    }
    say('');
    say('  "we have %" is the share of that peer\'s blocking set we also block - its holes in us.');
    say('  "they lack" counts rules that peer has and we do not. "we lack" counts ours it does not have.');

    head('false-positive ruler (AdGuard exceptions)');
    say('  Every host below is one AdGuard un-blocked after a real breakage report. A list that');
    say('  blocks it is blocking something a human already proved broken.');
    say('  "by name" counts exact rules; "effectively" also counts a host caught by an ancestor');
    say('  rule - which is how a platform-level block breaks a service nobody meant to block.');
    let rulerSet = new Set();
    try {
        const { text } = await fetchWithMirrors({ ...FP_RULER, id: 'adguard-exceptions' });
        rulerSet = parseRules(text, 'AdGuard exception ruler').allow;
        say(`  ruler entries: ${num(rulerSet.size)}`);
    } catch (e) {
        say(`  ruler unavailable (${e.message}) - skipping the false-positive comparison`);
    }
    if (rulerSet.size) {
        // A `||domain^` rule blocks the whole subtree, so a ruler host can be blocked by a rule
        // that never names it. Counting exact matches alone under-reports every list that blocks
        // platforms instead of hosts - and it is precisely the inherited case that breaks a site,
        // because nobody ever decided that this host was worth blocking.
        const ancestorsOf = (d) => {
            const parts = d.split('.');
            const out = [];
            for (let i = 1; i <= parts.length - 2; i += 1) out.push(parts.slice(i).join('.'));
            return out;
        };
        const allowed = (allowSet, d) => Boolean(allowSet) && (allowSet.has(d) || ancestorsOf(d).some((a) => allowSet.has(a)));
        const blockedBy = (set, allowSet) => {
            const named = [];
            const inherited = [];
            rulerSet.forEach((d) => {
                if (allowed(allowSet, d)) return;
                if (set.has(d)) { named.push(d); return; }
                const via = ancestorsOf(d).find((a) => set.has(a));
                if (via) inherited.push(`${d} (via ${via})`);
            });
            return { named, inherited };
        };
        say('');
        say(`  ${pad('list', 22)}${pad('by name', 12)}${pad('effectively', 13)}sample`);
        const rows = [['DNS Shield (ours)', ours]].concat(results.map((r) => [r.peer.name, r.p]));
        rows.forEach(([name, list]) => {
            const { named, inherited } = blockedBy(list.block, list.allow);
            say(`  ${pad(name, 22)}${pad(String(named.length), 12)}${pad(String(named.length + inherited.length), 13)}${[...named, ...inherited].slice(0, 2).join(', ')}`);
        });
        const inheritedOnly = [...rulerSet].filter((d) => !ours.block.has(d) && !allowed(ours.allow, d) && ancestorsOf(d).some((a) => ours.block.has(a)));
        if (inheritedOnly.length) {
            say('');
            say(`  ours: ${num(inheritedOnly.length)} of the effectively-blocked hosts are blocked only through an`);
            say(`  ancestor rule - no rule of ours names them: ${inheritedOnly.slice(0, 4).join(', ')}`);
        }
    }

    head('verdict');
    const worstHoles = results.slice().sort((a, b) => (b.theyLack / b.p.block.size) - (a.theyLack / a.p.block.size))[0];
    const union = new Set();
    results.forEach((r) => r.p.block.forEach((d) => union.add(d)));
    ours.block.forEach((d) => union.add(d));
    const unionTotal = union.size;
    const coveredByUs = [...union].filter((d) => ours.block.has(d)).length;
    const peerMissing = results.map((r) => ({ name: r.peer.name, n: r.p.block.size - r.weHave }));
    const bySize = results.slice().sort((a, b) => b.p.block.size - a.p.block.size);
    say(`  our block rules                     ${num(ours.block.size)}`);
    say(`  union of the four peers             ${num(unionTotal)}`);
    say(`  largest peer                        ${pad(bySize[0].peer.name, 20)}${num(bySize[0].p.block.size)}`);
    say(`  union coverage                      ${((coveredByUs / unionTotal) * 100).toFixed(1)}% of every rule any of the four peers carries`);
    say(`  union contributions                 ${num(coveredByUs)} from us, ${num(unionTotal - coveredByUs)} only they carry`);
    say(`  biggest remaining gap               ${pad(worstHoles.peer.name, 20)}${num(worstHoles.theyLack)} of its rules are not in ours`);
    say('');
    say('  Peer rules we do not carry, per peer (this is what a future source would have to close):');
    peerMissing.sort((a, b) => b.n - a.n).forEach((r) => say(`    ${pad(r.name, 22)}${num(r.n)}`));

    head('protected-host check');
    const leaked = [...never].filter((d) => ours.allow.has(d));
    say(`  ${num(never.size)} protected host(s)`);
    if (leaked.length) say(`  FAIL - released as allow rules: ${leaked.join(', ')}`);
    else say('  OK   no protected host appears as an allow rule');

    fs.writeFileSync(OUT, `${LINES.join('\n')}\n`, 'utf8');
    say('');
    say(`written to ${OUT}`);
}

main().catch((e) => { console.error(`benchmark failed: ${e.message}`); process.exit(1); });
