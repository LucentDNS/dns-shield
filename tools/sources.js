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
        riskZh: '聚合清单。四份里收得最宽的一份；也最容易带上边界域名，因为它只要有可信报告就收。',
    },
    {
        id: 'hagezi-pro',
        name: "HaGeZi's Pro Blocklist",
        urls: ['https://adguardteam.github.io/HostlistsRegistry/assets/filter_48.txt'],
        layer: 'coverage',
        refresh: 'daily',
        risk: 'Aggregated compilation. Curated for a balance of ads, tracking and abuse; its "Pro" tier is deliberately not the most aggressive one.',
        riskZh: '聚合清单。在广告、追踪和滥用之间取平衡，其 "Pro" 档刻意不是最激进的那一档。',
    },
    {
        id: 'adrules-dns',
        name: 'AdRules DNS List',
        urls: ['https://adguardteam.github.io/HostlistsRegistry/assets/filter_29.txt'],
        layer: 'coverage',
        refresh: 'daily',
        risk: 'Aggregated compilation with strong China coverage. Larger share of Chinese regional rules than the other three.',
        riskZh: '聚合清单，国内覆盖较好。中文地区规则的占比高于另外三份。',
    },
    {
        id: 'adguard-dns-filter',
        name: 'AdGuard DNS filter',
        urls: ['https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt'],
        layer: 'coverage',
        refresh: 'daily',
        risk: 'Aggregated compilation maintained by AdGuard. Deliberately conservative - it leaves many ad hosts to its browser extension - so it is the narrowest of the four by design.',
        riskZh: '由 AdGuard 维护的聚合清单。刻意保守——把不少广告域名留给自家的浏览器扩展——所以按设计它就是四份里收得最窄的。',
    },

    // ───────────────────────────────────────────── L1 security baseline
    {
        id: 'urlhaus-domains',
        name: 'URLhaus malicious domain feed (abuse.ch)',
        urls: ['https://urlhaus.abuse.ch/downloads/text_online/'],
        layer: 'security',
        refresh: 'realtime',
        // abuse.ch answers 503s and timeouts often enough (measured: two of three forced refetches) that
        // failing the build over it would put a red X on a repository whose published list is fine. A
        // missing feed makes the list narrower, never wrong, so its absence is a NOTE here and a hard
        // error only for sources the list's correctness actually rests on.
        optional: true,
        risk: 'URLs, not hostnames - must be normalised. Short-lived hosts, so a given domain ages out.',
        riskZh: '是完整 URL 而不是主机名——必须先规范化。这类主机寿命很短，某个域名过一阵就会自然消失。',
    },
    {
        id: 'urlhaus-hostfile',
        name: 'URLhaus hosts-format feed (abuse.ch)',
        urls: ['https://urlhaus.abuse.ch/downloads/hostfile/'],
        layer: 'security',
        refresh: 'realtime',
        optional: true,
        risk: 'Low. Overlaps the domain feed; kept because the shapes differ and occasionally complement.',
        riskZh: '低。与域名版 feed 有重叠；保留它是因为格式不同，偶尔还能互补。',
    },
    {
        id: 'phishing-army',
        name: 'Phishing Army extended blocklist',
        urls: ['https://phishing.army/download/phishing_army_blocklist_extended.txt'],
        layer: 'security',
        refresh: 'several times daily',
        risk: 'The extended variant includes apex entries; a handful of borderline legit registrations exist. Its licence is also the odd one out here: Creative Commons BY-NC 4.0, which forbids commercial use. That is a property of the feed, not of this list, but it is why THIRD-PARTY-NOTICES.md marks this row as a limitation rather than a clear grant.',
        riskZh: 'extended 变体包含顶级域名条目；有少量处在合法边界上的注册。它的许可证也与其他源不同：Creative Commons BY-NC 4.0，禁止商业性使用。这是该 feed 自身的属性，不是本列表的，但正因如此 THIRD-PARTY-NOTICES.md 把这一行标为限制而非明确授权。',
    },
    {
        id: 'openphish',
        name: 'OpenPhish live phishing feed',
        urls: ['https://openphish.com/feed.txt'],
        layer: 'security',
        refresh: 'realtime (delayed free tier)',
        risk: 'Free tier is a ~300-entry delayed sample, not the full feed.',
        riskZh: '免费档只是约 300 条、有延迟的样本，不是完整 feed。',
    },
    {
        id: 'spam404',
        name: 'Spam404 domain blacklist',
        urls: gh('Spam404/lists', 'main-blacklist.txt'),
        layer: 'security',
        refresh: 'weekly',
        risk: 'Low. Stable auction/spam registrations.',
        riskZh: '低。稳定的抢注/垃圾注册域名。',
    },
    {
        id: 'scamblocklist',
        name: 'Scam Blocklist by DurableNapkin',
        urls: gh('durablenapkin/scamblocklist', 'hosts.txt'),
        layer: 'security',
        refresh: 'weekly',
        risk: 'Low. Single-topic scam domains.',
        riskZh: '低。只收诈骗类域名，主题单一。',
    },

    // ───────────────────────────────────────────── L2 general ads and trackers
    {
        id: 'easyprivacy-trackers',
        name: 'EasyPrivacy tracking servers',
        urls: gh('easylist/easylist', 'easyprivacy/easyprivacy_trackingservers.txt'),
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Very low. Only confirmed pure-tracking hosts.',
        riskZh: '极低。只收已确认的纯追踪主机。',
    },
    {
        id: 'easyprivacy-thirdparty',
        name: 'EasyPrivacy third-party requests',
        urls: gh('easylist/easylist', 'easyprivacy/easyprivacy_thirdparty.txt'),
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Medium. Some entries sit on the analytics/CDN boundary.',
        riskZh: '中。部分条目处在统计上报与 CDN 的边界上。',
    },
    {
        id: 'adguard-trackers',
        name: 'AdGuard Tracking Protection - third-party tracking networks',
        urls: ['https://adguardteam.github.io/AdguardFilters/SpywareFilter/sections/tracking_servers.txt'],
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Low. Upstream restricts this file to full-domain rules by policy.',
        riskZh: '低。上游按政策把这份文件限制为整域规则。',
    },
    {
        id: 'adguard-mobile-trackers',
        name: 'AdGuard Tracking Protection - in-app analytics and spyware',
        urls: ['https://adguardteam.github.io/AdguardFilters/SpywareFilter/sections/mobile.txt'],
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Low. Mobile SDK endpoints.',
        riskZh: '低。移动 SDK 端点。',
    },
    {
        id: 'easylist-adservers',
        name: 'EasyList advertising servers',
        urls: gh('easylist/easylist', 'easylist/easylist_adservers.txt'),
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Largest layer source. Occasional upstream misclassification, so it is the first place to look when something breaks.',
        riskZh: '本层条目最多的来源。上游偶尔会分错类，所以出问题时这里是第一个该查的地方。',
    },
    {
        id: 'easylist-thirdparty',
        name: 'EasyList third-party advertising',
        urls: gh('easylist/easylist', 'easylist/easylist_thirdparty.txt'),
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Low.',
        riskZh: '低。',
    },
    {
        id: 'adguard-adservers',
        name: 'AdGuard Base filter - third-party advertising networks',
        urls: ['https://adguardteam.github.io/AdguardFilters/BaseFilter/sections/adservers.txt'],
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Low. Upstream policy keeps this file to full-domain rules.',
        riskZh: '低。上游政策把这份文件限制为整域规则。',
    },
    {
        id: 'adguard-foreign',
        name: 'AdGuard Base filter - language-neutral advertising rules',
        urls: ['https://adguardteam.github.io/AdguardFilters/BaseFilter/sections/foreign.txt'],
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Mixed upstream file; only its domain-level rules survive normalisation, so its yield is small.',
        riskZh: '上游的混合文件；规范化之后只有域名级规则能留下，所以产出很少。',
    },
    {
        id: 'adguard-mobile-ads',
        name: 'AdGuard Mobile Ads filter',
        urls: ['https://adguardteam.github.io/AdguardFilters/MobileFilter/sections/adservers.txt'],
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Low.',
        riskZh: '低。',
    },
    {
        id: 'adguard-cryptominers',
        name: 'AdGuard cryptominer domains',
        urls: ['https://adguardteam.github.io/AdguardFilters/BaseFilter/sections/cryptominers.txt'],
        layer: 'ads-trackers',
        refresh: 'weekly',
        risk: 'Low. Small but high value.',
        riskZh: '低。条目很少，但价值高。',
    },
    {
        id: 'peter-lowe',
        name: "Peter Lowe's ad and tracking server list",
        urls: ['https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext'],
        layer: 'ads-trackers',
        refresh: 'monthly',
        risk: 'Low. Long-lived, conservative, updated slowly.',
        riskZh: '低。清单长期存在、改动保守、更新很慢。',
    },

    // ───────────────────────────────────────────── L3 China-specific telemetry / ad SDK
    {
        id: 'anti-ad',
        name: 'anti-AD domain list',
        urls: ['https://anti-ad.net/domains.txt'],
        layer: 'china-telemetry',
        refresh: 'daily',
        risk: 'HIGHEST in this list. Largest single source (~108k) and coarse-grained; the first suspect when a Chinese app misbehaves.',
        riskZh: '本清单中最高。条目最多的单一来源（约 108k），而且颗粒度很粗；国内 App 出问题时，第一个该怀疑的就是它。',
    },
    {
        id: 'adguard-chinese-ads',
        name: 'AdGuard Chinese filter - third-party advertising networks',
        urls: ['https://adguardteam.github.io/AdguardFilters/ChineseFilter/sections/adservers.txt'],
        layer: 'china-telemetry',
        refresh: 'weekly',
        risk: 'Low. Small and targeted.',
        riskZh: '低。条目少，针对性强。',
    },
    {
        id: 'adguard-chinese-firstparty',
        name: 'AdGuard Chinese filter - first-party advertising subdomains',
        urls: ['https://adguardteam.github.io/AdguardFilters/ChineseFilter/sections/adservers_firstparty.txt'],
        layer: 'china-telemetry',
        refresh: 'weekly',
        risk: 'Low. Tiny but precise.',
        riskZh: '低。条目极少，但很精准。',
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
        riskZh: '每条规则都带着当初促成它的 bug 报告。只有放行规则——不可能撑大覆盖面。',
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
        riskZh: 'AdGuard 在收到真实故障报告（银行、零售、同意管理平台）后解除拦截的域名。本项目把它们作为排除项应用，这样拦截层不会再把它们加回来。',
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
        risk: 'None to this list - it is never compiled in. It is here because AdGuard Home applies allowlist filters OVER blocklists, so installing it releases several hundred of our blocked hostnames (adjust.com, appsflyer.com and amazon-adsystem.com among them) no matter which blocklists are enabled. The exact current count is deliberately not written here, because it moves whenever either list changes: REFERRAL-GAPS.md names every released host and tools/whitelist-impact.js measures any allowlist file.',
        riskZh: '对本列表没有风险——它从不参与编译。之所以收录，是因为 AdGuard Home 是用白名单过滤器覆盖黑名单的，所以一旦装上它，不管启用了哪几条黑名单，都会放行本列表拦截的数百个主机名（其中包括 adjust.com、appsflyer.com 和 amazon-adsystem.com）。这里刻意不写死具体条数，因为它会随着两份列表的更新而变化：REFERRAL-GAPS.md 逐一列出被放行的主机，tools/whitelist-impact.js 可以测量任何白名单文件。',
    },
];
