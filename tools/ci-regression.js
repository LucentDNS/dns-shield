#!/usr/bin/env node
/**
 * Regression budget for CI.
 *
 * A list that quietly stops working is far worse than one that fails to build, and none of the
 * other checks would notice: audit.js validates policy, coverage-gap.js validates the derivation,
 * benchmark.js reports coverage - none of them compares today's product against yesterday's. This
 * does, and it fails the run when the change is not explainable by feed churn.
 *
 * Usage: node tools/ci-regression.js [--previous <path-to-old-list>]
 *
 * The previous list is expected to be the committed dist/dns-shield.txt fetched from git before
 * the build overwrote it (see .github/workflows/build.yml). Without one, the check passes and says
 * so, because the first run on a fresh checkout has nothing to compare against.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RE_LABEL = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const RE_BLOCK = /^\|\|([a-z0-9][a-z0-9.-]*)\^$/;
const RE_ALLOW = /^@@\|\|([a-z0-9][a-z0-9.-]*)\^\|?$/;

const prevIdx = process.argv.indexOf('--previous');
const PREV = prevIdx > -1
    ? path.resolve(process.argv[prevIdx + 1])
    : path.join(ROOT, 'dist', 'previous.txt');
const CURR = path.join(ROOT, 'dist', 'dns-shield.txt');

/**
 * Budgets. Each one answers "how much churn can a day of upstream feed activity legitimately
 * produce?". They are generous on purpose - the point is to catch a collapse or a runaway, not to
 * make routine feed churn fail the build - and every breach is reported with the actual delta so
 * a human can tell a real regression from a policy change.
 */
const BUDGET = {
    minBlockRatio: 0.90,   // never lose more than 10% of the block rules at once
    maxBlockRatio: 1.25,   // nor grow more than 25% without review
    maxAllowAbsolute: 60,  // an allow section above this means the exception layer has run away
    maxAllowGrowth: 25,    // and it may not grow by more than 25 entries in one run
    maxSizeRatio: 1.25,    // the shipped file may not grow more than 25%
};

function load(p) {
    if (!fs.existsSync(p)) return null;
    const block = new Set();
    const allow = new Set();
    let bytes = 0;
    const text = fs.readFileSync(p, 'utf8');
    bytes = Buffer.byteLength(text, 'utf8');
    for (const raw of text.split('\n')) {
        const l = raw.trim().toLowerCase();
        if (!l || l.startsWith('!') || l.startsWith('#')) continue;
        const a = l.match(RE_ALLOW);
        if (a) { if (RE_LABEL.test(a[1])) allow.add(a[1]); continue; }
        const b = l.match(RE_BLOCK);
        if (b) { if (RE_LABEL.test(b[1])) block.add(b[1]); continue; }
        if (!l.includes('/') && !l.includes(' ') && RE_LABEL.test(l)) block.add(l);
    }
    return { block, allow, bytes };
}

function main() {
    const curr = load(CURR);
    if (!curr) throw new Error(`no current list at ${CURR}`);
    const prev = load(PREV);

    console.log('ci-regression: comparing the new list against the published one');
    console.log(`  current  ${curr.block.size.toLocaleString('en-US')} block, ${curr.allow.size} allow, ${(curr.bytes / 1048576).toFixed(2)} MiB`);

    if (!prev) {
        console.log(`  previous (none at ${PREV}) - nothing to compare, check passes`);
        console.log('  NOTE: on a first run this is expected; it is not a substitute for review.');
        return;
    }

    console.log(`  previous ${prev.block.size.toLocaleString('en-US')} block, ${prev.allow.size} allow, ${(prev.bytes / 1048576).toFixed(2)} MiB`);

    const failures = [];
    const notes = [];

    const blockRatio = curr.block.size / prev.block.size;
    if (blockRatio < BUDGET.minBlockRatio) {
        const lost = [...prev.block].filter((d) => !curr.block.has(d));
        failures.push(`block rules fell ${((1 - blockRatio) * 100).toFixed(1)}% (${prev.block.size.toLocaleString('en-US')} -> ${curr.block.size.toLocaleString('en-US')}); first missing: ${lost.slice(0, 8).join(', ')}`);
    }
    if (blockRatio > BUDGET.maxBlockRatio) {
        failures.push(`block rules grew ${((blockRatio - 1) * 100).toFixed(1)}% (over the ${((BUDGET.maxBlockRatio - 1) * 100).toFixed(0)}% budget) - review before publishing`);
    }

    const allowGrowth = curr.allow.size - prev.allow.size;
    if (curr.allow.size > BUDGET.maxAllowAbsolute) {
        failures.push(`allow section has ${curr.allow.size} entries (absolute budget ${BUDGET.maxAllowAbsolute}) - the exception layer is not being reviewed`);
    }
    if (allowGrowth > BUDGET.maxAllowGrowth) {
        failures.push(`allow section grew by ${allowGrowth} entries (budget ${BUDGET.maxAllowGrowth})`);
    }

    const sizeRatio = curr.bytes / prev.bytes;
    if (sizeRatio > BUDGET.maxSizeRatio) {
        failures.push(`published file grew ${((sizeRatio - 1) * 100).toFixed(1)}% (${(prev.bytes / 1048576).toFixed(2)} -> ${(curr.bytes / 1048576).toFixed(2)} MiB)`);
    }

    // Newly-blocked domains are worth naming even when they are in budget: a spike in one
    // registrable domain usually means a feed mis-published a shared host.
    const added = [...curr.block].filter((d) => !prev.block.has(d));
    if (added.length) notes.push(`${added.length.toLocaleString('en-US')} rule(s) added since the last publish`);
    const topAdded = new Map();
    added.forEach((d) => {
        const parts = d.split('.');
        const apex = parts.slice(-2).join('.');
        topAdded.set(apex, (topAdded.get(apex) || 0) + 1);
    });
    const hot = [...topAdded.entries()].filter(([, n]) => n >= 100).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (hot.length) notes.push(`registrable domains with 100+ new rules: ${hot.map(([d, n]) => `${d} (${n})`).join(', ')}`);

    notes.forEach((n) => console.log(`  note:    ${n}`));
    failures.forEach((f) => console.log(`  FAIL:    ${f}`));

    if (failures.length) {
        console.log(`\nci-regression: ${failures.length} budget breach(es) - refusing to publish`);
        process.exit(1);
    }
    console.log('\nci-regression: within budget');
}

try { main(); } catch (e) { console.error(`ci-regression failed: ${e.message}`); process.exit(1); }
