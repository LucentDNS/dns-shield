# Architecture

How `dist/dns-shield.txt` is produced, why each stage exists, and what stops a mistake from
reaching subscribers.

## The problem this design solves

A DNS blocklist is a set of rules assembled from sources that do not agree with each other. Three
failures are common and none of them announce themselves:

1. **Silent over-blocking.** A whitelist entry added for one broken site releases an entire subtree,
   and the tracking endpoints inside that subtree quietly start resolving again.
2. **Silent under-blocking.** A feed stops being fetched, or applies the wrong exclusion, and the
   list shrinks by a percentage nobody notices.
3. **Unaccountable rules.** A rule appears in the published file that no input justifies. It cannot
   be reviewed, so it cannot be trusted.

The pipeline is built around making all three visible. Every rule in the output can be traced to a
feed or to a named policy file, and every policy decision is a named stage with a logged count.

## Directory layout

```
data/
  whitelist.txt            our own allow entries (`host` exact, `@tree` whole subtree)
  never-whitelist.txt      protection set: domains no whitelist and no upstream exception may release
  guards.txt              shared-infrastructure apexes released while their subdomains stay blocked
  private-exclusions.txt  domains never worth blocking (RFC 2606 names, mDNS, reverse DNS)
  extra-block.txt         curated patch rules - the only hand-written rules, hard-capped at 25
tools/
  sources.js              the feed catalogue (single source of truth for every input)
  fetch.js                downloads and normalises every feed into .cache/sources/
  build.js                the pipeline (stages 1-7 below)
  audit.js                policy assertions against the published file
  benchmark.js            coverage and false-positive comparison against four peer lists
  coverage-gap.js         explains every peer rule we do not carry
  ci-regression.js        compares today's list against the last published one
  write-stats.js          emits dist/stats.json
  gen-sources-doc.js      regenerates SOURCES.md and SOURCES.zh-CN.md from the catalogue
dist/
  dns-shield.txt          the product (committed, this is the subscription target)
  stats.json              counts and digest (committed)
  benchmark.txt           the latest comparison report (committed)
  .compiled.raw           raw hostlist-compiler output (not committed)
```

## Pipeline stages

`tools/build.js` runs the stages below in order. Later stages win. Every stage logs what it changed,
and the log is written to `dist/build.log` even when the build throws.

### 1. Sources
Reads `tools/sources.js`, checks each cached feed exists and is non-empty, and reports any that are
missing. A missing feed is classified by whether the list's correctness rests on it:

- **Required** (everything without `optional: true`): the build refuses outright. Publishing a
  narrower list under the same name while the build reports success is the one failure mode that
  produces something valid-looking and quietly worse.
- **Optional** (`optional: true` - currently the two abuse.ch URLhaus feeds): the build continues and
  says `NOTE ... the list stays valid, just narrower`. A missing feed makes a list narrower, never
  wrong, and abuse.ch answers 503s and timeouts often enough (measured: two of three forced refetches)
  that failing over it would put a red X on a repository whose published list is fine.

The distinction is visible to the maintainer and invisible to the subscriber: the workflow step that
reports feed availability runs *after* Publish, so a missing feed never keeps the previous list live,
and only a `MISSING SOURCES:` line - which cannot happen, because the build already refused - fails
the run. An optional feed that is down produces an `::notice::`, not an error.

### Attribution (a gate, not a stage)

Every feed in the catalogue is also a third party's work with its own licence, and the published file
redistributes it. `THIRD-PARTY-NOTICES.md` is the record: feed id, upstream project, licence, and a
pointer to where that licence is stated. `tools/audit.js` fails when a catalogue entry has no row
there.

The gate is about presence, not correctness - it cannot tell you a licence was read properly, only
that nobody added a feed and forgot to attribute it. That is the failure this project is actually
exposed to: feeds get added in a hurry while someone is looking at coverage numbers.

Two consequences the build now carries:

- The published header no longer leaves `! License: GPL-3.0` to be read as a claim about upstream
  rules. It says the GPL covers the compilation, and points at the notices file for the rest.
- One feed, `phishing-army`, is licensed CC BY-NC 4.0, which forbids commercial use. That is recorded
  as a limitation rather than smoothed over, and removing it is a one-entry edit to
  `tools/sources.js`. The tradeoff is deliberate: it is a large phishing feed, and a deployer who is
  not selling anything loses nothing by keeping it.

### 2. Compile blocking rules
Feeds are handed to `@adguard/hostlist-compiler` as *local file* sources, one per feed. This is the
compiler's only job: normalise mixed hostname/hosts/URL/adblock shapes into a deduplicated set of
`||domain^` rules. It never touches the network during a build, so a build is reproducible from
cache and one flaky feed cannot abort the run.

