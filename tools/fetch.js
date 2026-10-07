#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Fetch every raw input this project needs and cache it locally as bare hostname lists.
 *
 * Why a fetcher instead of letting hostlist-compiler pull the URLs itself:
 * the compiler aborts the ENTIRE build when any single source fails, and this connection
 * resets transfers constantly. Fetching here with per-source retries and mirrors means a
 * flaky feed degrades to "one source dropped, reported" instead of "no list today".
 *
 * Output goes to .cache/sources/<id>.txt, one hostname per line.
 *
 * Usage: node tools/fetch.js [--force]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const dns = require('dns');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.cache', 'sources');
const SOURCES = require('./sources.js');

const ATTEMPTS = 5;
const TIMEOUT_MS = 120000;
const CONCURRENCY = 3;
const RETRY_DELAY_MS = 2500;

const DNS_SERVERS = ['127.0.0.1', '192.168.3.1'];
const RE_HOST = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Resolver shim: the OS stub resolver here intermittently ENOTFOUNDs what AdGuard Home resolves. */
/**
 * Resolver shim.
 *
 * The OS stub resolver here intermittently fails (ENOTFOUND / getaddrinfo in the sandbox) for
 * names that resolve instantly through the local AdGuard Home, and that failure is what turns
 * into "ECONNRESET" on large transfers. Query the local resolvers explicitly and fall back to
 * the system resolver only if both decline.
 */
function resilientLookup(hostname, options, callback) {
    const wantsAll = Boolean(options && options.all);
    const respond = (addrs) => {
        if (wantsAll) callback(null, addrs.map((address) => ({ address, family: 4 })));
        else callback(null, addrs[0], 4);
    };
    const system = () => dns.lookup(hostname, options, (err, a, f) => {
        if (err) callback(err); else callback(null, a, f);
    });
    const tryServer = (i) => {
        if (i >= DNS_SERVERS.length) { system(); return; }
        const r = new dns.Resolver();
        try { r.setServers([DNS_SERVERS[i]]); } catch (e) { tryServer(i + 1); return; }
        r.resolve4(hostname, (err, addrs) => {
            if (!err && addrs && addrs.length) respond(addrs); else tryServer(i + 1);
        });
    };
    tryServer(0);
}

/**
 * Minimal https GET. Global fetch is avoided because undici aborts the whole process with an
 * internal assertion when a response stream ends early, which is not catchable.
 */
