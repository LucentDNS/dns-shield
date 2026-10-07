# Sources

This file is generated from [`tools/sources.js`](tools/sources.js) by [`tools/gen-sources-doc.js`](tools/gen-sources-doc.js). Do not edit it by hand: a feed is
added or changed in the catalogue, and the catalogue is the only authoritative list. The Chinese
edition is [`SOURCES.zh-CN.md`](SOURCES.zh-CN.md).

Layers in the catalogue: **7**. Catalogue entries: **26** - **24 blocking feed entries**
(security, ads and trackers, China telemetry, and the four compiled coverage lists), plus **2 policy entries**
(upstream exclusions and upstream exceptions). The policy entries are not blocking feeds; they are
applied as set arithmetic after the blocking layers are compiled.

Catalogue entries above are the 26 that feed the build. One further entry is fetched but not compiled in
(`allowlist-referral`, 1 entry): it exists only so the referral report can be rebuilt. It is counted
nowhere else and never reaches the published list.

| Layer | Entries | Role |
| --- | --- | --- |
| `security` | 6 | blocking |
| `ads-trackers` | 11 | blocking |
| `china-telemetry` | 3 | blocking |
| `exclusions` | 1 | policy - removes block rules |
| `exceptions` | 1 | policy - adds allow rules |
| `coverage` | 4 | blocking, but compiled aggregates |
| `reference` | 1 | fetched for a report only - never compiled in |

## Source policy

Each blocking feed must be an independently published, single-topic upstream feed: one publisher,
one subject, and a list that publisher maintains for its own purposes. Nothing here is a mixture of
somebody else's feeds presented as an original source, and nothing is assembled by hand to reach a
round number.

The project does not, however, keep only raw feeds. Four pre-compiled aggregate lists are deliberately
included as the `coverage` layer: **OISD Big**, **HaGeZi's Pro Blocklist**, **AdRules DNS List** and
**AdGuard DNS filter**. This was an explicit project decision, and the reasoning is that no single raw
feed covers every region: each of the four aggregates is maintained by a team that tracks regional and
vendor-specific sources this project does not monitor, so composing from raw feeds alone leaves tens of
thousands of domains uncovered.

The tradeoff, stated honestly:

- Coverage goes up, and so does the amount of the list this project did not verify itself. A domain
  blocked because an aggregate carried it is a decision made by that aggregate, not by this project.
- Attribution gets harder. When something breaks, the cause may sit inside an aggregate rather than in
  one of the named raw feeds.
- Provenance is coarser. The same domain is often in several of the four, so the list cannot say which
  upstream first published it.
- The aggregates receive domain-level review upstream, but they are not uniform in what they accept:
  OISD Big accepts anything with a credible report, AdGuard DNS filter is deliberately conservative.

What this project adds on top is the part those lists are weakest at: an allow layer that stops a
whitelist from silently re-enabling tracking, infrastructure guards that keep shared CDN apexes from
being blocked wholesale, and an audit that fails the build on a regression.

## Layers

The three blocking layers come first, then the two policy layers, which are clearly marked as
**not blocking feeds**. The compiled coverage layer is last, because it is the one departure from
the "independent feeds only" rule.

### Security — malware, phishing and scam domains

Feeds whose only topic is abuse: malware distribution, phishing, scam registration. They are short-lived by nature, so the same domain does not stay in the list for long.

Feeds in this layer: 6

