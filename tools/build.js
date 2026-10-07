#!/usr/bin/env node
/**
 * Build the published list.
 *
 * Design note - why exceptions are NOT fed to hostlist-compiler:
 * the compiler applies top-level `inclusions` to every source with no per-source opt-out, so
 * the only inclusion shape that admits our `@@||domain^` exception rules (an allow-rule regex)
 * also deletes every block rule. Verified by bisection: with top-level inclusions the exception
 * count came out 0 and the block list came out empty of exceptions. So the compiler is used for
 * exactly one job - turning hostname feeds into a deduplicated `||domain^` set - and the
 * exclusion/exception/whitelist layers are applied here as plain set arithmetic, where the
 * order is explicit and auditable.
 *
 * Layer order (later stages win):
 *   1. blocking feeds        -> compiled by hostlist-compiler
 *   2. upstream exclusions   -> remove domains upstream withdrew after real breakage reports
 *   3. guards                -> shared-infrastructure apexes that must never be blocked wholesale
 *   4. private whitelist     -> our own entries (`domain` exact, `@domain` whole tree)
 *   5. never-whitelist       -> domains no whitelist may ever release
 *   6. upstream exceptions   -> emit @@ allow rules for confirmed false positives
 *
 * Usage: node tools/build.js [--no-compile] [--out dist/dns-shield.txt]
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.cache', 'sources');
const DIST = path.join(ROOT, 'dist');
const LOG_FILE = path.join(DIST, 'build.log');
const SOURCES = require('./sources.js');

const COMPILER_ENTRY = process.env.HOSTLIST_COMPILER
    || 'C:\\Users\\Anson\\AppData\\Roaming\\npm\\node_modules\\@adguard\\hostlist-compiler\\src\\index.js';

const OUT = (() => {
    const i = process.argv.indexOf('--out');
    return i > -1 ? path.resolve(process.argv[i + 1]) : path.join(DIST, 'dns-shield.txt');
})();

const NAME = process.env.DNS_SHIELD_NAME || 'DNS Shield';
const VERSION = process.env.DNS_SHIELD_VERSION || '1.0.0';
// The header ships to every subscriber, so it must name where the list actually lives. CI passes
// the repository URL in; a local build falls back to the README's canonical location.
const HOMEPAGE = process.env.DNS_SHIELD_HOMEPAGE || 'https://github.com/LucentDNS/dns-shield';

const RE_LABEL = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const RE_BLOCK = /^\|\|([a-z0-9][a-z0-9.-]*)\^$/;
const RE_ALLOW = /^@@\|\|([a-z0-9][a-z0-9.-]*)\^\|?$/;
const RE_IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

const logLines = [];
function log(msg) {
    const line = String(msg);
    logLines.push(line);
    console.log(line);
}
function banner(t) { log(`\n${'='.repeat(72)}\n${t}\n${'='.repeat(72)}`); }

function readLines(p) {
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
}

// ─────────────────────────────────────────────────────────── stage 1: compile blocking feeds

/**
 * hostlist-compiler rejects a config carrying keys its schema does not declare, and a source
 * with no `source` produces the misleading "Failed to validate configuration".
 *
 * The compiler reads a local file when `source` is a path instead of a URL. We point it at the
 * cached normalised hostname lists so the compiler never touches the network: that keeps a
 * build reproducible from cache alone and stops one flaky feed from aborting the whole run.
 */
function compilerSource(catalogueEntry, name) {
    return {
        name: name || catalogueEntry.name,
        source: path.join(CACHE, `${catalogueEntry.id}.txt`),
        type: 'adblock',
    };
}

function compilerConfig(blocking, excludedIds) {
    const sources = blocking.map((s) => compilerSource(s));
    if (excludedIds.size) {
        const ex = SOURCES.find((s) => s.id === 'adguard-exclusions');
        if (ex) sources.push(compilerSource(ex, 'AdGuard upstream exclusions'));
    }
    return {
        name: NAME,
        description: 'Advertisement, tracker, telemetry, phishing, malware and scam domains for DNS-level blocking.',
        homepage: HOMEPAGE,
        license: 'GPL-3.0',
        version: VERSION,
        sources,
        transformations: ['RemoveComments', 'Deduplicate', 'Compress'],
    };
}

