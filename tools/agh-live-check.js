/**
 * Drive the isolated AdGuard Home instance (started by tools/agh-toggle.js conventions but on
 * alternate ports) through a full live check of dist/dns-shield.txt:
 *
 *   1. add the list over HTTP
 *   2. force a refresh and confirm the rule count AdGuard actually loaded
 *   3. ask AdGuard itself which filter blocks each probe domain (GET /control/filtering/check_host)
 *   4. send real DNS queries through the instance's own resolver on port 15353
 *
 * Usage: node tools/agh-live-check.js <list-url> <domain> [domain ...]
 */
'use strict';

const dgram = require('dgram');

const BASE = process.env.AGH_TEST_BASE || 'http://127.0.0.1:13000';
const DNS_PORT = Number(process.env.AGH_TEST_DNS_PORT || 15353);
const USER = process.env.AGH_USER || 'admin';
const PASS = process.env.AGH_PASS || 'admin123';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const LIST_NAME = 'DNS Shield';

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
    if (!res.ok) throw new Error(`${method} ${endpoint} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
    try { return JSON.parse(text); } catch { return text; }
}

function encodeName(name) {
    const parts = name.split('.').filter(Boolean);
    const bufs = parts.map((p) => Buffer.concat([Buffer.from([p.length]), Buffer.from(p, 'ascii')]));
    return Buffer.concat([...bufs, Buffer.from([0])]);
}

function dnsQuery(name) {
    return new Promise((resolve) => {
        const id = Math.floor(Math.random() * 0xffff);
        const header = Buffer.alloc(12);
        header.writeUInt16BE(id, 0);
        header.writeUInt16BE(0x0100, 2);
        header.writeUInt16BE(1, 4);
        const packet = Buffer.concat([header, encodeName(name), Buffer.from([0x00, 0x01, 0x00, 0x01])]);
        const socket = dgram.createSocket('udp4');
        let done = false;
        const finish = (r) => { if (done) return; done = true; clearTimeout(timer); try { socket.close(); } catch {} resolve(r); };
        const timer = setTimeout(() => finish({ status: 'timeout', addresses: [] }), 6000);
        socket.on('message', (msg) => {
            const rcode = msg.readUInt16BE(2) & 0x000f;
            const ancount = msg.readUInt16BE(6);
            const addresses = [];
            let off = 12;
            const skipName = () => {
                while (off < msg.length) {
                    const len = msg[off];
                    if (len === 0) { off += 1; return; }
                    if ((len & 0xc0) === 0xc0) { off += 2; return; }
                    off += 1 + len;
                }
            };
            skipName();
            off += 4;
            for (let i = 0; i < ancount && off + 12 <= msg.length; i += 1) {
                skipName();
                const type = msg.readUInt16BE(off);
                const rdlength = msg.readUInt16BE(off + 8);
                const rdata = msg.subarray(off + 10, off + 10 + rdlength);
                off += 10 + rdlength;
                if (type === 1 && rdlength === 4) addresses.push([...rdata].join('.'));
                else if (type === 28) addresses.push('AAAA');
                else if (type === 5) addresses.push('CNAME');
            }
            const filtered = rcode === 3 || ancount === 0 || addresses.every((a) => a === '0.0.0.0' || a === '::');
            finish({ status: filtered ? 'FILTERED' : 'resolved', rcode, addresses });
        });
        socket.on('error', (err) => finish({ status: 'error', error: err.message, addresses: [] }));
        socket.send(packet, DNS_PORT, '127.0.0.1');
    });
}

(async () => {
    const [url, ...domains] = process.argv.slice(2);
    if (!url || !domains.length) {
        console.error('usage: node tools/agh-live-check.js <list-url> <domain> [domain ...]');
        process.exit(2);
    }

    console.log(`instance ${BASE}   resolver 127.0.0.1:${DNS_PORT}`);
    try {
        await api('POST', '/control/filtering/add_url', { name: LIST_NAME, url, whitelist: false });
        console.log(`added filter "${LIST_NAME}" -> ${url}`);
    } catch (err) {
        console.log(`filter already installed (${err.message})`);
    }

    try {
        const refreshed = await api('POST', '/control/filtering/refresh', { whitelist: false });
        console.log(`refresh: ${JSON.stringify(refreshed).slice(0, 200)}`);
    } catch (err) {
        // AdGuard starts a background update as soon as the list is added, so asking for another
        // one races it and answers 500. The poll below is the real wait.
        console.log(`refresh request not needed: ${err.message}`);
    }

    let status = await api('GET', '/control/filtering/status');
    let test = status.filters.find((f) => f.name === LIST_NAME);
    const deadline = Date.now() + 10 * 60 * 1000;
    let lastCount = -1;
    while (test && test.rules_count === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        status = await api('GET', '/control/filtering/status');
        test = status.filters.find((f) => f.name === LIST_NAME);
        if (test && test.rules_count !== lastCount) {
            lastCount = test.rules_count;
            console.log(`  loaded ${test.rules_count} rules so far...`);
        }
    }
    if (!test || test.rules_count === 0) throw new Error('the list never loaded a non-zero rule count');

    for (const f of status.filters) {
        console.log(`  filter "${f.name}" id=${f.id} rules=${f.rules_count} enabled=${f.enabled} updated=${f.last_updated}`);
    }
    console.log(`  filtering enabled: ${status.enabled}`);

    console.log('');
    console.log('domain'.padEnd(38) + 'check_host'.padEnd(22) + 'dns');
    let blockedByList = 0;
    let dnsFiltered = 0;
    for (const name of domains) {
        const chk = await api('GET', `/control/filtering/check_host?name=${encodeURIComponent(name)}`);
        const r = await dnsQuery(name);
        const byList = chk.reason === 'FilteredBlackList' && (chk.rules || []).length > 0;
        if (byList) blockedByList += 1;
        if (r.status === 'FILTERED') dnsFiltered += 1;
        const detail = r.addresses.length ? r.addresses.join(',') : `rcode=${r.rcode ?? '-'}`;
        const rule = (chk.rules || []).map((x) => x.text).join(' ') || '-';
        console.log(`${name.padEnd(38)}${String(chk.reason).padEnd(22)}${r.status} ${detail} ${rule}`);
    }
    console.log('');
    console.log(`blocked by this list: ${blockedByList}/${domains.length}   dns-level filtered: ${dnsFiltered}/${domains.length}`);
})().catch((err) => {
    console.error(`FAILED: ${err.message}`);
    process.exit(1);
});
