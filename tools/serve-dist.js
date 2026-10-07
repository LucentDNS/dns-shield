/**
 * Minimal static file server used to let a locally running AdGuard Home fetch
 * dist/dns-shield.txt over HTTP. It serves one directory, ignores everything outside it,
 * and is meant to be killed as soon as the list has been fetched.
 *
 *   node tools/serve-dist.js [port] [dir] [host]
 *
 * The default host is 127.0.0.1, so nothing is exposed beyond the machine. Pass 0.0.0.0 only if
 * a resolver on another device on your LAN has to reach it, and understand that anyone on that
 * LAN can then read every file in the served directory.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || 8123);
const DIR = path.resolve(process.argv[3] || path.join(__dirname, '..', 'dist'));
const HOST = process.argv[4] || '127.0.0.1';

const server = http.createServer((req, res) => {
    const name = path.basename(decodeURIComponent(req.url.split('?')[0]));
    const file = path.join(DIR, name);
    if (!file.startsWith(DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found\n');
        return;
    }
    const body = fs.readFileSync(file);
    res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': body.length,
    });
    res.end(body);
    console.log(`${new Date().toISOString()}  served ${name} (${body.length} bytes) from ${req.socket.remoteAddress}`);
});

server.listen(PORT, HOST, () => {
    console.log(`serving ${DIR} on http://${HOST}:${PORT}/`);
});