function runCompiler(config) {
    const tmp = path.join(os.tmpdir(), `dns-shield-compile-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
    // src/index.js exports the compile function itself (module.exports = compile), not a
    // { build } namespace, it ships as CJS, and it resolves to an ARRAY of rules rather than
    // a string - joining is ours to do.
    const script = `const compile=require(${JSON.stringify(COMPILER_ENTRY)});`
        + `const cfg=JSON.parse(require('fs').readFileSync(${JSON.stringify(tmp)},'utf8'));`
        + `compile(cfg).then(r=>{require('fs').writeFileSync(${JSON.stringify(tmp + '.out')},r.join('\\n'),'utf8');})`
        + `.catch(e=>{console.error(e&&e.message||String(e));process.exit(3);});`;
    const t0 = Date.now();
    const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 28 });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (r.status !== 0 || !fs.existsSync(tmp + '.out')) {
        const detail = (r.stderr || '').trim().split('\n').slice(0, 6).join(' | ');
        throw new Error(`hostlist-compiler failed after ${secs}s: ${detail || `exit ${r.status}`}`);
    }
    const text = fs.readFileSync(tmp + '.out', 'utf8');
    fs.rmSync(tmp, { force: true });
    fs.rmSync(tmp + '.out', { force: true });
    log(`hostlist-compiler: exit 0 in ${secs}s, ${(text.length / 1048576).toFixed(2)} MiB emitted`);
    return text;
}

// ─────────────────────────────────────────────────────────── stage 2-6: layer arithmetic

function parsePrivateWhitelist(lines) {
    const exact = new Set();
    const trees = new Set();
    lines.forEach((raw) => {
        const l = raw.toLowerCase().trim();
        if (!l || l.startsWith('#')) return;
        if (l.startsWith('@')) {
            const t = l.slice(1).replace(/^\./, '');
            if (RE_LABEL.test(t)) trees.add(t);
        } else if (RE_LABEL.test(l)) exact.add(l);
    });
    return { exact, trees };
}

/** Lines that are comments or shape comments; excluded feeds arrive as plain `domain` lines. */
function normaliseExclusionLines(lines) {
    const out = new Set();
    lines.forEach((raw) => {
        const s = raw.trim().toLowerCase();
        if (!s || s.startsWith('!') || s.startsWith('#')) return;
        if (s.startsWith('||')) { const m = s.match(RE_BLOCK); if (m) out.add(m[1]); return; }
        if (RE_LABEL.test(s)) out.add(s);
    });
    return out;
}

function isUnderTree(domain, tree) { return domain === tree || domain.endsWith(`.${tree}`); }

function main() {
    fs.mkdirSync(DIST, { recursive: true });
    const started = Date.now();

    banner(`${NAME} ${VERSION} - build`);
    log(`time      ${new Date().toISOString()}`);
    log(`node      ${process.version}`);
    log(`compiler  ${COMPILER_ENTRY}`);
    log(`output    ${OUT}`);

    // ---- availability
    const available = new Map();
    SOURCES.forEach((s) => {
        const p = path.join(CACHE, `${s.id}.txt`);
        if (fs.existsSync(p) && fs.statSync(p).size > 20) {
            available.set(s.id, fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).length);
        }
    });
    const missing = SOURCES.filter((s) => !available.has(s.id));

    const blocking = SOURCES.filter((s) => s.layer !== 'exceptions' && s.layer !== 'exclusions');
    const blockingIds = new Set(blocking.map((s) => s.id));
    const exclusionsId = 'adguard-exclusions';
    // Counted for the published header only. Three distinct things ship in this file and the header
    // says which is which: single-topic upstream feeds, the four compiled coverage lists (the
    // deliberate departure from the raw-feeds-only rule) and the two policy lists, which block
    // nothing and only remove mistakes.
    const singleTopicCount = blocking.filter((s) => s.layer !== 'coverage').length;
    const coverageCount = blocking.filter((s) => s.layer === 'coverage').length;
    const policyCount = SOURCES.length - blocking.length;

    banner('stage 1  sources');
    log(`${available.size}/${SOURCES.length} sources present in cache`);
    blocking.forEach((s) => {
        if (!blockingIds.has(s.id)) return;
        const n = available.get(s.id);
        log(`  ${n ? '[ OK ]' : '[MISS]'} ${s.id.padEnd(26)} ${n ? `${String(n).padStart(7)} entries` : 'not cached'}`);
    });
    if (missing.length) {
        log('\nWARNING - missing sources (build continues without them):');
        missing.forEach((s) => log(`  - ${s.id} (${s.layer})`));
        log('  run: node tools/fetch.js');
    }

    const usable = blocking.filter((s) => available.has(s.id) && s.id !== exclusionsId);
    if (usable.length === 0) throw new Error('no blocking sources available - run tools/fetch.js first');

    banner('stage 2  compile blocking rules');
    const excludedIds = available.has(exclusionsId) ? new Set([exclusionsId]) : new Set();
    const config = compilerConfig(usable, excludedIds);
    log(`feeding ${config.sources.length} inputs to hostlist-compiler`);

    let compiledText;
    if (process.argv.includes('--no-compile') && fs.existsSync(path.join(DIST, '.compiled.raw'))) {
        compiledText = fs.readFileSync(path.join(DIST, '.compiled.raw'), 'utf8');
        log('reusing dist/.compiled.raw (--no-compile)');
    } else {
        compiledText = runCompiler(config);
        fs.writeFileSync(path.join(DIST, '.compiled.raw'), compiledText, 'utf8');
    }

    const blocked = new Set();
    let rejectedShape = 0;
    compiledText.split('\n').forEach((raw) => {
        const l = raw.trim();
        if (!l || l.startsWith('!') || l.startsWith('#')) return;
        if (l.startsWith('@@')) { rejectedShape += 1; return; }
        const m = l.match(RE_BLOCK);
        if (m && RE_LABEL.test(m[1]) && !RE_IPV4.test(m[1])) blocked.add(m[1]);
        else rejectedShape += 1;
    });
    log(`blocked domains after compiler: ${blocked.size.toLocaleString()} (rejected ${rejectedShape} non-DNS rules)`);

    // Snapshot of exactly what the feeds carry. The never-whitelist may only re-assert domains
    // that a feed actually lists - otherwise it becomes a back door for adding rules by hand.
    const fromCompiled = new Set(blocked);

    banner('stage 3  upstream exclusions');
    const exclusions = new Set();
    if (available.has(exclusionsId)) {
        normaliseExclusionLines(readLines(path.join(CACHE, `${exclusionsId}.txt`)) || []).forEach((d) => exclusions.add(d));
    }
    const privateExclusionsPath = path.join(ROOT, 'data', 'private-exclusions.txt');
    const privateExclusions = normaliseExclusionLines(readLines(privateExclusionsPath) || []);
    privateExclusions.forEach((d) => exclusions.add(d));
    log(`exclusion entries: ${exclusions.size.toLocaleString()} (${exclusions.size - privateExclusions.size} upstream, ${privateExclusions.size} local)`);

    let removed = 0;
    const exclusionTrees = [...exclusions].filter((d) => d.split('.').length <= 2);
    exclusions.forEach((d) => { if (blocked.delete(d)) removed += 1; });
    log(`removed ${removed.toLocaleString()} exact domains that upstream feeds still carry`);

    banner('stage 4  infrastructure guards');
    const guardsPath = path.join(ROOT, 'data', 'guards.txt');
    const guards = normaliseExclusionLines(readLines(guardsPath) || []);
    let guardHits = 0;
    blocked.forEach((d) => { if (guards.has(d)) { blocked.delete(d); guardHits += 1; } });
    log(`guard apexes: ${guards.size}; released ${guardHits} apex rule(s) while keeping their subdomains`);

    banner('stage 5  white lists');
    const { exact: wlExact, trees: wlTrees } = parsePrivateWhitelist(readLines(path.join(ROOT, 'data', 'whitelist.txt')) || []);
    const never = normaliseExclusionLines(readLines(path.join(ROOT, 'data', 'never-whitelist.txt')) || []);

    // A whitelist rule is refused outright when it names a protected domain. A whole-tree rule
    // is ALLOWED even when protected domains live underneath it, but those protected domains are
    // then held back (stage 5b): releasing `@baidu.com` must not resurrect `hm.baidu.com`.
    // The other direction is not a conflict at all - releasing `@google.com` cannot reach
    // `googlesyndication.com`, because that host is not inside google.com.
    const refusedExact = new Set([...wlExact].filter((d) => never.has(d)));
    refusedExact.forEach((d) => wlExact.delete(d));
    if (refusedExact.size) log(`never-whitelist refused ${refusedExact.size} exact rule(s): ${[...refusedExact].slice(0, 6).join(', ')}`);

    log(`private whitelist: ${wlExact.size} exact, ${wlTrees.size} whole-tree`);
    log(`never-whitelist (protected): ${never.size}`);

    let wlRemoved = 0;
    wlExact.forEach((d) => { if (blocked.delete(d)) wlRemoved += 1; });
    wlTrees.forEach((t) => {
        blocked.forEach((d) => { if (isUnderTree(d, t)) { blocked.delete(d); wlRemoved += 1; } });
    });
    log(`whitelist released ${wlRemoved.toLocaleString()} blocked domains`);

    banner('stage 5b  never-whitelist priority');
    // Re-assert the protected set against every release applied above. This is what lets a
    // whole-tree whitelist coexist with a precise protection list.
    let restored = 0;
    const restoredNames = [];
    never.forEach((d) => {
        if (fromCompiled.has(d)) {
            blocked.add(d);
            restored += 1;
            restoredNames.push(d);
        }
    });
    // ...and protect a released tree's own children. The loop starts at 0 and stops at the
    // registrable root: for `log.mmstat.com` the roots are `log.mmstat.com`, `mmstat.com` and
    // `com`, and any of them having been released by a whitelist tree means the protected host
    // was dragged back into service without being named. Starting at 1 skipped two-label roots
    // entirely (`doubleclick.net`, `mmstat.com`), and stopping at `parts.length - 1` never
    // checked the root at all - both were silent holes.
    never.forEach((d) => {
        if (blocked.has(d)) return;
        const parts = d.split('.');
        for (let i = 0; i <= parts.length - 2; i += 1) {
            const ancestor = parts.slice(i).join('.');
            if (wlTrees.has(ancestor)) {
                blocked.add(d);
                restored += 1;
                restoredNames.push(d);
                return;
            }
        }
    });
    log(`re-blocked ${restored} protected domain(s) that a whitelist tree would have released`);
    if (restoredNames.length) log(`  ${restoredNames.slice(0, 10).join(', ')}${restoredNames.length > 10 ? ` ...+${restoredNames.length - 10}` : ''}`);

    banner('stage 5c  curated patch rules');
    // Applied last among the blocking stages and outside the `fromCompiled` snapshot on purpose:
    // these are the only rules no feed justifies, so they must be re-asserted after every release
    // decision above rather than be subject to them.
    const extraBlock = readLines(path.join(ROOT, 'data', 'extra-block.txt')) || [];
    const extraDomains = [];
    extraBlock.forEach((raw) => {
        const d = raw.trim().toLowerCase().replace(/^\./, '');
        if (!d || d.startsWith('#') || !RE_LABEL.test(d)) return;
        extraDomains.push(d);
        blocked.add(d);
    });
    log(`curated patch rules: ${extraDomains.length}`);
    if (extraDomains.length > 25) log(`WARNING: patch file has grown to ${extraDomains.length} entries - each one is a rule no feed justifies; move it upstream or drop it`);

    banner('stage 6  upstream exceptions');
    const exceptionsRaw = readLines(path.join(CACHE, 'adguard-exceptions.txt')) || [];
    const exceptions = new Set();
    exceptionsRaw.forEach((raw) => {
        const m = raw.trim().toLowerCase().match(RE_ALLOW);
        if (m && RE_LABEL.test(m[1])) exceptions.add(m[1]);
    });
    const protectedExceptions = [...exceptions].filter((d) => never.has(d));
    protectedExceptions.forEach((d) => exceptions.delete(d));
    if (protectedExceptions.length) {
        log(`refused ${protectedExceptions.length} upstream exception(s) naming a protected domain: ${protectedExceptions.join(', ')}`);
    }
    // A whole-tree whitelist entry is a statement that this registrable domain must keep working.
    // An upstream exception for `log.mmstat.com` cannot survive that - the policy layer already
    // decided, for a documented reason, that the telemetry host does not get to be released.
    // Without this, the exception re-opens exactly what the never-whitelist closed.
    const treeOverridden = [...exceptions].filter((d) => {
        const parts = d.split('.');
        for (let i = 0; i <= parts.length - 2; i += 1) {
            if (never.has(parts.slice(i).join('.'))) return true;
        }
        return false;
    });
    treeOverridden.forEach((d) => exceptions.delete(d));
    if (treeOverridden.length) {
        log(`refused ${treeOverridden.length} upstream exception(s) covered by the never-whitelist: ${treeOverridden.join(', ')}`);
    }
    // An exception only earns its place if we would otherwise block it.
    const live = new Set();
    exceptions.forEach((d) => { if (blocked.has(d)) live.add(d); });
    log(`upstream exception rules: ${exceptions.size}; of those ${live.size} actually release a domain we block`);
    log(`  (${exceptions.size - live.size} are inert - they name domains no feed blocks)`);
    live.forEach((d) => { blocked.delete(d); });

    banner('stage 6b  whole-tree exceptions');
    // Some upstream exceptions name a host whose registrable parent is also blocked; releasing
    // only the exact host would leave the app broken on the next subdomain it touches. Only the
    // immediate parent is released, and only when it is not a broad/shared domain - going
    // further up would hand back things like `costco.com` on the strength of one host exception.
    //
    // The check must be containment, not equality: testing `never.has(parent)` misses the case
    // that actually bites - an exception for `log.mmstat.com` releasing its parent `mmstat.com`,
    // which hands back the protected host as a free side effect. A parent is only releasable when
    // no protected domain lives underneath it.
    const neverRoots = new Set();
    never.forEach((d) => {
        const parts = d.split('.');
        for (let i = 0; i <= parts.length - 2; i += 1) neverRoots.add(parts.slice(i).join('.'));
    });
    const treeReleases = new Set();
    const treeRefused = new Set();
    live.forEach((d) => {
        const parts = d.split('.');
        if (parts.length !== 3) return;
        const parent = parts.slice(1).join('.');
        if (!blocked.has(parent)) return;
        if (never.has(parent) || guards.has(parent)) { treeRefused.add(parent); return; }
        if ([...neverRoots].some((r) => isUnderTree(r, parent))) { treeRefused.add(parent); return; }
        blocked.delete(parent);
        live.add(parent);
        treeReleases.add(parent);
    });
    if (treeReleases.size) log(`also released ${treeReleases.size} parent domain(s): ${[...treeReleases].slice(0, 8).join(', ')}`);
    if (treeRefused.size) log(`refused to widen the release to ${treeRefused.size} parent(s) that contain a protected domain: ${[...treeRefused].slice(0, 8).join(', ')}`);

    // Any exception that contradicts the protection list is dropped from the allow section as
    // well, so the published file can never contain the same domain in both sections.
    never.forEach((d) => { live.delete(d); });

    banner('stage 7  emit');
    const blockSorted = [...blocked].sort();
    const allowSorted = [...live].sort();
    // A domain must never appear in both sections.
    const contradictory = allowSorted.filter((d) => blocked.has(d));
    if (contradictory.length) throw new Error(`internal error: ${contradictory.length} domains both blocked and allowed`);

    const header = [
        `! Title: ${NAME}`,
        `! Description: Ad, tracker, telemetry, phishing, malware and scam domains for DNS-level blocking.`,
        `! Homepage: ${HOMEPAGE}`,
        `! License: GPL-3.0`,
        `! Version: ${VERSION}`,
        `! Last modified: ${new Date().toISOString()}`,
        `!`,
        `! Built from ${singleTopicCount} single-topic upstream feeds, ${coverageCount} compiled`,
        `! coverage lists and ${policyCount} policy lists. The policy lists block nothing: they only`,
        `! withdraw rules that upstream confirmed as false positives.`,
        `! Contains ${blockSorted.length.toLocaleString()} block rules and ${allowSorted.length.toLocaleString()} exception rules.`,
        `! ${allowSorted.length} upstream-confirmed false positives are explicitly allowed.`,
        `!`,
        `! Syntax: AdGuard / DNS-level rules only (||domain^ and @@||domain^). No cosmetic,`,
        `! scriptlet or modifier rules - safe for Pi-hole, AdGuard Home, AdGuard DNS, dnsmasq`,
        `! and blocky after the usual hosts-format conversion.`,
        '',
    ].join('\n');

    const body = [...blockSorted.map((d) => `||${d}^`), ...allowSorted.map((d) => `@@||${d}^`)].join('\n');
    const out = `${header}${body}\n`;
    fs.writeFileSync(OUT, out, 'utf8');

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    banner('summary');
    log(`block rules      ${blockSorted.length.toLocaleString()}`);
    log(`exception rules  ${allowSorted.length.toLocaleString()}`);
    log(`bytes            ${out.length.toLocaleString()} (${(out.length / 1048576).toFixed(2)} MiB)`);
    log(`output           ${OUT}`);
    log(`elapsed          ${elapsed}s`);
    if (missing.length) log(`WARNING          ${missing.length} source(s) missing - see stage 1`);

    fs.writeFileSync(LOG_FILE, `${logLines.join('\n')}\n`, 'utf8');
    log(`log              ${LOG_FILE}`);
    log('build OK');
}

try { main(); } catch (e) {
    log(`\nBUILD FAILED: ${e.message}`);
    logLines.push(e.stack || '');
    fs.mkdirSync(DIST, { recursive: true });
    fs.writeFileSync(LOG_FILE, `${logLines.join('\n')}\n`, 'utf8');
    process.exit(1);
}