Exceptions are deliberately **not** fed to the compiler. The compiler applies top-level inclusions
to every source with no per-source opt-out, so the only inclusion shape that admits `@@||domain^`
rules also deletes every block rule (verified by bisection: exception count 0, block list empty of
exceptions). Policy is therefore applied in this file as plain set arithmetic, where the order is
explicit.

The compiler's `Compress` transformation folds a child rule away when its parent is already
blocked. That is harmless at the DNS layer - a query for `child.example.com` never leaves the
client once `example.com` is blocked - and it is the reason a peer list can contain rules that are
absent from `.compiled.raw` yet fully covered. `tools/coverage-gap.js` classifies these as
`coveredByAncestor` rather than as losses.

### 3. Upstream exclusions
Removes the exact hostnames in AdGuard's `Filters/exclusions.txt` (545 domains) plus
`data/private-exclusions.txt`. These are domains upstream withdrew after real breakage reports.
Exclusions are **exact**: removing `example.com` does not remove `a.example.com`.

### 4. Infrastructure guards
`data/guards.txt` holds 135 shared apexes (`github.io`, `vercel.app`, `blogspot.com`,
`amazonaws.com`, …). The bare apex is released so the platform is usable; every subdomain stays
blocked, which is the point of a guard - `github.io` resolves, `tracker.github.io` does not.

### 5. Whitelists
`data/whitelist.txt` supports two shapes with different semantics:

| Shape | Meaning |
| --- | --- |
| `example.com` | release that hostname only; subdomains stay blocked |
| `@example.com` | release the whole subtree |

An exact entry naming a protected domain is **refused outright** and logged. A whole-tree entry is
allowed even when protected domains live underneath it, because the protected domains are then held
back by stage 5b. This is what lets a broad whitelist (`@baidu.com`) coexist with a precise
protection set (`hm.baidu.com`).

### 5b. Never-whitelist priority
`data/never-whitelist.txt` is the protection set. Two mechanisms apply:

- A protected domain that the feeds carry is re-asserted after every release decision above.
- A protected host whose *ancestor* was released by a whole-tree whitelist entry is added back
  explicitly. This is the only path by which the never-whitelist contributes a rule that no feed
  carries, and it is logged line by line.

Both loops walk every ancestor up to and including the registrable root. An earlier version started
at the second label and stopped before the end, which silently failed to restore two-label roots
such as `doubleclick.net` and `mmstat.com`.

### 5c. Curated patch rules
`data/extra-block.txt` is the only hand-written rule layer. It exists for canonical ad or telemetry
hosts whose registrable parent is blocked (so the host is already unreachable) but which should stay
blocked individually, so that a future exception for the parent cannot silently release the
tracker. The file is hard-capped: the build warns when it exceeds 25 entries, because a rule no feed
justifies is a rule upstream cannot correct.

### 6. Upstream exceptions
AdGuard's `Filters/exceptions.txt` carries 172 `@@||domain^` rules, each with a user bug report
behind it. They are imported because they are exactly the artefact this project cannot yet produce
itself. Three filters apply before an exception is emitted:

- An exception naming a protected domain is refused.
- An exception covered by the protection set (that is, a protected domain lives under the name it
  would release) is refused. Twelve entries were refused for this reason in the current build, all
  of them ad-network subtrees such as `pagead.l.doubleclick.net` and `app.adjust.com`.
- An exception that names a domain no feed blocks is inert, and is counted but not emitted.

### 6b. Whole-tree exceptions
When an upstream exception names a host whose immediate parent is also blocked, releasing only the
exact host leaves the application broken on the next subdomain it touches. The immediate parent is
therefore released too - but only when it is not a guard and no protected domain lives underneath
it. The test is containment, not equality: checking `never.has(parent)` alone missed the case that
matters, an exception for `log.mmstat.com` releasing `mmstat.com` and handing back the protected
host as a side effect.

### 7. Emit
Sorts both sections, asserts no domain appears in both, writes the file, and refuses to continue if
the assertion fails.

## Verification

Nothing is published without passing these. `npm run verify` runs them locally.

| Check | Question it answers | Fails when |
| --- | --- | --- |
| `tools/audit.js` | Is the policy layer doing what it claims? | a must-block domain is released or absent, a must-allow domain is blocked, a whitelist entry has no effect, a protected host leaks into the allow section |
| `tools/coverage-gap.js` | Why is a peer rule not in our list? | a peer rule has no release-path explanation, or the derived emitted set does not match the published file exactly |
| `tools/ci-regression.js` | Is today's list sane relative to yesterday's? | coverage collapses, the file grows beyond budget, or the allow section runs away |
| `tools/benchmark.js` | How do we compare to the four peers? | a peer list cannot be parsed (a parser regression, not a data problem) |