| id | Feed name | Upstream URL(s) | Format | Refresh | Purpose | Risk note |
| --- | --- | --- | --- | --- | --- | --- |
| `urlhaus-domains` | URLhaus malicious domain feed (abuse.ch) | urlhaus.abuse.ch/downloads/text_online/ | URLs (online), one per line | realtime | Current malware distribution sites; the fetcher keeps only the hostname. | URLs, not hostnames - must be normalised. Short-lived hosts, so a given domain ages out. |
| `urlhaus-hostfile` | URLhaus hosts-format feed (abuse.ch) | urlhaus.abuse.ch/downloads/hostfile/ | hosts format | realtime | The same abuse.ch data in hosts shape, as a second pass over the same topic. | Low. Overlaps the domain feed; kept because the shapes differ and occasionally complement. |
| `phishing-army` | Phishing Army extended blocklist (144,243 entries) | phishing.army/download/phishing_army_blocklist_extended.txt | bare domains, one per line | several times daily | Large phishing blocklist, extended variant with apex entries included. | The extended variant includes apex entries; a handful of borderline legit registrations exist. |
| `openphish` | OpenPhish live phishing feed (259 entries) | openphish.com/feed.txt | URLs, one per line | realtime (delayed free tier) | Live phishing URLs from the free feed; the fetcher keeps only the hostname. | Free tier is a ~300-entry delayed sample, not the full feed. |
| `spam404` | Spam404 domain blacklist (8,140 entries) | ghproxy.net/https://raw.githubusercontent.com/Spam404/lists/master/main-blacklist.txt<br>gh-proxy.com/https://raw.githubusercontent.com/Spam404/lists/master/main-blacklist.txt<br>cdn.statically.io/gh/Spam404/lists/master/main-blacklist.txt<br>raw.githubusercontent.com/Spam404/lists/master/main-blacklist.txt | hosts / bare domains | weekly | Auction spam and forum spam registrations. | Low. Stable auction/spam registrations. |
| `scamblocklist` | Scam Blocklist by DurableNapkin (2,189 entries) | ghproxy.net/https://raw.githubusercontent.com/durablenapkin/scamblocklist/master/hosts.txt<br>gh-proxy.com/https://raw.githubusercontent.com/durablenapkin/scamblocklist/master/hosts.txt<br>cdn.statically.io/gh/durablenapkin/scamblocklist/master/hosts.txt<br>raw.githubusercontent.com/durablenapkin/scamblocklist/master/hosts.txt | hosts format | weekly | Scam domains, single topic. | Low. Single-topic scam domains. |

Cached: 4/6. Entry counts are line counts of the last fetched copy in .cache/sources/ and change between runs.

Not fetched yet: `urlhaus-domains`, `urlhaus-hostfile` - run `node tools/fetch.js urlhaus-domains`.

Four URLs per GitHub-hosted feed: three mirrors first, then the canonical raw.githubusercontent.com URL as the fallback. `urls` in tools/sources.js is ordered, and the fetcher stops at the first URL that returns a usable body.

### Ads and trackers — general

Advertising servers, tracking networks and analytics endpoints that are not specific to one country. This is the largest part of the list.

Feeds in this layer: 11

| id | Feed name | Upstream URL(s) | Format | Refresh | Purpose | Risk note |
| --- | --- | --- | --- | --- | --- | --- |
| `easyprivacy-trackers` | EasyPrivacy tracking servers (31 entries) | ghproxy.net/https://raw.githubusercontent.com/easylist/easylist/master/easyprivacy/easyprivacy_trackingservers.txt<br>gh-proxy.com/https://raw.githubusercontent.com/easylist/easylist/master/easyprivacy/easyprivacy_trackingservers.txt<br>cdn.statically.io/gh/easylist/easylist/master/easyprivacy/easyprivacy_trackingservers.txt<br>raw.githubusercontent.com/easylist/easylist/master/easyprivacy/easyprivacy_trackingservers.txt | adblock | weekly | Hosts whose only purpose is tracking. | Very low. Only confirmed pure-tracking hosts. |
| `easyprivacy-thirdparty` | EasyPrivacy third-party requests (1,909 entries) | ghproxy.net/https://raw.githubusercontent.com/easylist/easylist/master/easyprivacy/easyprivacy_thirdparty.txt<br>gh-proxy.com/https://raw.githubusercontent.com/easylist/easylist/master/easyprivacy/easyprivacy_thirdparty.txt<br>cdn.statically.io/gh/easylist/easylist/master/easyprivacy/easyprivacy_thirdparty.txt<br>raw.githubusercontent.com/easylist/easylist/master/easyprivacy/easyprivacy_thirdparty.txt | adblock | weekly | Third-party requests seen loading trackers; wider than the pure-tracking file. | Medium. Some entries sit on the analytics/CDN boundary. |
| `adguard-trackers` | AdGuard Tracking Protection - third-party tracking networks (4,214 entries) | adguardteam.github.io/AdguardFilters/SpywareFilter/sections/tracking_servers.txt | adblock | weekly | Third-party tracking networks, upstream limited to full-domain rules. | Low. Upstream restricts this file to full-domain rules by policy. |
| `adguard-mobile-trackers` | AdGuard Tracking Protection - in-app analytics and spyware (1,156 entries) | adguardteam.github.io/AdguardFilters/SpywareFilter/sections/mobile.txt | adblock | weekly | In-app analytics and spyware endpoints of mobile SDKs. | Low. Mobile SDK endpoints. |
| `easylist-adservers` | EasyList advertising servers (45,640 entries) | ghproxy.net/https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_adservers.txt<br>gh-proxy.com/https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_adservers.txt<br>cdn.statically.io/gh/easylist/easylist/master/easylist/easylist_adservers.txt<br>raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_adservers.txt | adblock | weekly | Advertising servers; the largest single source in the ads and trackers layer. | Largest layer source. Occasional upstream misclassification, so it is the first place to look when something breaks. |
| `easylist-thirdparty` | EasyList third-party advertising (1,471 entries) | ghproxy.net/https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_thirdparty.txt<br>gh-proxy.com/https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_thirdparty.txt<br>cdn.statically.io/gh/easylist/easylist/master/easylist/easylist_thirdparty.txt<br>raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_thirdparty.txt | adblock | weekly | Third-party advertising rules. | Low. |
| `adguard-adservers` | AdGuard Base filter - third-party advertising networks (1,203 entries) | adguardteam.github.io/AdguardFilters/BaseFilter/sections/adservers.txt | adblock | weekly | Third-party advertising networks, full-domain rules only. | Low. Upstream policy keeps this file to full-domain rules. |
| `adguard-foreign` | AdGuard Base filter - language-neutral advertising rules (162 entries) | adguardteam.github.io/AdguardFilters/BaseFilter/sections/foreign.txt | adblock, mostly non-domain rules | weekly | Language-neutral advertising rules; normalisation keeps only its domain rules. | Mixed upstream file; only its domain-level rules survive normalisation, so its yield is small. |
| `adguard-mobile-ads` | AdGuard Mobile Ads filter (935 entries) | adguardteam.github.io/AdguardFilters/MobileFilter/sections/adservers.txt | adblock | weekly | Advertising servers reached from mobile apps. | Low. |
| `adguard-cryptominers` | AdGuard cryptominer domains (49 entries) | adguardteam.github.io/AdguardFilters/BaseFilter/sections/cryptominers.txt | adblock | weekly | In-browser cryptomining domains. Small but high value. | Low. Small but high value. |
| `peter-lowe` | Peter Lowe's ad and tracking server list (3,551 entries) | pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext | adblock (hostformat=adblockplus) | monthly | Long-lived ad and tracking servers, updated slowly and conservatively. | Low. Long-lived, conservative, updated slowly. |