function httpsGet(url, timeoutMs) {
    return new Promise((resolve) => {
        let settled = false;
        let request = null;
        let deadline = null;
        const done = (v) => {
            if (settled) return;
            settled = true;
            clearTimeout(deadline);
            if (request) { try { request.destroy(); } catch (e) { /* gone */ } }
            resolve(v);
        };
        try {
            request = https.get(url, {
                agent: false, lookup: resilientLookup, headers: { 'user-agent': 'dns-shield/1.0' },
            }, (res) => {
                if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                    res.resume();
                    let next = null;
                    try { next = new URL(res.headers.location, url).toString(); } catch (e) { /* noop */ }
                    settled = true; clearTimeout(deadline); request.destroy();
                    if (next) httpsGet(next, timeoutMs).then(resolve); else resolve({ error: 'bad redirect' });
                    return;
                }
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => done({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
                res.on('aborted', () => done({ error: 'aborted mid-transfer' }));
                res.on('error', (e) => done({ error: e.message }));
            });
        } catch (e) { done({ error: e.message }); return; }
        deadline = setTimeout(() => done({ error: 'timeout' }), timeoutMs);
        request.on('error', (e) => done({ error: e.message }));
    });
}

async function fetchText(url) {
    let last = 'unknown';
    for (let a = 1; a <= ATTEMPTS; a += 1) {
        // eslint-disable-next-line no-await-in-loop
        const r = await httpsGet(url, TIMEOUT_MS);
        if (!r.error && r.status === 200 && typeof r.body === 'string'
            && r.body.length > 50 && !/^\s*<(!doctype|html)/i.test(r.body)) return r.body;
        last = r.error || `HTTP ${r.status}`;
        if (a < ATTEMPTS) {
            // eslint-disable-next-line no-await-in-loop
            await new Promise((s) => { setTimeout(s, RETRY_DELAY_MS * a); });
        }
    }
    return { error: last };
}

/**
 * Reduce any feed line to a bare hostname.
 *
 * Feeds arrive as /etc/hosts lines, bare domains, `||domain^` adblock rules, or full URLs
 * (URLhaus and OpenPhish publish URLs). Normalising here means the compiler never has to
 * guess a source's format.
 */
function toHostname(line) {
    let s = String(line).trim();
    if (!s || s.startsWith('!') || s.startsWith('#')) return null;
    const hosts = s.match(/^(?:0\.0\.0\.0|127\.0\.0\.1|::1?|::)\s+(\S+)/i);
    if (hosts) s = hosts[1];
    else if (/^https?:\/\//i.test(s)) { try { s = new URL(s).hostname; } catch (e) { return null; } }
    else if (s.startsWith('||')) s = s.slice(2).split('^')[0];
    else if (s.includes('/') || s.includes(' ') || s.includes('$') || s.includes('^')) return null;
    s = s.replace(/^\*\./, '').replace(/\.$/, '').toLowerCase();
    if (s === 'localhost' || s === 'localhost.localdomain') return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return null;
    return RE_HOST.test(s) ? s : null;
}

function normalise(text) {
    const seen = new Set();
    const out = [];
    text.split('\n').forEach((l) => {
        const h = toHostname(l);
        if (h && !seen.has(h)) { seen.add(h); out.push(h); }
    });
    return out;
}

/**
 * Save allow rules verbatim - they are `@@||domain^` and must not be hostname-normalised.
 *
 * Used for the feeds that get compiled into the exclusion layer: AdGuard's hand-written exception
 * list is deliberately domain-shaped, so a wildcard rule there is an upstream oddity worth dropping
 * rather than carrying into the pipeline.
 */
function extractAllowRules(text) {
    const seen = new Set();
    const out = [];
    text.split('\n').forEach((raw) => {
        const line = raw.trim();
        if (!line.startsWith('@@')) return;
        if (!/^@@\|\|[a-z0-9][a-z0-9.-]*\^\|?$/i.test(line)) return;
        const norm = line.replace(/\|$/, '');
        if (!seen.has(norm)) { seen.add(norm); out.push(norm); }
    });
    return out;
}

/**
 * Same, but wildcards survive.
 *
 * Allowlist feeds are full of `@@||app.*.adjust.com^` and `@@||adservice.google.*^`. For a report
 * that measures what installing such a list would release, dropping the wildcards would understate
 * the damage - and 69 of the 936 rules in the recorded feed are wildcards.
 */
function extractAllowRulesWithWildcards(text) {
    const seen = new Set();
    const out = [];
    text.split('\n').forEach((raw) => {
        const line = raw.trim();
        if (!line.startsWith('@@')) return;
        if (!/^@@\|\|[a-z0-9*][a-z0-9.*-]*\^\|?$/i.test(line)) return;
        const norm = line.replace(/\|$/, '');
        if (!seen.has(norm)) { seen.add(norm); out.push(norm); }
    });
    return out;
}

async function fetchOne(source) {
    const errors = [];
    for (const url of source.urls) {
        // eslint-disable-next-line no-await-in-loop
        const body = await fetchText(url);
        if (typeof body !== 'string') { errors.push(`${url}: ${body.error}`); continue; }

        const isAllowList = source.mode === 'allow';
        const lines = isAllowList
            ? (source.required === false
                ? extractAllowRulesWithWildcards(body)
                : extractAllowRules(body))
            : normalise(body);
        if (lines.length === 0) { errors.push(`${url}: produced no usable lines`); continue; }

        const dest = path.join(CACHE, `${source.id}.txt`);
        fs.writeFileSync(dest, `${lines.join('\n')}\n`, 'utf8');
        return {
            ok: true, dest, count: lines.length, bytes: body.length, via: url === source.urls[0] ? null : url,
        };
    }
    return { ok: false, error: errors.join('; ') };
}

async function main() {
    const force = process.argv.includes('--force');
    fs.mkdirSync(CACHE, { recursive: true });
    const catalog = SOURCES.filter((s) => s.urls && s.urls.length);
    const results = new Map();
    const queue = [];

    catalog.forEach((s) => {
        const dest = path.join(CACHE, `${s.id}.txt`);
        if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 20) {
            results.set(s.id, {
                ok: true, dest, count: fs.readFileSync(dest, 'utf8').split('\n').filter(Boolean).length, cached: true,
            });
        } else queue.push(s);
    });

    console.log(`fetch: ${catalog.length} sources (${catalog.length - queue.length} cached, ${queue.length} to fetch)\n`);
    const started = Date.now();
    const ticker = setInterval(() => {
        console.log(`  ... ${catalog.length - queue.length}/${catalog.length}, ${((Date.now() - started) / 60000).toFixed(1)} min`);
    }, 30000);

    const workers = new Array(CONCURRENCY).fill(null).map(async () => {
        for (;;) {
            const s = queue.shift();
            if (!s) return;
            // eslint-disable-next-line no-await-in-loop
            const r = await fetchOne(s);
            results.set(s.id, r);
            if (r.ok) console.log(`  [ OK ] ${s.id.padEnd(26)} ${String(r.count).padStart(7)} ${s.mode === 'allow' ? 'allow rules' : 'domains'}`);
            else console.log(`  [FAIL] ${s.id.padEnd(26)} ${r.error}`);
        }
    });
    try { await Promise.all(workers); } finally { clearInterval(ticker); }

    const ok = [...results.values()].filter((r) => r.ok).length;
    const failed = catalog.filter((s) => !results.get(s.id) || !results.get(s.id).ok);
    console.log(`\nfetch complete: ${ok}/${catalog.length} sources available`);
    if (failed.length) {
        console.log('unavailable (the build will skip these and report them):');
        failed.forEach((s) => console.log(`  - ${s.id}: ${(results.get(s.id) || {}).error || 'unknown'}`));
    }
    process.exit(0);
}

main().catch((e) => { console.error('FATAL', e.stack || e.message); process.exit(1); });
