#!/usr/bin/env node
/**
 * Write dist/stats.json - the machine-readable product summary.
 *
 * Publish steps, the CI commit message and the regression check all need the same numbers, and
 * they must come from the published file rather than from a build log line that a future refactor
 * might reword. The file is deliberately tiny and is committed alongside the list.
 *
 * Usage: node tools/write-stats.js [--out dist/dns-shield.txt]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const RE_LABEL = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const RE_BLOCK = /^\|\|([a-z0-9][a-z0-9.-]*)\^$/;
const RE_ALLOW = /^@@\|\|([a-z0-9][a-z0-9.-]*)\^\|?$/;

// Name and feed count come from the same places tools/build.js uses, so stats.json can never
// disagree with the published header.
const NAME = process.env.DNS_SHIELD_NAME || 'DNS Shield';
const REQUIRED = require('./sources.js').filter((s) => s.required !== false);

const srcIdx = process.argv.indexOf('--out');
const OUT = srcIdx > -1 ? path.resolve(process.argv[srcIdx + 1]) : path.join(DIST, 'dns-shield.txt');
const STATS = path.join(DIST, 'stats.json');

function main() {
    if (!fs.existsSync(OUT)) throw new Error(`no published list at ${OUT} - run tools/build.js first`);
    const text = fs.readFileSync(OUT, 'utf8');
    const block = [];
    const allow = [];
    for (const raw of text.split('\n')) {
        const l = raw.trim();
        if (!l || l.startsWith('!')) continue;
        const a = l.toLowerCase().match(RE_ALLOW);
        if (a && RE_LABEL.test(a[1])) { allow.push(a[1]); continue; }
        const b = l.toLowerCase().match(RE_BLOCK);
        if (b && RE_LABEL.test(b[1])) block.push(b[1]);
    }
    const stats = {
        name: NAME,
        generated: new Date().toISOString(),
        file: path.basename(OUT),
        bytes: Buffer.byteLength(text, 'utf8'),
        mib: Number((Buffer.byteLength(text, 'utf8') / 1048576).toFixed(2)),
        blockRules: block.length,
        allowRules: allow.length,
        feeds: REQUIRED.length,
        // The digest lets a subscriber or a reviewer confirm which revision of the list they hold
        // without downloading it again.
        sha256: require('crypto').createHash('sha256').update(text, 'utf8').digest('hex'),
    };
    fs.mkdirSync(DIST, { recursive: true });
    fs.writeFileSync(STATS, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
    console.log(`stats: ${stats.blockRules.toLocaleString('en-US')} block, ${stats.allowRules} allow, ${stats.mib} MiB, ${stats.feeds} feeds -> ${STATS}`);
}

try { main(); } catch (e) { console.error(`write-stats failed: ${e.message}`); process.exit(1); }
