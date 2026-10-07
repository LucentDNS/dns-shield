# DNS Shield

[![build](https://github.com/LucentDNS/dns-shield/actions/workflows/build.yml/badge.svg)](https://github.com/LucentDNS/dns-shield/actions/workflows/build.yml)
[![rules](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FLucentDNS%2Fdns-shield%2Fmain%2Fdist%2Fstats.json&query=%24.blockRules&label=block%20rules&color=blue)](https://github.com/LucentDNS/dns-shield/blob/main/dist/stats.json)
[![licence: GPL-3.0](https://img.shields.io/badge/licence-GPL--3.0-blue)](LICENSE)
[![feeds: 27 catalogue, 26 compiled](https://img.shields.io/badge/feeds-27%20catalogue%2C%2026%20compiled-blue)](THIRD-PARTY-NOTICES.md)

DNS Shield is a DNS-level blocklist for advertisements, trackers, telemetry beacons, phishing,
malware and scam domains. It ships as one plain text file in AdGuard / DNS rule syntax only:
`||domain^` block rules and `@@||domain^` exception rules, with no cosmetic rules, no scriptlets
and no `$` modifiers. Because it contains nothing but domain rules, it is consumed by a DNS
resolver rather than by a browser extension, and it works in AdGuard Home, AdGuard DNS, Pi-hole
(after the usual hosts-format conversion), dnsmasq and blocky.

The published file is rebuilt every day, so its rule count moves by a few hundred either way. The
current figures are always in the file's own header:

```
! Contains 537,260 block rules and 28 exception rules.
! List revision: 6d37dc164e2d
```

The numbers quoted below come from the reference build of 2026-10-07: **537,260 block rules,
28 exception rules, 11.77 MiB**. Treat them as a shape, not a promise — trust the header, or
`dist/stats.json`, for today's exact count.

## Why this list

This is not a new detection engine, and it does not claim to find anything the upstream projects
miss. It is a **curated union with a policy layer on top**, and it is honest about which part is
which:

- **Coverage comes from upstream.** Four well-maintained aggregate lists are used as a coverage
  layer — OISD Big, HaGeZi's Pro, AdRules DNS List and AdGuard DNS filter — alongside twenty
  single-topic feeds for abuse/phishing, ad and tracking servers, and China-specific telemetry
  SDKs: twenty-four blocking feeds in total, plus two AdGuard policy feeds (their exclusions and
  their human-confirmed false positives), so 26 feeds feed the build. Each feed keeps its own licence
  and its own maintainers; `tools/sources.js` records the origin, refresh cadence and risk note of
  every one.
- **What this project adds is policy, not detection.** Three things the aggregate lists do not do
  for themselves:
  - a **never-whitelist** (`data/never-whitelist.txt`, 95 protected domains) so a whitelist can
    never quietly re-enable a tracker;
  - **infrastructure guards** (`data/guards.txt`, 135 shared CDN/hosting apexes) so one malicious
    tenant does not take a whole platform down with it;
  - **curated patch rules** (`data/extra-block.txt`, 3 entries) for hosts upstream only ever
    publishes in a shape that does not survive normalisation.
- **It fixes the compiler's cross-feed behaviour instead of living with it.** `Compress` drops a
  rule when any ancestor is present, so a feed shipping the bare `cloudfront.net` used to delete
  ~1,900 `*.cloudfront.net` ad distributions that four other feeds name individually. The build now
  snapshots what each feed says on its own and restores the difference **before** any release stage
  runs, which recovered 23,394 hostnames and is why coverage below rose by roughly three points.
  `ARCHITECTURE.md` documents the mechanism and the proof that it converges on the same rule set as
  compiling every feed separately.
- **It measures itself instead of asserting.** `tools/benchmark.js` puts this list and the four
  peers on one ruler, and `tools/audit.js` fails the build on a regression. The numbers from the
  reference run (2026-10-07) are — and the peer counts below drift daily too, which is why they are
  never quoted outside this dated table:

  | Peer | Their rules | Share we also block |
  | --- | --- | --- |
  | OISD Big | 240,418 | 98.6% |
  | HaGeZi's Pro | 198,605 | 97.7% |
  | AdRules DNS List | 198,109 | 98.5% |
  | AdGuard DNS filter | 178,228 | 98.8% |

  Across the union of all four (481,700 rules), this list covers **98.8%**; **5,897** rules exist
  only in those lists and not here. The remaining distance is explained, not hidden:
  `tools/coverage-gap.js` classifies every un-carried peer rule as intended (covered by an ancestor
  rule, or released by an exclusion, a guard, the whitelist or an exception) or as a bug, and for
  all four peers the reference run reported `0 are defects` with the derived rule set reconciling
  against the published file exactly. Of the 1,763 rules that **all four** peers carry and we do
  not, 1,378 are `*.cloudfront.net` distributions sitting under a whole-tree whitelist entry kept
  on purpose - a policy tradeoff, documented rather than papered over.
- **Over-blocking is measured too.** AdGuard's own 172 hand-written exceptions are used as an
  independent ruler: each one is a host a human already proved broken. This list still blocks
  **2** of them — `sax.sina.com.cn` and `log.mmstat.com`, both pinned deliberately in
  `data/never-whitelist.txt` and `data/extra-block.txt` because they are telemetry endpoints. On
  the same ruler AdGuard DNS filter blocks 23, AdRules DNS List 18, OISD Big 4 and HaGeZi's Pro 2.

The tradeoff is real and worth stating plainly: 537,260 rules is more than twice OISD Big's
240,418, and the file is 11.77 MiB. That makes this list a poor fit for a memory-constrained
router or a phone on a metered connection. `dist/audit.log` also carries one standing warning:
fourteen dual-use URL shorteners and DNS providers (bit.ly, tinyurl.com, adf.ly and similar) are
blocked whole because abuse feeds list them; ordinary link sharing through those services breaks,
and that is a deliberate decision recorded in the audit, not a silent side effect.

## Quick start

Subscribe to the raw file:

```
https://raw.githubusercontent.com/LucentDNS/dns-shield/main/dist/dns-shield.txt
```

> If you publish this under a different account, replace `LucentDNS/dns-shield` here, in the issue
> link below, and set `DNS_SHIELD_HOMEPAGE` before building so the header in the emitted list points
> at the right place.

### AdGuard Home

1. Open the dashboard and go to **Filters → DNS blocklists**.
2. Click **Add blocklist**, then **Add a custom list**.
3. Name it `DNS Shield`, paste the URL above into the list URL field, and save.
4. AdGuard Home refreshes it on the schedule you configured for blocklists.

### How the list keeps itself current

The subscription URL never changes. The file behind it is rebuilt by the workflow in
`.github/workflows/build.yml`, which runs **daily at 03:17 UTC** (11:17 Beijing time) — deliberately
off the hour, because GitHub's scheduled runners are congested at `:00` and a delayed start is the
most common reason a scheduled job is skipped. You can also start a run by hand from the **Actions**
tab (Run workflow), optionally forcing a full re-download of every feed.

A run that finds no change publishes nothing: the last step compares the rebuilt file and only
commits when it actually differs. Two more properties matter if you are relying on it:

- **It never publishes an unverified list.** Audit, coverage reconciliation and a regression budget
  all run before the commit step and exit non-zero on a regression, so a broken build leaves
  yesterday's file in place rather than pushing something worse to your resolver.
- **The gates also run on the push that could break them.** Any commit touching `tools/`, `data/`,
  `package.json`, `LICENSE`, `THIRD-PARTY-NOTICES.md` or the workflow itself runs `npm run verify`
  again, so a change that breaks attribution, coverage or the rule syntax fails its own run instead
  of being discovered by the next morning's build — by which time it is live.
- **The header is reproducible.** A `! List revision:` digest over the feed bodies, plus a
  `! Last modified:` derived from upstream headers rather than the clock, means `dist/stats.json`
  hashes the bytes you actually downloaded - not the moment they were rebuilt.

Everything that decides what the list looks like is in the repository and reviewable in a diff:
[`ARCHITECTURE.md`](ARCHITECTURE.md) for the stages, [`SOURCES.md`](SOURCES.md) for the feeds and what
is risky about each, [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) for who owns them.

The one thing that cannot live in a diff is the About box on the repository page. If you are
maintaining a copy, `node tools/github-metadata.js` prints what it would set and `--apply` writes it,
using a token you supply through `GITHUB_TOKEN`; it also turns off the wiki, because a second copy of
the documentation is a copy that stops matching the data.

GitHub disables scheduled workflows in a repository that has seen no activity for 60 days; the daily
commit is itself activity, so this only becomes relevant if the upstream feeds all go quiet for two
months.

### Check your allowlists before you trust it

AdGuard Home applies **whitelist filters over blocklists**. An `@@` rule in any allowlist you have
installed punches through this list regardless of which blocklists are enabled, and disabling a
blocklist does not disable an allowlist. One concrete measurement: HaGeZi's Allowlist Referral
(the one that keeps affiliate and referral links redirecting) releases 272 hostnames across 249
registrable domains from this list — among them `adjust.com`, `appsflyer.com`, `a9.com`,
`ad.doubleclick.net`, `adform.net` and `amazon-adsystem.com`.

Two tools make that visible instead of invisible:

```bash
node tools/whitelist-impact.js <allowlist-file>   # how many holes does this allowlist open?
node tools/referral-gaps.js                       # writes REFERRAL-GAPS.md, annotated
```

`REFERRAL-GAPS.md` lists every released hostname grouped by registrable domain, with a note on the
ones that are advertising or attribution infrastructure, plus the wildcard rules that cover blocked
names. If you want a referral host reachable, prefer adding that one host to your resolver's own
user rules over installing an allowlist that releases hundreds of trackers:

```yaml
user_rules:
  - '@@||adjust.com^'   # only if you really need the Adjust SDK to resolve
```

### AdGuard DNS and the AdGuard apps

Add the URL as a custom filter list wherever the product accepts a filter subscription by URL:
in the AdGuard DNS dashboard, or under **Settings → Filters → Custom filters** in the AdGuard
desktop and mobile apps. Because this list is DNS-syntax only, what you get is DNS-level blocking;
the cosmetic element-hiding that the AdGuard browser extension does is not part of this list.

### Pi-hole

Pi-hole's gravity expects hosts format (`0.0.0.0 domain`), so convert the file first:

```bash
sed -e '/^!/d' -e '/^@@/d' -e 's/^||\(.*\)\^$/0.0.0.0 \1/' dns-shield.txt > dns-shield.hosts
```

Point Pi-hole at the resulting `dns-shield.hosts` (as a local list, or serve it over HTTP) and
re-run gravity with `pihole -g`.

Dropping the `@@||domain^` lines during conversion costs nothing: the build refuses to publish a
domain in both sections, so every exception domain is absent from the block section already and
simply stays unblocked.

### Generic `||domain^` consumers (dnsmasq, blocky)

A consumer that understands AdGuard/DNS domain rules — blocky, for example — can be pointed at the
file or the URL directly. dnsmasq does not read this syntax; convert it the same way as for
Pi-hole and load the result as an additional hosts file:

```bash
sed -e '/^!/d' -e '/^@@/d' -e 's/^||\(.*\)\^$/0.0.0.0 \1/' dns-shield.txt > dns-shield.hosts
```

```conf
addn-hosts=/etc/dnsmasq.d/dns-shield.hosts
```

Be aware that a 537,260-line `addn-hosts` file is heavy for dnsmasq, which keeps hosts entries in
memory — the same memory caveat that applies to a small router applies here.

## What it blocks, and what it deliberately does not

It blocks, at DNS level: advertising servers and ad exchanges; tracking, analytics and attribution
endpoints; telemetry beacons; mobile in-app ad and analytics SDKs; cryptomining domains; phishing,
malware distribution and scam domains; and the China-specific telemetry/ads SDK layer.

It deliberately does **not**:

- do cosmetic filtering — there are no element-hiding rules, because there is no page to modify;
- ship scriptlets, `$modifier` rules, wildcards or regex rules — the audit fails the build if any
  such shape reaches the file;
- bypass HTTPS or DNS-over-HTTPS — it answers DNS queries, so an app that ships its own DoH/DoT
  resolver, or connects to a hardcoded IP, is not affected by it at all;
- provide client-side content rules — this is a resolver-side list, not a browser extension filter;
- filter adult content — the feeds it composes do not include an adult list, so a subscriber who
  wants that must add such a feed to their resolver themselves.

## False positives

If this list breaks a site or an app, please report it rather than silently living with it.

1. **Report it.** Open an issue at <https://github.com/LucentDNS/dns-shield/issues> with the blocked
   hostname, the site or app that broke, and the query as your resolver logged it. The fastest fix
   upstream is a report with the exact hostname.
2. **Or fix it locally** by editing `data/whitelist.txt`. Two syntaxes, deliberately different:

   ```
   domain.com     # release exactly this hostname; its subdomains stay blocked
   @domain.com    # release the whole tree: the hostname and every subdomain
   ```

   `@` is blunt — it also releases every tracking subdomain under that name. Use it only where a
   service genuinely moves its endpoints across unpredictable subdomains. Add personal entries at
   the bottom of the file under `PERSONAL`. Then rebuild and re-run the audit.

### Do not edit `data/never-whitelist.txt`

`data/never-whitelist.txt` is the **protection set** (93 domains), not a list of suggestions. The
build refuses, by design:

- an exact whitelist rule naming a protected domain;
- a whole-tree rule that contains a protected domain — the protected hosts are re-asserted
  afterwards (in the reference build, 86 protected domains were re-blocked this way after the
  whitelist stage released 2,860 domains);
- an upstream exception naming, or contained in, a protected domain (the reference build refused
  2 exceptions naming a protected domain and 12 more covered by the protection set).

A whitelist is where a filter list quietly loses its value: one rule that releases a tracker is
enough to make the whole protection layer meaningless. So a request to unblock one of these
trackers is **refused by design, not by oversight**. If you need one of them reachable, you are
asking to switch off the one guarantee this project makes, and the answer is to edit your own
resolver rules rather than this file. The same applies to `data/extra-block.txt`, which pins the
three hosts upstream publishes only as exception-shaped rules — `pagead2.googlesyndication.com`,
`log.mmstat.com` and `sax.sina.com.cn`. Fix a false positive in `data/whitelist.txt`, never by
deleting a line from the protection set.

## Repository layout

- `package.json` — npm scripts (`fetch`, `build`, `audit`, `gap`, `benchmark`, `stats`, `sources`,
  `pipeline`, `verify`, `referral-gaps`, `whitelist-impact`, plus `live` / `clean:live` for the live
  resolver check) and the `@adguard/hostlist-compiler` devDependency; requires Node.js `>= 20`.
- `tools/sources.js` — the source catalogue: 27 entries, being 24 blocking feeds (twenty
  single-topic feeds plus the four compiled coverage lists), two AdGuard policy feeds, and one
  reference-only allowlist that is fetched but never compiled in. Each carries its URL order,
  refresh cadence and risk note in English and Chinese.
- `tools/fetch.js` — downloads the catalogue with per-source retries and mirrors, and normalises
  every feed to one hostname per line in `.cache/sources/<id>.txt`.
- `tools/build.js` — the pipeline: compile the blocking feeds, then apply the exclusion, guard,
  whitelist, never-whitelist and exception layers, then emit the list and `dist/build.log`.
- `tools/audit.js` — nine sections (syntax, hygiene, must-block, must-stay-reachable, shared
  apexes, dual-use, whitelist effect, never-whitelist protection, inert whitelist entries) plus an
  attribution gate that fails when a feed is compiled in but not listed in
  `THIRD-PARTY-NOTICES.md`; writes `dist/audit.log` and exits non-zero on any failure.
- `tools/coverage-gap.js` — explains every peer rule this list does not carry, buckets each one as
  intended or as a bug, and reconciles the derived rule set against the published file; exits
  non-zero on a defect.
- `tools/benchmark.js` — measures coverage and over-blocking against the four peers and the
  AdGuard exception ruler; writes `dist/benchmark.txt`.
- `tools/ci-regression.js` — compares a new build against the previously published one and fails on
  an implausible swing in rule count, exception count or file size.
- `tools/write-stats.js` — writes `dist/stats.json` (counts, size, feed count, SHA-256) from the
  published file, so CI, the commit message and the regression check agree on the numbers.
- `tools/gen-sources-doc.js` — generates `SOURCES.md` and `SOURCES.zh-CN.md` from the catalogue.
- `tools/agh-live-check.js`, `tools/agh-toggle.js`, `tools/dns-probe.js`, `tools/serve-dist.js`,
  `tools/cleanup-live-check.js` — the live-verification kit: serve `dist/` over HTTP, drive an
  AdGuard Home over its API, query it for real, then clean up. Not part of a normal build.
- `tools/whitelist-impact.js` — given an allowlist file, reports how many blocked hostnames it
  releases and which registrable domains lose their protection. Takes any whitelist-shaped file and
  any list, so it works against a foreign allowlist before you install it.
- `tools/referral-gaps.js` — writes `REFERRAL-GAPS.md`, the annotated version of the same question
  for HaGeZi's Allowlist Referral specifically; `--check` verifies the document is current.
- `tools/github-metadata.js` — the About box, which GitHub stores rather than the repository does:
  description, homepage, topics, and the wiki/discussions switches. Dry run by default; the only tool
  here that touches repository settings and therefore the only one CI does not run.
- `data/whitelist.txt` — the private whitelist, 69 exact and 286 whole-tree entries in the
  reference build.
- `data/never-whitelist.txt` — the protection set, 93 domains that no whitelist may release.
- `data/guards.txt` — 135 shared-infrastructure apexes; the apex is released, its subdomains are
  not.
- `data/private-exclusions.txt` — 13 project-level exclusions (reserved names such as `localhost`,
  `invalid`, `onion` and the reverse-DNS zones) applied before the whitelist stage.
- `data/extra-block.txt` — the curated patch file, 3 rules.
- `dist/dns-shield.txt` — the published product: 537,260 block rules, 28 exception rules, 11.77 MiB.
- `CONTRIBUTING.md` — how to report a false positive (the most useful report there is) and which
  `data/` file a given host belongs in.
- `SECURITY.md` — what counts as a security problem in a data-only project, and how to report one
  privately.
- `CHANGELOG.md` — changes to the toolchain, the policy files and the documentation. The daily
  product is not changelogged: `! List revision:` inside the list identifies it.
- `THIRD-PARTY-NOTICES.md` — who owns each feed, what it is licensed under, and the one feed whose
  licence forbids commercial use. `tools/audit.js` fails the build if a feed is missing from it.
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1.
- `.github/ISSUE_TEMPLATE/` — the false-positive and missed-block forms. They ask for four things,
  because a report missing any of them cannot be acted on.
- `.github/workflows/build.yml` — the daily build. It runs the same gate locally as it does here:
  `npm run verify` runs again on any push that could change a verdict.
- `REFERRAL-GAPS.md` — generated: what an allowlist filter would release from the published file.
- `dist/build.log`, `dist/audit.log`, `dist/benchmark.txt`, `dist/stats.json` — logs and summary
  from the reference build.
- `dist/.compiled.raw` — the compiler's intermediate output, reused by `--no-compile`.
- `.cache/sources/` — the 27 cached feeds, one hostname per line; all network input lands here and
  nothing else does.

### Where to read what

| Question | Document |
| --- | --- |
| How do I install it, and how do I check it? | this file |
| How is it built, layer by layer? | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Which feeds, and what is risky about each? | [`SOURCES.md`](SOURCES.md) (Chinese: [`SOURCES.zh-CN.md`](SOURCES.zh-CN.md)) |
| What would an allowlist filter release from it? | [`REFERRAL-GAPS.md`](REFERRAL-GAPS.md) |
| How does it compare with the popular lists? | [`dist/benchmark.txt`](dist/benchmark.txt) |
| A hostname broke — where does the fix go? | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| What counts as a security problem here? | [`SECURITY.md`](SECURITY.md) |
| Who owns the feeds, and under what licence? | [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) |
| What changed in the toolchain? | [`CHANGELOG.md`](CHANGELOG.md) |
| How are contributors expected to behave? | [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) |

## Building it yourself

Requirements: Node.js 20 or newer (`package.json`). The reference build ran on Node v24.21.0
(`dist/build.log`).

```bash
npm install
node tools/fetch.js          # cold run: about 10 minutes - 26 sources, retries and mirrors
node tools/build.js          # about 30 seconds from cache (reference: 31.6s, of which 19.0s compiling)
node tools/audit.js          # must end with "failures 0"
node tools/coverage-gap.js   # must reconcile the derived set against the published file
node tools/benchmark.js      # refreshes dist/benchmark.txt; needs network access to the peers
node tools/write-stats.js    # refreshes dist/stats.json from the list that was just built
node tools/referral-gaps.js  # refreshes REFERRAL-GAPS.md; --check verifies instead of writing
```

`npm run pipeline` runs fetch, build, audit, coverage-gap, benchmark, the source documentation,
stats and the referral report in sequence. `tools/fetch.js` only understands `--force` — its default
behaviour is already to
reuse any cached feed body larger than 20 bytes, so there is no `--missing` to pass.
`node tools/build.js --no-compile` reuses `dist/.compiled.raw`; `node tools/build.js --out <path>`
writes the list somewhere else.

The published file is byte-reproducible. Two head lines make that verifiable rather than aspirational.
`! List revision:` is a digest over every feed body the build consumed, so two machines holding the
same feeds publish the same revision and `dist/stats.json`'s `sha256` can be checked against a file
you downloaded. `! Last modified:` is not a wall clock either: it is the newest `Last-Modified` any
upstream actually declares (16 of 27 feeds send one). Feeds whose server omits the header contribute
no date - their changes show up in the revision line instead, so the list never claims a day its
sources did not. Set `SOURCE_DATE_EPOCH`, or pass `node tools/build.js --stamp <iso|epoch>`, to pin
the timestamp to a fixed instant instead.

The cold/warm difference is entirely in the fetch stage. A cached build never touches the network:
`tools/build.js` points `hostlist-compiler` at the cached files, so a feed the upstream stopped
serving is reported rather than crashing the run. How loud that report is depends on the feed: if it
is one the list is built from, the build refuses to publish, because a narrower list under the same
name is worse than yesterday's file. The two abuse.ch URLhaus feeds are marked `optional: true`,
since a missing feed makes a list narrower but never wrong, and a flaky upstream would otherwise put
a red X on a repository whose published list is fine. Run `tools/fetch.js` first whenever the cache
is empty or stale.

### Checking it against a live resolver

The static checks compare rule text against rule text. `tools/agh-live-check.js` goes further and
asks a running AdGuard Home whether it actually filters the hostnames a browser would ask for. It
expects a throwaway instance on `127.0.0.1:13000` (DNS on `15353`) and the list served locally by
`tools/serve-dist.js` on port 8123; `ARCHITECTURE.md` ("Live verification") has the full recipe.
Point it at any instance with `AGH_BASE` and `AGH_USER`, and export that instance's password as
`AGH_PASS`. The two AdGuard-facing tools have **no default password on purpose**: this repository is
public, and a credential committed here stays readable to anyone even after a later commit deletes
the line, so they exit with instructions instead of trying one of their own.
`node tools/cleanup-live-check.js` removes the scratch files afterwards.

Three machine-specific knobs are worth knowing about:

- `tools/build.js` resolves `@adguard/hostlist-compiler` from a global npm path by default. After
  `npm install`, point it at the local copy instead — PowerShell:
  `$env:HOSTLIST_COMPILER="$PWD\node_modules\@adguard\hostlist-compiler\src\index.js"`, or cmd:
  `set HOSTLIST_COMPILER=%CD%\node_modules\@adguard\hostlist-compiler\src\index.js`.
- `DNS_SHIELD_HOMEPAGE`, `DNS_SHIELD_NAME` and `DNS_SHIELD_VERSION` are written into the header of
  the emitted file. The fallback homepage is `https://github.com/LucentDNS/dns-shield`; set
  `DNS_SHIELD_HOMEPAGE` to your real repository URL before publishing, so the header tells
  subscribers where the list actually lives.
- `tools/fetch.js` and `tools/benchmark.js` prefer the local resolvers `127.0.0.1` and
  `192.168.3.1` before falling back to the system resolver. If your network differs, edit the
  `DNS_SERVERS` constant in those two files.

## Verified environment

The list has been verified end to end in exactly one environment: a Windows machine running AdGuard
Home (web interface at 127.0.0.1:3000, DNS on port 53), Node v24.21.0, reference build and benchmark
dated 2026-10-07. On 2026-10-07 the published list was also loaded into an isolated AdGuard Home
v0.107.79 and queried for real: 21 of 25 probe hostnames were filtered at DNS level, and AdGuard's
own rule attribution named the expected rule for each one. The four that resolved are the intended
allows (`github.io` guard, `www.qq.com` and `raw.githubusercontent.com` whitelist, `sentry.io` absent
from every feed).

It has **not** been tested on hardware it was not tested on: no router, no phone, no Pi-hole or
dnsmasq deployment is part of the verification. What is verified for those platforms is only the
syntax — the audit proves every rule is `||domain^` or `@@||domain^`, with no literal-IP rules, no
wildcards, no modifiers and pure ASCII, which is what makes the hosts conversion in the quick start
a mechanical step rather than a bet.

### What a real deployment taught us

The list was then put into service as the only enabled blocklist on that machine, with the five
previous blocklists disabled. The same 25 hostnames were probed again against the live resolver, and
one behaved differently from the isolated test: `app.adjust.com` resolved instead of being blocked.
AdGuard Home's `check_host` gave the reason in one line —

```
reason=NotFilteredWhiteList   rule=@@||app.adjust.com^
```

— naming an exception that is **not in the published file** (`grep -F '@@||app.adjust.com^'` finds
nothing there; the build log shows the opposite, `refused 12 upstream exception(s) covered by the
never-whitelist`). The rule came from an installed **whitelist filter**, HaGeZi's Allowlist Referral,
which keeps affiliate and referral links redirecting. That filter is a separate switch: disabling
every blocklist does not disable it, and it releases 272 hostnames from this list.

With it off, the probe is 22 of 25 filtered, and the three that resolve are intended. The lesson is
worth more than the fix: on a resolver, *the blocklist is not the whole story* — audit your
allowlists with `tools/whitelist-impact.js` before you conclude the list is not working.

## Licence

GPL-3.0 — declared in `package.json`, in the header of `dist/dns-shield.txt`, and included in full
as `LICENSE` at the repository root. Each upstream feed keeps its own licence and is credited in
`tools/sources.js`.
