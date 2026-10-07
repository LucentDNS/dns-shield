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
missing. A missing feed does not abort the build - it is reported in the summary and promoted to a
CI failure after publishing, so the previous list stays live.

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

## Known limitations

- **Size.** 11.21 MiB and 517,007 rules is roughly twice OISD Big. It suits a home DNS resolver and
  a desktop client; it is a poor fit for a memory-constrained router or a metered mobile
  connection. A lighter variant is an open item.
- **Four aggregate inputs by decision.** OISD Big, HaGeZi's Pro, AdRules DNS List and AdGuard DNS
  filter are included as a coverage layer. They are compiled products, and the project's original
  rule was raw feeds only. The tradeoff is documented in `SOURCES.md`: raw feeds alone left tens of
  thousands of domains uncovered, and the layer this project adds on top is policy and verification,
  not coverage.
- **Verification is one machine.** The list has been exercised on a single Windows host running
  AdGuard Home. Router, Pi-hole and mobile behaviour is reasoned about, not tested.
- **No feedback channel yet.** The exception layer imports AdGuard's user-reported fixes because
  this project has no issue tracker of its own in the loop.

## Adding or changing policy

| Change | File | Then |
| --- | --- | --- |
| Allow a broken site | `data/whitelist.txt` | `npm run verify` |
| Block a host permanently | `data/never-whitelist.txt` | `npm run verify` |
| Release a shared platform apex | `data/guards.txt` | `npm run verify` |
| Add a hand-written rule | `data/extra-block.txt` | `npm run verify` and expect the size warning above 25 entries |
| Add or remove a feed | `tools/sources.js` | `npm run fetch`, then `npm run pipeline` |