`coverage-gap.js` is worth understanding because of how it is built. It does **not** re-implement
the pipeline. It derives the emitted rule set from the build's own artifacts by inversion - compiled
set, minus every release path, plus the curated patch, minus the allow section - and then reconciles
that against the published file in both directions. Anything the model fails to account for shows
up as a defect instead of being absorbed by a bucket. An earlier version re-implemented the stages
and produced counts that contradicted the build log; the inverted shape exists specifically to make
that failure impossible.

## Live verification

The four checks above are static: they compare rule text against rule text. They cannot tell you
whether a resolver actually applies the list, and they cannot tell you whether a `||host^` rule
matches the host a browser really queries. `tools/agh-live-check.js` answers both questions against
a running AdGuard Home.

It is run against a **throwaway instance**, never the resolver the machine depends on:

```
AdGuardHome.exe -c <tmp>/AdGuardHome.yaml -w <tmp> --no-check-update --no-permcheck
```

with `http.address: 127.0.0.1:13000` and `dns.port: 15353` so nothing collides with the real
service. The list is served over `http://127.0.0.1:8123/` by `tools/serve-dist.js` (AdGuard Home
wants a URL, not a path), added through the API, and then each probe name is checked twice - once
against AdGuard's own `GET /control/filtering/check_host`, which names the exact rule that fired,
and once by sending a real DNS query to port 15353 and seeing what comes back.

One trap is worth recording: AdGuard Home starts downloading a newly added list in the background,
and its rule index is not rebuilt for a list that is still downloading. A check run immediately
after `add_url` reports `NotFilteredNotFound` for every name while `rules_count` already reads
517,026 - the list looks broken when it is only not yet indexed. Restarting the instance fixes it,
which is why the check waits for a non-zero, stable `rules_count` and the recorded run was taken
after a restart.

Both AdGuard-facing tools take their credential from `AGH_PASS` and have no fallback value. A
default password in a public repository is a leak that survives the commit which removes it, so the
tools print how to export the variable and exit instead.

The result of the recorded run (2026-10-07, AdGuard Home v0.107.79, list `517,007` block rules):
21 of 25 probe names filtered at DNS level, and AdGuard's own rule attribution agreed with the
curve for every one of them. The four that resolved are the intended allows - `github.io` (guard),
`www.qq.com` and `raw.githubusercontent.com` (whitelist) and `sentry.io` (not in any feed). The six
`never-whitelist` hosts and the three curated patch rules were each confirmed to fire by name, which
matters because those are the rules the whitelist layer is most likely to regress.

`tools/agh-toggle.js` is the companion: `show` and `check` against any instance, `snapshot` and
`restore` to make an invasive check reversible, and `others off` for instances that accept the
`set_url` payload. The local v0.107.79 does not, which is exactly why the isolated instance exists
rather than a flag flip on the live service.

### Allowlist filters beat blocklists

The isolated-instance run was clean: every one of the 25 probes behaved as designed. Putting the same
list into service on the real resolver produced one deviation - `app.adjust.com` resolved instead of
being blocked - and the cause was not in this repository at all.

AdGuard Home resolves a query against blocklists and allowlists, and an allowlist match wins. The
rule that fired was `@@||app.adjust.com^`, and `grep -F` finds no such line in `dist/dns-shield.txt`;
the build log says the opposite, `refused 12 upstream exception(s) covered by the never-whitelist`,
with `app.adjust.com` named among them. The rule came from the installed allowlist filter HaGeZi's
Allowlist Referral, whose stated purpose is keeping affiliate and referral links redirecting.

The architectural consequence is the part worth keeping: **allowlist filters are a separate switch
from blocklists.** Disabling every blocklist does not disable an allowlist, so a list can be
perfectly correct and still be silently overridden by an allowlist the operator forgot about. On the
recorded instance that filter released 272 hostnames across 249 registrable domains, including
`adjust.com`, `appsflyer.com`, `a9.com`, `ad.doubleclick.net`, `adform.net` and
`amazon-adsystem.com`.

That is why the repository now ships `tools/whitelist-impact.js` (generic: any allowlist file, any
list) and `tools/referral-gaps.js` (specific: writes the annotated `REFERRAL-GAPS.md`, with `--check`
in `npm run verify`). Either one answers "what does this allowlist cost me?" before the cost is
discovered as a support question. After the filter was disabled the probe was 22 of 25 filtered,
with the three remaining resolutions all intended.