Cached: 11/11. Entry counts are line counts of the last fetched copy in .cache/sources/ and change between runs.

Four URLs per GitHub-hosted feed: three mirrors first, then the canonical raw.githubusercontent.com URL as the fallback. `urls` in tools/sources.js is ordered, and the fetcher stops at the first URL that returns a usable body.

Fetched directly: adguardteam.github.io is a reliable CDN, so no mirror is used.

### China-specific telemetry and ad SDKs

Chinese advertising SDKs and telemetry endpoints that the general feeds do not cover, or cover only partially.

Feeds in this layer: 3

| id | Feed name | Upstream URL(s) | Format | Refresh | Purpose | Risk note |
| --- | --- | --- | --- | --- | --- | --- |
| `anti-ad` | anti-AD domain list (108,349 entries) | anti-ad.net/domains.txt | bare domains, one per line | daily | Broad Chinese domain list; the largest single source in the whole catalogue. | HIGHEST in this list. Largest single source (~108k) and coarse-grained; the first suspect when a Chinese app misbehaves. |
| `adguard-chinese-ads` | AdGuard Chinese filter - third-party advertising networks (219 entries) | adguardteam.github.io/AdguardFilters/ChineseFilter/sections/adservers.txt | adblock | weekly | Chinese third-party advertising networks. | Low. Small and targeted. |
| `adguard-chinese-firstparty` | AdGuard Chinese filter - first-party advertising subdomains (15 entries) | adguardteam.github.io/AdguardFilters/ChineseFilter/sections/adservers_firstparty.txt | adblock | weekly | First-party advertising subdomains under Chinese sites. | Low. Tiny but precise. |

Cached: 3/3. Entry counts are line counts of the last fetched copy in .cache/sources/ and change between runs.

Fetched directly: adguardteam.github.io is a reliable CDN, so no mirror is used.

### Policy layer — upstream exclusions (not a blocking feed)

Domains AdGuard un-blocked after real breakage reports. The build subtracts these from the compiled set, so this layer can only remove block rules.

This layer is not a blocking feed. It is imported as policy: it decides what the
blocking layers are allowed to keep, not what they cover.

Feeds in this layer: 1

