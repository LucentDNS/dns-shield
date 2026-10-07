/**
 * Source catalogue.
 *
 * The blocking inputs are the independently-published upstream feeds, plus - by explicit decision
 * after measuring them - the four well-maintained compiled lists this project is benchmarked
 * against: AdGuard DNS filter, HaGeZi's Pro, OISD Big and AdRules DNS List. They are the coverage
 * ceiling: each is maintained by a team that tracks regional and vendor-specific sources we do not
 * monitor, so composing from raw feeds alone leaves tens of thousands of domains uncovered. What
 * this project adds on top is the part those lists are weakest at - a protection layer that stops
 * a whitelist from silently re-enabling tracking, infrastructure guards that keep shared CDN
 * apexes from being blocked wholesale, and an audit that fails the build on a regression.
 *
 * The two `mode: 'allow'` / `mode: 'exclude'` entries are AdGuard's hand-written false-positive
 * fixes, imported because they are exactly the artefact this project would otherwise have to
 * rebuild from user reports it does not have yet. They are ALLOW rules, so importing them cannot
 * inflate coverage; it only removes mistakes. Each upstream rule carries the bug report that
 * justified it, which is why they are worth more than anything we could write ourselves today.
 *
 * `urls` is ordered: earlier entries are primary, later ones are mirrors tried only when the
 * primary fails. `refresh` and `risk` feed SOURCES.md.
 */
/**
 * raw.githubusercontent.com resets multi-hundred-KB transfers on this line often enough that a
 * bare URL is not usable (observed: 5 of 6 github-hosted sources failed on the first run).
 * These mirrors are tried BEFORE the direct URL; each was reachable from this network while
 * raw.githubusercontent.com was not. jsDelivr is deliberately absent - it reset on every
 * attempt here.
 */
const GH_MIRRORS = [
    (p) => `https://ghproxy.net/https://raw.githubusercontent.com/${p}`,
    (p) => `https://gh-proxy.com/https://raw.githubusercontent.com/${p}`,
    (p) => `https://cdn.statically.io/gh/${p}`,
];
const direct = (p) => `https://raw.githubusercontent.com/${p}`;

/** Mirrors first (they carry the identical blob), canonical URL last as the fallback. */
function gh(repo, file) {
    const p = `${repo}/master/${file}`;
    return [...GH_MIRRORS.map((m) => m(p)), direct(p)];
}

