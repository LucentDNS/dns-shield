/**
 * One-shot teardown for the live-check scaffolding.
 *
 * Removes the isolated AdGuard Home working directory, the token-protected config curl used, and
 * every temporary capture written during the check. It deliberately does NOT touch
 * C:\AdGuardHome - the instance the machine actually uses is never modified by the live check.
 *
 *   node tools/cleanup-live-check.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const targets = [
    path.join(ROOT, '.cache', 'agh-test'),
    path.join(DIST, 'agh-filters.json'),
    path.join(DIST, 'agh-filters-before.json'),
    path.join(DIST, 'agh-openapi.json'),
    path.join(DIST, 'agh-probe.txt'),
    path.join(DIST, 'body-tmp.json'),
    path.join(DIST, 'filtering-status.toml'),
    path.join(DIST, 'serve-console.txt'),
];

for (const target of targets) {
    if (!fs.existsSync(target)) {
        console.log(`absent   ${target}`);
        continue;
    }
    // Guard: never delete anything outside the repository.
    if (!target.startsWith(ROOT)) throw new Error(`refusing to delete outside the repo: ${target}`);
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`removed  ${target}`);
}

console.log('');
console.log('The live AdGuard Home at C:\\AdGuardHome was never touched by the check.');
console.log('Its filter list and enabled state were read-only throughout; verify in the dashboard if in doubt.');