| id | Feed name | Upstream URL(s) | Format | Refresh | Purpose | Risk note |
| --- | --- | --- | --- | --- | --- | --- |
| `adguard-exclusions` | AdGuard DNS filter exclusion rules (GPL-3.0) (545 entries) (mode: `exclude`) | ghproxy.net/https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/exclusions.txt<br>gh-proxy.com/https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/exclusions.txt<br>cdn.statically.io/gh/AdguardTeam/AdGuardSDNSFilter/master/Filters/exclusions.txt<br>raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/exclusions.txt | bare domains, one per line | per issue | Domains upstream withdrew from blocking; subtracted from the compiled set. | Domains AdGuard un-blocked after real breakage reports (banking, retail, consent platforms). Applied as exclusions so our blocking layers cannot re-introduce them. |

Cached: 1/1. Entry counts are line counts of the last fetched copy in .cache/sources/ and change between runs.

Four URLs per GitHub-hosted feed: three mirrors first, then the canonical raw.githubusercontent.com URL as the fallback. `urls` in tools/sources.js is ordered, and the fetcher stops at the first URL that returns a usable body.

### Policy layer — upstream exceptions (not a blocking feed)

Confirmed false positives, published upstream as @@ allow rules. Emitted as-is into the allow section of the published list.

This layer is not a blocking feed. It is imported as policy: it decides what the
blocking layers are allowed to keep, not what they cover.

Feeds in this layer: 1

| id | Feed name | Upstream URL(s) | Format | Refresh | Purpose | Risk note |
| --- | --- | --- | --- | --- | --- | --- |
| `adguard-exceptions` | AdGuard DNS filter exception rules (GPL-3.0) (172 entries) (mode: `allow`) | ghproxy.net/https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/exceptions.txt<br>gh-proxy.com/https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/exceptions.txt<br>cdn.statically.io/gh/AdguardTeam/AdGuardSDNSFilter/master/Filters/exceptions.txt<br>raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/exceptions.txt | @@&#124;&#124;domain^ allow rules (kept verbatim) | per issue | Confirmed false positives, published upstream with the bug report behind each one. | Each rule carries the bug report that justified it. Allow rules only - cannot inflate coverage. |

Cached: 1/1. Entry counts are line counts of the last fetched copy in .cache/sources/ and change between runs.

Four URLs per GitHub-hosted feed: three mirrors first, then the canonical raw.githubusercontent.com URL as the fallback. `urls` in tools/sources.js is ordered, and the fetcher stops at the first URL that returns a usable body.

### Coverage — four pre-compiled aggregate lists (not a blocking feed)

NOT an independently published single-topic feed. These four lists are aggregates built by teams that track regional and vendor-specific sources this project does not monitor. They are included deliberately; the "Source policy" section explains why and what it costs.

This layer is not a blocking feed either: each entry is an aggregate of many upstream
feeds, not one publisher's own topic list.

Feeds in this layer: 4

| id | Feed name | Upstream URL(s) | Format | Refresh | Purpose | Risk note |
| --- | --- | --- | --- | --- | --- | --- |
| `oisd-big` | OISD Big (240,439 entries) | adguardteam.github.io/HostlistsRegistry/assets/filter_27.txt | hosts / adblock mix, compiled | daily | Coverage ceiling for everything the four compiled peers catch together. | Aggregated compilation. Widest net of the four; also the one most likely to carry a borderline domain, because it accepts anything with a credible report. |
| `hagezi-pro` | HaGeZi's Pro Blocklist (198,605 entries) | adguardteam.github.io/HostlistsRegistry/assets/filter_48.txt | hosts / adblock mix, compiled | daily | Balance of ads, tracking and abuse; deliberately not the most aggressive tier. | Aggregated compilation. Curated for a balance of ads, tracking and abuse; its "Pro" tier is deliberately not the most aggressive one. |
| `adrules-dns` | AdRules DNS List (198,109 entries) | adguardteam.github.io/HostlistsRegistry/assets/filter_29.txt | hosts / adblock mix, compiled | daily | Strong China coverage among the aggregated peers. | Aggregated compilation with strong China coverage. Larger share of Chinese regional rules than the other three. |
| `adguard-dns-filter` | AdGuard DNS filter (178,250 entries) | adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt | adblock, compiled | daily | Conservative aggregate; AdGuard leaves many ad hosts to its browser extension. | Aggregated compilation maintained by AdGuard. Deliberately conservative - it leaves many ad hosts to its browser extension - so it is the narrowest of the four by design. |

Cached: 4/4. Entry counts are line counts of the last fetched copy in .cache/sources/ and change between runs.

Fetched directly: adguardteam.github.io is a reliable CDN, so no mirror is used.

