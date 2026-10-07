/**
 * Minimal static file server used ONLY to let a locally running AdGuard Home fetch
 * dist/dns-shield.txt over HTTP while we verify the list. It serves one directory, ignores
 * everything outside it, and is meant to be killed immediately after the check.
 *
 *   node tools/serve-dist.js [port] [dir]
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || 8123);
const DIR = path.resolve(process.argv[3] || path.join(__dirname, '..', 'dist'));

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
    console.log(`${new Date().toISOString()}  served ${name} (${body.length} bytes)`);
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`serving ${DIR} on http://127.0.0.1:${PORT}/`);
});