module.exports = [
    // ───────────────────────────────────────────── L0 compiled coverage lists (benchmarked peers)
    // Ordered first so the layering reads "broad coverage, then the precise feeds, then policy".
    {
        id: 'oisd-big',
        name: 'OISD Big',
        urls: ['https://adguardteam.github.io/HostlistsRegistry/assets/filter_27.txt'],
        layer: 'coverage',
        refresh: 'daily',
        risk: 'Aggregated compilation. Widest net of the four; also the one most likely to carry a borderline domain, because it accepts anything with a credible report.',
    },
    {
        id: 'hagezi-pro',
        name: "HaGeZi's Pro Blocklist",
        urls: ['https://adguardteam.github.io/HostlistsRegistry/assets/filter_48.txt'],
        layer: 'coverage',
        refresh: 'daily',
        risk: 'Aggregated compilation. Curated for a balance of ads, tracking and abuse; its "Pro" tier is deliberately not the most aggressive one.',
    },
    {
        id: 'adrules-dns',
        name: 'AdRules DNS List',
        urls: ['https://adguardteam.github.io/HostlistsRegistry/assets/filter_29.txt'],
        layer: 'coverage',
        refresh: 'daily',
        risk: 'Aggregated compilation with strong China coverage. Larger share of Chinese regional rules than the other three.',
    },
    {
        id: 'adguard-dns-filter',
        name: 'AdGuard DNS filter',
        urls: ['https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt'],
        layer: 'coverage',
        refresh: 'daily',
        risk: 'Aggregated compilation maintained by AdGuard. Deliberately conservative - it leaves many ad hosts to its browser extension - so it is the narrowest of the four by design.',
    },

    // ───────────────────────────────────────────── L1 security baseline
    {
        id: 'urlhaus-domains',
        name: 'URLhaus malicious domain feed (abuse.ch)',
        urls: ['https://urlhaus.abuse.ch/downloads/text_online/'],
        layer: 'security',
        refresh: 'realtime',
        risk: 'URLs, not hostnames - must be normalised. Short-lived hosts, so a given domain ages out.',
    },
    {
        id: 'urlhaus-hostfile',
        name: 'URLhaus hosts-format feed (abuse.ch)',
        urls: ['https://urlhaus.abuse.ch/downloads/hostfile/'],
        layer: 'security',
        refresh: 'realtime',
        risk: 'Low. Overlaps the domain feed; kept because the shapes differ and occasionally complement.',
    },
    {
        id: 'phishing-army',
        name: 'Phishing Army extended blocklist',
        urls: ['https://phishing.army/download/phishing_army_blocklist_extended.txt'],
        layer: 'security',
        refresh: 'several times daily',
        risk: 'The extended variant includes apex entries; a handful of borderline legit registrations exist.',
    },
    {
        id: 'openphish',
        name: 'OpenPhish live phishing feed',
        urls: ['https://openphish.com/feed.txt'],
        layer: 'security',
        refresh: 'realtime (delayed free tier)',
        risk: 'Free tier is a ~300-entry delayed sample, not the full feed.',
    },
    {
        id: 'spam404',
        name: 'Spam404 domain blacklist',
        urls: gh('Spam404/lists', 'main-blacklist.txt'),
        layer: 'security',
        refresh: 'weekly',
        risk: 'Low. Stable auction/spam registrations.',
    },
    {
        id: 'scamblocklist',
        name: 'Scam Blocklist by DurableNapkin',
        urls: gh('durablenapkin/scamblocklist', 'hosts.txt'),
        layer: 'security',
        refresh: 'weekly',
        risk: 'Low. Single-topic scam domains.',
    },

    // ───────────────────────────────────────────── L2 general ads and trackers
    {
        id: 'easyprivacy-trackers',
        name: 'EasyPrivacy tracking servers',
        urls: gh('easylist/easylist', 'easyprivacy/easyprivacy_trackingservers.txt'),
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Very low. Only confirmed pure-tracking hosts.',
    },
    {
        id: 'easyprivacy-thirdparty',
        name: 'EasyPrivacy third-party requests',
        urls: gh('easylist/easylist', 'easyprivacy/easyprivacy_thirdparty.txt'),
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Medium. Some entries sit on the analytics/CDN boundary.',
    },
    {
        id: 'adguard-trackers',
        name: 'AdGuard Tracking Protection - third-party tracking networks',
        urls: ['https://adguardteam.github.io/AdguardFilters/SpywareFilter/sections/tracking_servers.txt'],
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Low. Upstream restricts this file to full-domain rules by policy.',
    },
    {
        id: 'adguard-mobile-trackers',
        name: 'AdGuard Tracking Protection - in-app analytics and spyware',
        urls: ['https://adguardteam.github.io/AdguardFilters/SpywareFilter/sections/mobile.txt'],
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Low. Mobile SDK endpoints.',
    },
    {
        id: 'easylist-adservers',
        name: 'EasyList advertising servers',
        urls: gh('easylist/easylist', 'easylist/easylist_adservers.txt'),
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Largest layer source. Occasional upstream misclassification, so it is the first place to look when something breaks.',
    },
    {
        id: 'easylist-thirdparty',
        name: 'EasyList third-party advertising',
        urls: gh('easylist/easylist', 'easylist/easylist_thirdparty.txt'),
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Low.',
    },
    {
        id: 'adguard-adservers',
        name: 'AdGuard Base filter - third-party advertising networks',
        urls: ['https://adguardteam.github.io/AdguardFilters/BaseFilter/sections/adservers.txt'],
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Low. Upstream policy keeps this file to full-domain rules.',
    },
    {
        id: 'adguard-foreign',
        name: 'AdGuard Base filter - language-neutral advertising rules',
        urls: ['https://adguardteam.github.io/AdguardFilters/BaseFilter/sections/foreign.txt'],
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Mixed upstream file; only its domain-level rules survive normalisation, so its yield is small.',
    },
    {
        id: 'adguard-mobile-ads',
        name: 'AdGuard Mobile Ads filter',
        urls: ['https://adguardteam.github.io/AdguardFilters/MobileFilter/sections/adservers.txt'],
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Low.',
    },
    {
        id: 'adguard-cryptominers',
        name: 'AdGuard cryptominer domains',
        urls: ['https://adguardteam.github.io/AdguardFilters/BaseFilter/sections/cryptominers.txt'],
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Low. Small but high value.',
    },
    {
        id: 'peter-lowe',
        name: "Peter Lowe's ad and tracking server list",
        urls: ['https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext'],
        layer: 'ads-trackers',
        refresh: 'monthly',
        risk: 'Low. Long-lived, conservative, updated slowly.',
    },

    // ───────────────────────────────────────────── L3 China-specific telemetry / ad SDK
    {
        id: 'anti-ad',
        name: 'anti-AD domain list',
        urls: ['https://anti-ad.net/domains.txt'],
        layer: 'china-telemetry',
        refresh: 'daily',
        risk: 'HIGHEST in this list. Largest single source (~108k) and coarse-grained; the first suspect when a Chinese app misbehaves.',
    },
    {
        id: 'adguard-chinese-ads',
        name: 'AdGuard Chinese filter - third-party advertising networks',
        urls: ['https://adguardteam.github.io/AdguardFilters/ChineseFilter/sections/adservers.txt'],
        layer: 'china-telemetry',
        refresh: 'weekly',
        risk: 'Low. Small and targeted.',
    },
    {
        id: 'adguard-chinese-firstparty',
        name: 'AdGuard Chinese filter - first-party advertising subdomains',
        urls: ['https://adguardteam.github.io/AdguardFilters/ChineseFilter/sections/adservers_firstparty.txt'],
        layer: 'china-telemetry',
        refresh: 'weekly',
        risk: 'Low. Tiny but precise.',
    },

    // ───────────────────────────────────────────── L4 exceptions (allow rules)
    {
        id: 'adguard-exceptions',
        name: 'AdGuard DNS filter exception rules (GPL-3.0)',
        urls: gh('AdguardTeam/AdGuardSDNSFilter', 'Filters/exceptions.txt'),
        layer: 'exceptions',
        mode: 'allow',
        refresh: 'per issue',
        risk: 'Each rule carries the bug report that justified it. Allow rules only - cannot inflate coverage.',
    },

    // ───────────────────────────────────────────── L5 exclusions (domains to un-block upstream)
    {
        id: 'adguard-exclusions',
        name: 'AdGuard DNS filter exclusion rules (GPL-3.0)',
        urls: gh('AdguardTeam/AdGuardSDNSFilter', 'Filters/exclusions.txt'),
        layer: 'exclusions',
        mode: 'exclude',
        refresh: 'per issue',
        risk: 'Domains AdGuard un-blocked after real breakage reports (banking, retail, consent platforms). Applied as exclusions so our blocking layers cannot re-introduce them.',
    },

    // ───────────────────────────────────────────── Reference only (never compiled)
    {
        id: 'allowlist-referral',
        name: "HaGeZi's Allowlist Referral (reference only)",
        urls: ['https://adguardteam.github.io/HostlistsRegistry/assets/filter_45.txt'],
        layer: 'reference',
        mode: 'allow',
        // Fetched so that REFERRAL-GAPS.md can be regenerated on any machine, but deliberately not
        // compiled: this is an ALLOWLIST that other people install, and the report exists to show
        // what installing it would cost. Counting it as a feed would misdescribe the product.
        required: false,
        refresh: 'weekly',
        risk: 'None to this list - it is never compiled in. It is here because AdGuard Home applies allowlist filters OVER blocklists, so installing it releases 273 of our blocked hostnames (including adjust.com, appsflyer.com and amazon-adsystem.com) no matter which blocklists are enabled. tools/whitelist-impact.js measures it; tools/referral-gaps.js documents it.',
    },
];