### Reference only — fetched for a report, never compiled in

An ALLOWLIST other people install. AdGuard Home applies allowlist filters over blocklists, so installing it releases hundreds of our blocked hostnames no matter which blocklists are enabled. It is fetched so REFERRAL-GAPS.md can be regenerated anywhere, and is excluded from every count and from the published list.

Feeds in this layer: 1

| id | Feed name | Upstream URL(s) | Format | Refresh | Purpose | Risk note |
| --- | --- | --- | --- | --- | --- | --- |
| `allowlist-referral` | HaGeZi's Allowlist Referral (reference only) (936 entries) (mode: `allow`) | adguardteam.github.io/HostlistsRegistry/assets/filter_45.txt | @@&#124;&#124;domain^ allow rules, wildcards included | weekly | NOT a feed for this project. It is the allowlist other people install, fetched only so REFERRAL-GAPS.md can be regenerated on any machine. It is never compiled in. | None to this list - it is never compiled in. It is here because AdGuard Home applies allowlist filters OVER blocklists, so installing it releases several hundred of our blocked hostnames (adjust.com, appsflyer.com and amazon-adsystem.com among them) no matter which blocklists are enabled. The exact current count is deliberately not written here, because it moves whenever either list changes: REFERRAL-GAPS.md names every released host and tools/whitelist-impact.js measures any allowlist file. |

Cached: 1/1. Entry counts are line counts of the last fetched copy in .cache/sources/ and change between runs.

Fetched directly: adguardteam.github.io is a reliable CDN, so no mirror is used.

## Upstream policy layers

These two feeds are the only exception to the "independent feeds only" rule, and the exception is sound: both are published upstream under GPL-3.0, the same licence this project uses.

Neither one blocks anything: both are imported as policy, to decide what the blocking layers are allowed to keep rather than what they cover.

`adguard-exceptions` is 172 `@@||domain^` allow rules, each one attached to a real false-positive report upstream accepted. An allow rule can only ever remove rules, never add coverage, so importing this feed cannot inflate the list - it can only remove mistakes.

`adguard-exclusions` is 545 domains upstream stopped blocking (banking, retail, consent platforms and other real breakage). This project applies them as exclusions rather than letting the compiler guess, so a blocking layer cannot re-introduce a domain upstream already withdrew.

Put another way: these two inputs can only make the list shorter or more accurate, never bigger. That is exactly why they are worth importing - rebuilding the same knowledge from our own user reports would start from nothing, while upstream already records why each rule exists.

## Upstream URL handling and mirrors

GitHub raw fetches are unreliable on some networks. On the line this project was built on, 5 of the 6
github-hosted sources failed on the first run, so `tools/sources.js` defines mirror fallbacks for every
`raw.githubusercontent.com` source: **ghproxy.net**, **gh-proxy.com** and **cdn.statically.io**.
`urls` is ordered; the mirrors are tried before the direct URL, and the direct URL is the last fallback.

**jsDelivr is deliberately not used**: it reset on every attempt from this network. `adguardteam.github.io`
sources are fetched directly, because that CDN is reliable and does not need a mirror in front of it.

The coverage layer is also what this project is benchmarked against in [`dist/benchmark.txt`](dist/benchmark.txt):
AdGuard DNS filter 178,250 rules, HaGeZi's Pro 198,605 rules, OISD Big 240,439 rules, AdRules DNS List 198,109 rules, AdGuard DNS filter 23 rules, HaGeZi's Pro 2 rules, OISD Big 4 rules, AdRules DNS List 18 rules.

## How to add a feed

1. Edit [`tools/sources.js`](tools/sources.js) and add one entry with `id`, `name`, `urls`, `layer`,
   `refresh` and `risk`. `id` must match the cache file name; `urls` must be ordered, mirrors first.
2. Run `node tools/fetch.js <id>` to download and normalise it into `.cache/sources/<id>.txt`.
3. Run `node tools/build.js` to rebuild the published list.
4. Run `node tools/audit.js` and check for new failures or warnings.
5. Run `node tools/gen-sources-doc.js` so both documents pick up the new feed.

## Notes on this document

The catalogue fields **id**, **name**, **urls**, **layer**, **refresh**, **risk** and **mode** are read
straight from `tools/sources.js`. Two columns are not catalogue fields and are kept editorially in the
generator: **Format** and **Purpose**. The **Risk note** column is the catalogue's own text -
`risk` in this document, `riskZh` in the Chinese one - unmodified. Entry counts are line counts of the
cached copies, not figures published by the upstream projects.
