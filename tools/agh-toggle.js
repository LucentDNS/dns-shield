/**
 * Inspect a running AdGuard Home over its HTTP API, and optionally flip the enabled flag of the
 * lists it already has.
 *
 * Written while working out how to attribute a live block to this project's list. The honest
 * summary of what it can and cannot do on this machine:
 *
 *   - `show` / `check` work everywhere and are read-only.
 *   - `test add` / `test remove` work on any instance.
 *   - `others off` needs `POST /control/filtering/set_url`, whose payload shape differs between
 *     AdGuard Home builds. Against v0.107.79 with a config that has been migrated to schema 34 it
 *     answers `400 data is absent`, so the live check instead uses a throwaway instance with only
 *     this project's list installed. The command reports that failure rather than pretending to
 *     have disabled anything.
 *   - `snapshot` / `restore` exist so that a check which does disable filters can always put the
 *     exact previous enabled state back.
 *
 *   node tools/agh-toggle.js show
 *   node tools/agh-toggle.js check <domain> [domain ...]
 *   node tools/agh-toggle.js snapshot | restore
 *   node tools/agh-toggle.js others off | on
 *   node tools/agh-toggle.js test add <url> | test remove
 *
 * Point it at another instance with AGH_BASE / AGH_USER / AGH_PASS. The password has no default on
 * purpose: this file is public, and a credential committed here would be readable by anyone even
 * after the line is deleted from a later commit.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = process.env.AGH_BASE || 'http://127.0.0.1:3000';
const USER = process.env.AGH_USER || 'admin';
const PASS = process.env.AGH_PASS;
if (!PASS) {
    console.error('AGH_PASS is not set. Export the AdGuard Home password first, e.g.');
    console.error('  $env:AGH_PASS = Read-Host -AsSecureString   # Windows PowerShell');
    console.error('  export AGH_PASS=...                          # POSIX shell');
    console.error('The password is deliberately not stored in this repository.');
    process.exit(2);
}
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const DIST = path.join(__dirname, '..', 'dist');
const SNAPSHOT = path.join(DIST, 'agh-filters-before.json');
const TEST_NAME = 'DNS Shield (verification)';

async function api(method, endpoint, body) {
    const res = await fetch(`${BASE}${endpoint}`, {
        method,
        headers: {
            Authorization: AUTH,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${endpoint} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
    try { return JSON.parse(text); } catch { return text; }
}

const status = () => api('GET', '/control/filtering/status');

function summarize(s) {
    console.log(`filtering enabled: ${s.enabled}  interval: ${s.interval}h`);
    for (const f of s.filters) {
        const mark = f.name === TEST_NAME ? '  <- test list' : '';
        console.log(`  [${f.enabled ? 'on ' : 'off'}] id=${String(f.id).padStart(9)} rules=${String(f.rules_count).padStart(7)}  ${f.name}${mark}`);
    }
    console.log(`  user rules: ${s.user_rules.length}`);
}

async function refresh() {
    const r = await api('POST', '/control/filtering/refresh', { whitelist: false });
    console.log(`refresh: ${JSON.stringify(r)}`);
}

(async () => {
    const [cmd, arg, extra] = process.argv.slice(2);

    if (cmd === 'snapshot') {
        const s = await status();
        fs.writeFileSync(SNAPSHOT, JSON.stringify(s, null, 2));
        console.log(`snapshot written to ${SNAPSHOT}`);
        summarize(s);
        return;
    }

    if (cmd === 'restore') {
        const before = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
        for (const f of before.filters) {
            await api('POST', '/control/filtering/set_url', { url: f.url, enabled: f.enabled });
        }
        const now = await status();
        const test = now.filters.find((f) => f.name === TEST_NAME);
        if (test) await api('POST', '/control/filtering/remove_url', { url: test.url });
        await api('POST', '/control/filtering/config', { enabled: before.enabled, interval: before.interval });
        await refresh();
        console.log('restored from snapshot');
        summarize(await status());
        return;
    }

    if (cmd === 'show') {
        summarize(await status());
        return;
    }

    if (cmd === 'others' && (arg === 'off' || arg === 'on')) {
        const want = arg === 'on';
        const s = await status();
        let changed = 0;
        for (const f of s.filters) {
            if (f.name === TEST_NAME || f.enabled === want) continue;
            try {
                await api('POST', '/control/filtering/set_url', { url: f.url, enabled: want });
                changed += 1;
                console.log(`  ${want ? 'enabled' : 'disabled'} ${f.name}`);
            } catch (err) {
                console.error(`  could not touch ${f.name}: ${err.message}`);
                console.error('  this AdGuard Home build does not accept the set_url payload; use an');
                console.error('  isolated instance (see ARCHITECTURE.md, "Live verification") instead.');
                process.exit(1);
            }
        }
        await refresh();
        console.log(`other filters turned ${arg} (${changed} changed)`);
        summarize(await status());
        return;
    }

    if (cmd === 'test' && arg === 'add') {
        if (!extra) throw new Error('usage: agh-toggle.js test add <url>');
        await api('POST', '/control/filtering/add_url', { name: TEST_NAME, url: extra, whitelist: false });
        await refresh();
        console.log(`added ${extra}`);
        summarize(await status());
        return;
    }

    if (cmd === 'test' && arg === 'remove') {
        const s = await status();
        const test = s.filters.find((f) => f.name === TEST_NAME);
        if (!test) { console.log('test list is not installed'); return; }
        await api('POST', '/control/filtering/remove_url', { url: test.url });
        console.log('removed test list');
        summarize(await status());
        return;
    }

    if (cmd === 'check') {
        for (const name of process.argv.slice(3)) {
            const r = await api('GET', `/control/filtering/check_host?name=${encodeURIComponent(name)}`);
            const ids = (r.rules || []).map((x) => x.filter_list_id).join(',') || '-';
            const texts = (r.rules || []).map((x) => x.text).join(' ') || '-';
            console.log(`${String(r.reason).padEnd(22)} ${name.padEnd(34)} filter_ids=${ids}  ${texts}`);
        }
        return;
    }

    console.error('usage: agh-toggle.js snapshot|restore|show|others on|off|test add <url>|test remove|check <domain...>');
    process.exit(2);
})().catch((err) => {
    console.error(`FAILED: ${err.message}`);
    process.exit(1);
});