## Reproducible output

A published list is a file people subscribe to, so its bytes are treated as an artifact rather than
prose. `! Last modified:` used to be `new Date().toISOString()`, which made two builds of identical
inputs differ and left the `sha256` in `dist/stats.json` uncomparable with anything.

`tools/fetch.js` now records provenance for every feed in `.cache/sources/.meta.json`: the sha256 of
the normalised body, the upstream `Last-Modified` when the server sends one, and the ETag. From that
`tools/build.js` derives two header lines:

- `! List revision: <12 hex>` — `sha256` over `id:digest` for every present feed. This is the true
  identity of the published artifact: two machines holding the same feed bodies compute the same
  revision, and `dist/stats.json`'s `sha256` can be checked against a downloaded copy.
- `! Last modified: <iso>` — the newest upstream `Last-Modified` that any feed actually declares.
  Feeds whose server sends none contribute no date at all; their changes surface through the revision
  line instead. An earlier version minted a plausible-looking date for them from their digest, and the
  effect was a published list dated in the future (`2029-03-27`) with no way for a reader to tell which
  lines were real. A list should not state a date its upstreams never claimed.

**File mtimes are deliberately not used.** A fresh CI checkout hands byte-identical files brand-new
mtimes, which made the published file differ from the one built here and turned every scheduled run
into a commit whose only change was its own header. Of the upstreams probed, only `adguardteam.github.io`,
`anti-ad.net`, `easylist.to` and `phishing.army` return a `Last-Modified` (16 of 27 feeds do); GitHub's
raw CDN returns only an ETag, which is why the digest path carries the rest of the feeds.

The applied values are logged on the `stamp` and `revision` lines. `SOURCE_DATE_EPOCH`, or
`--stamp <iso|epoch>`, pins the timestamp when a caller needs a fixed value.

Two rejected alternatives are worth recording, because both look simpler:

- **The wall clock.** Freshest date, but two builds of identical feeds differ, so the `sha256` in
  `dist/stats.json` can never be checked against a downloaded copy - which is the only thing that
  hash is for.
- **The repository's own commit time.** Reproducible, but it can never settle: a commit cannot
  contain its own timestamp, so every publish would change the stamp and invalidate the hash it just
  wrote. Deriving the stamp from the feeds breaks that loop, because the feeds do not change when a
  commit is made.
- **Cache file mtimes.** Reproducible on one machine and stable in CI as long as `actions/cache@v4`
  restores the tree, which is exactly why it was the first attempt - but it is a property of the
  checkout, not of the data, so a cold cache (evicted after 7 days, or a different runner image)
  silently changed the published bytes. The revision line removes that dependency.

`!` comments carry no rules, so moving the stamp never touches the rule set (516,987 block / 19
allow) or the byte count (11,758,131).

## Known limitations

- **Size.** 11.21 MiB and 516,987 rules is roughly twice OISD Big. It suits a home DNS resolver and
  a desktop client; it is a poor fit for a memory-constrained router or a metered mobile
  connection. A lighter variant is an open item.
- **Four aggregate inputs by decision.** OISD Big, HaGeZi's Pro, AdRules DNS List and AdGuard DNS
  filter are included as a coverage layer. They are compiled products, and the project's original
  rule was raw feeds only. The tradeoff is documented in `SOURCES.md`: raw feeds alone left tens of
  thousands of domains uncovered, and the layer this project adds on top is policy and verification,
  not coverage.
- **Verification is one machine.** The list has been exercised on a single Windows host running
  AdGuard Home. Router, Pi-hole and mobile behaviour is reasoned about, not tested.
- **Feedback is thinner than upstream's.** The exception layer imports AdGuard's user-reported fixes,
  because they have years of accumulated breakage reports and this project does not. Issues are open
  on the repository, and `CONTRIBUTING.md` asks for the one report that actually improves a list -
  the host that broke and the rule that fired.

## Adding or changing policy

| Change | File | Then |
| --- | --- | --- |
| Allow a broken site | `data/whitelist.txt` | `npm run verify` |
| Block a host permanently | `data/never-whitelist.txt` | `npm run verify` |
| Release a shared platform apex | `data/guards.txt` | `npm run verify` |
| Add a hand-written rule | `data/extra-block.txt` | `npm run verify` and expect the size warning above 25 entries |
| Add or remove a feed | `tools/sources.js` | `npm run fetch`, then `npm run pipeline` |
