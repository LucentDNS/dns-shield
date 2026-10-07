/**
 * Live DNS probe against a running resolver (default 127.0.0.1:53, i.e. the local AdGuard Home).
 *
 * Sends a real A query over UDP for each name on the command line and prints whether the name
 * resolves or is filtered, using AdGuard's own convention: a filtered name comes back either as
 * 0.0.0.0 / :: or with no answer at all.
 *
 *   node tools/dns-probe.js example.com tracker.example.net ...
 */
'use strict';

const dgram = require('dgram');

const SERVER = process.env.DNS_PROBE_SERVER || '127.0.0.1';
const PORT = Number(process.env.DNS_PROBE_PORT || 53);
const TIMEOUT_MS = 6000;

function encodeName(name) {
    const parts = name.split('.').filter(Boolean);
    const bufs = parts.map((p) => Buffer.concat([Buffer.from([p.length]), Buffer.from(p, 'ascii')]));
    return Buffer.concat([...bufs, Buffer.from([0])]);
}

function query(name) {
    return new Promise((resolve) => {
        const id = Math.floor(Math.random() * 0xffff);
        const header = Buffer.alloc(12);
        header.writeUInt16BE(id, 0);
        header.writeUInt16BE(0x0100, 2); // recursion desired
        header.writeUInt16BE(1, 4); // one question
        const question = Buffer.concat([encodeName(name), Buffer.from([0x00, 0x01, 0x00, 0x01])]);
        const packet = Buffer.concat([header, question]);

        const socket = dgram.createSocket('udp4');
        let done = false;
        const finish = (result) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try { socket.close(); } catch { /* already closed */ }
            resolve(result);
        };
        const timer = setTimeout(() => finish({ status: 'timeout', addresses: [] }), TIMEOUT_MS);

        socket.on('message', (msg) => {
            const rcode = msg.readUInt16BE(2) & 0x000f;
            const ancount = msg.readUInt16BE(6);
            const addresses = [];
            // Walk the answer section only far enough to pull A/AAAA rdata.
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
            off += 4; // qtype + qclass
            for (let i = 0; i < ancount && off + 12 <= msg.length; i += 1) {
                skipName();
                const type = msg.readUInt16BE(off);
                const rdlength = msg.readUInt16BE(off + 8);
                const rdata = msg.subarray(off + 10, off + 10 + rdlength);
                off += 10 + rdlength;
                if (type === 1 && rdlength === 4) addresses.push([...rdata].join('.'));
                else if (type === 28 && rdlength === 16) addresses.push('AAAA');
                else if (type === 5) addresses.push('CNAME');
            }
            const filtered = rcode === 3 || ancount === 0
                || addresses.every((a) => a === '0.0.0.0' || a === '::');
            finish({ status: filtered ? 'FILTERED' : 'resolved', rcode, addresses });
        });
        socket.on('error', (err) => finish({ status: 'error', error: err.message, addresses: [] }));
        socket.send(packet, PORT, SERVER);
    });
}

(async () => {
    const names = process.argv.slice(2);
    if (!names.length) {
        console.error('usage: node tools/dns-probe.js domain [domain ...]');
        process.exit(2);
    }
    console.log(`resolver ${SERVER}:${PORT}`);
    for (const name of names) {
        const r = await query(name);
        const detail = r.addresses.length ? r.addresses.join(',') : (r.error || `rcode=${r.rcode ?? '-'}`);
        console.log(`${r.status.padEnd(9)} ${name.padEnd(42)} ${detail}`);
    }
})();
