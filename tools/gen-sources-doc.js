#!/usr/bin/env node
/**
 * Generate SOURCES.md and SOURCES.zh-CN.md from tools/sources.js.
 *
 * Purpose: the source catalogue is the single place where a feed is added or changed. The two
 * documents are derived from it, never edited by hand, so a feed can not be documented in one
 * place and shipped from another. `refresh`, `risk` and `mode` are read straight out of the
 * catalogue; `layer` decides the section a feed appears in.
 *
 * What is read from the repository (nothing is fetched, nothing is invented):
 *   - tools/sources.js          the catalogue: id, name, urls, layer, refresh, risk, mode
 *   - .cache/sources/<id>.txt   the last fetched copy, used for the "Entries" column
 *   - dist/benchmark.txt        peer rule counts, used in the coverage section
 * The format and purpose columns are NOT catalogue fields; they are editorial notes kept in the
 * tables below, because the catalogue describes feeds and these two columns describe how the
 * fetcher consumes them.
 *
 * Section order is deliberate: the three blocking layers (security, ads-trackers,
 * china-telemetry) come first, then the two policy layers, each explicitly marked as not a
 * blocking feed, and the compiled coverage layer is documented last because it is the one
 * departure from the "independent upstream feeds only" rule.
 *
 * Usage:
 *   node tools/gen-sources-doc.js
 *   node tools/gen-sources-doc.js --out-dir <dir>
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.cache', 'sources');
const CATALOGUE = require('./sources.js');

const OUT_EN = path.join(ROOT, 'SOURCES.md');
const OUT_ZH = path.join(ROOT, 'SOURCES.zh-CN.md');

const argOutDir = (() => {
    const i = process.argv.indexOf('--out-dir');
    return i > -1 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : null;
})();

// ─────────────────────────────────────────────────────────────────── layer metadata

/**
 * Ordered block list. The catalogue's own order (coverage first) is not reused here: the
 * deliverable asks for the three blocking layers first and the two policy layers directly after
 * them, with the compiled coverage lists shown last, because they are the one departure from
 * "raw feeds only".
 */
const LAYERS = [
    {
        id: 'security',
        kind: 'feeds',
        en: 'Security — malware, phishing and scam domains',
        zh: '安全层 —— 恶意软件、钓鱼与诈骗域名',
        enNote: 'Feeds whose only topic is abuse: malware distribution, phishing, scam registration. '
            + 'They are short-lived by nature, so the same domain does not stay in the list for long.',
        zhNote: '这一层的 feed 只做一件事：恶意软件分发、钓鱼、诈骗注册。这类域名本身寿命很短，'
            + '所以同一个域名不会长期留在列表里。',
    },
    {
        id: 'ads-trackers',
        kind: 'feeds',
        en: 'Ads and trackers — general',
        zh: '广告与追踪器 —— 通用',
        enNote: 'Advertising servers, tracking networks and analytics endpoints that are not specific '
            + 'to one country. This is the largest part of the list.',
        zhNote: '面向全球的广告服务器、追踪网络和统计上报端点，不针对某一个国家。这一层是整份列表里条目最多的一层。',
    },
    {
        id: 'china-telemetry',
        kind: 'feeds',
        en: 'China-specific telemetry and ad SDKs',
        zh: '中国区遥测与广告 SDK',
        enNote: 'Chinese advertising SDKs and telemetry endpoints that the general feeds do not cover, '
            + 'or cover only partially.',
        zhNote: '国内 App 的广告 SDK 与埋点上报域名，通用 feed 要么不收，要么收得很不完整。',
    },
    {
        id: 'exclusions',
        kind: 'policy',
        en: 'Policy layer — upstream exclusions (not a blocking feed)',
        zh: '策略层 —— 上游排除清单（不参与拦截）',
        enNote: 'Domains AdGuard un-blocked after real breakage reports. The build subtracts these '
            + 'from the compiled set, so this layer can only remove block rules.',
        zhNote: '这些是 AdGuard 在收到真实故障报告后决定不再拦截的域名。构建时从编译结果里减去，'
            + '所以这一层只会删规则，不会加规则。',
    },
    {
        id: 'exceptions',
        kind: 'policy',
        en: 'Policy layer — upstream exceptions (not a blocking feed)',
        zh: '策略层 —— 上游例外清单（不参与拦截）',
        enNote: 'Confirmed false positives, published upstream as @@ allow rules. Emitted as-is into '
            + 'the allow section of the published list.',
        zhNote: '上游确认的误杀域名，以 @@ 放行规则的形式发布。本项目原样输出到列表的放行段。',
    },
    {
        id: 'coverage',
        kind: 'coverage',
        en: 'Coverage — four pre-compiled aggregate lists (not a blocking feed)',
        zh: '覆盖层 —— 四份上游已编译的聚合清单（本身不是独立 feed）',
        enNote: 'NOT an independently published single-topic feed. These four lists are aggregates '
            + 'built by teams that track regional and vendor-specific sources this project does not '
            + 'monitor. They are included deliberately; the "Source policy" section explains why and '
            + 'what it costs.',
        zhNote: '这一层不是独立发布的单主题 feed，而是四个团队各自维护的聚合清单：他们跟踪的地区性、'
            + '厂商专属来源，本项目并不监控。把它们收进来是明确决定，"来源政策"一节说明了原因和代价。',
    },
    {
        id: 'reference',
        kind: 'reference',
        en: 'Reference only — fetched for a report, never compiled in',
        zh: '仅供参照 —— 抓取是为了生成报告，绝不参与编译',
        enNote: 'An ALLOWLIST other people install. AdGuard Home applies allowlist filters over '
            + 'blocklists, so installing it releases hundreds of our blocked hostnames no matter '
            + 'which blocklists are enabled. It is fetched so REFERRAL-GAPS.md can be regenerated '
            + 'anywhere, and is excluded from every count and from the published list.',
        zhNote: '这是别人会去安装的白名单。AdGuard Home 是用白名单覆盖黑名单的，所以一旦装上它，'
            + '不管启用哪几条黑名单，都会有几百条本列表拦截的域名被放行。抓取它只为了让 '
            + 'REFERRAL-GAPS.md 能在任何机器上重新生成；它不参与任何计数，也不会进入发布产物。',
    },
];

const LAYER_EN = {};
const LAYER_ZH = {};
LAYERS.forEach((l) => { LAYER_EN[l.id] = l.en; LAYER_ZH[l.id] = l.zh; });

/** Feeds in catalogue order, grouped by the display order above. */
function feedsOfLayer(id) {
    return CATALOGUE.filter((s) => s.layer === id);
}

// ─────────────────────────────────────────────────────────────────── editorial fields

/**
 * `format` and `purpose` are not catalogue fields. Keys are catalogue ids; both documents get
 * their own text so the Chinese file reads as Chinese rather than as a word-for-word swap.
 * Unknown ids fall back to a generic line and are listed by the script at the end of the run.
 */
const EDITORIAL = {
    'oisd-big': {
        enFormat: 'hosts / adblock mix, compiled',
        enPurpose: 'Coverage ceiling for everything the four compiled peers catch together.',
        zhFormat: 'hosts 与 adblock 混合，已编译',
        zhPurpose: '覆盖上限之一：四份聚合清单加起来能覆盖的部分。',
    },
    'hagezi-pro': {
        enFormat: 'hosts / adblock mix, compiled',
        enPurpose: 'Balance of ads, tracking and abuse; deliberately not the most aggressive tier.',
        zhFormat: 'hosts 与 adblock 混合，已编译',
        zhPurpose: '在广告、追踪和滥用之间取平衡，刻意不选最激进的那一档。',
    },
    'adrules-dns': {
        enFormat: 'hosts / adblock mix, compiled',
        enPurpose: 'Strong China coverage among the aggregated peers.',
        zhFormat: 'hosts 与 adblock 混合，已编译',
        zhPurpose: '四份聚合清单里国内规则占比最高的一份。',
    },
    'adguard-dns-filter': {
        enFormat: 'adblock, compiled',
        enPurpose: 'Conservative aggregate; AdGuard leaves many ad hosts to its browser extension.',
        zhFormat: 'adblock，已编译',
        zhPurpose: '偏保守的聚合清单；AdGuard 把不少广告域名留给浏览器扩展处理。',
    },
    'urlhaus-domains': {
        enFormat: 'URLs (online), one per line',
        enPurpose: 'Current malware distribution sites; the fetcher keeps only the hostname.',
        zhFormat: '完整 URL（text_online），每行一条',
        zhPurpose: '当前活跃的恶意软件分发站点；抓取时只保留主机名。',
    },
    'urlhaus-hostfile': {
        enFormat: 'hosts format',
        enPurpose: 'The same abuse.ch data in hosts shape, as a second pass over the same topic.',
        zhFormat: 'hosts 格式',
        zhPurpose: '同一份 abuse.ch 数据的 hosts 版本，作为同一主题的第二次覆盖。',
    },
    'phishing-army': {
        enFormat: 'bare domains, one per line',
        enPurpose: 'Large phishing blocklist, extended variant with apex entries included.',
        zhFormat: '纯域名，每行一条',
        zhPurpose: '规模较大的钓鱼黑名单，extended 变体包含了顶级域名条目。',
    },
    openphish: {
        enFormat: 'URLs, one per line',
        enPurpose: 'Live phishing URLs from the free feed; the fetcher keeps only the hostname.',
        zhFormat: '完整 URL，每行一条',
        zhPurpose: '免费通道的实时钓鱼 URL；抓取时只保留主机名。',
    },
    spam404: {
        enFormat: 'hosts / bare domains',
        enPurpose: 'Auction spam and forum spam registrations.',
        zhFormat: 'hosts / 纯域名',
        zhPurpose: '域名抢注垃圾与论坛垃圾注册来源。',
    },
    scamblocklist: {
        enFormat: 'hosts format',
        enPurpose: 'Scam domains, single topic.',
        zhFormat: 'hosts 格式',
        zhPurpose: '只收诈骗类域名，主题单一。',
    },
    'easyprivacy-trackers': {
        enFormat: 'adblock',
        enPurpose: 'Hosts whose only purpose is tracking.',
        zhFormat: 'adblock',
        zhPurpose: '只做追踪、没有别的作用的主机。',
    },
    'easyprivacy-thirdparty': {
        enFormat: 'adblock',
        enPurpose: 'Third-party requests seen loading trackers; wider than the pure-tracking file.',
        zhFormat: 'adblock',
        zhPurpose: '加载追踪脚本的第三方请求，范围比纯追踪文件宽。',
    },
    'adguard-trackers': {
        enFormat: 'adblock',
        enPurpose: 'Third-party tracking networks, upstream limited to full-domain rules.',
        zhFormat: 'adblock',
        zhPurpose: '第三方追踪网络；上游按政策只收录整域规则。',
    },
    'adguard-mobile-trackers': {
        enFormat: 'adblock',
        enPurpose: 'In-app analytics and spyware endpoints of mobile SDKs.',
        zhFormat: 'adblock',
        zhPurpose: '移动 SDK 的应用内统计与间谍软件端点。',
    },
    'easylist-adservers': {
        enFormat: 'adblock',
        enPurpose: 'Advertising servers; the largest single source in the ads and trackers layer.',
        zhFormat: 'adblock',
        zhPurpose: '广告服务器；广告与追踪器这一层里条目最多的单一来源。',
    },
    'easylist-thirdparty': {
        enFormat: 'adblock',
        enPurpose: 'Third-party advertising rules.',
        zhFormat: 'adblock',
        zhPurpose: '第三方广告规则。',
    },
    'adguard-adservers': {
        enFormat: 'adblock',
        enPurpose: 'Third-party advertising networks, full-domain rules only.',
        zhFormat: 'adblock',
        zhPurpose: '第三方广告网络，只保留整域规则。',
    },
    'adguard-foreign': {
        enFormat: 'adblock, mostly non-domain rules',
        enPurpose: 'Language-neutral advertising rules; normalisation keeps only its domain rules.',
        zhFormat: 'adblock，大多不是域名规则',
        zhPurpose: '语言无关的广告规则；规范化之后只剩域名级规则，产出很少。',
    },
    'adguard-mobile-ads': {
        enFormat: 'adblock',
        enPurpose: 'Advertising servers reached from mobile apps.',
        zhFormat: 'adblock',
        zhPurpose: '移动端应用访问的广告服务器。',
    },
    'adguard-cryptominers': {
        enFormat: 'adblock',
        enPurpose: 'In-browser cryptomining domains. Small but high value.',
        zhFormat: 'adblock',
        zhPurpose: '网页挖矿域名。条目很少，但价值高。',
    },
    'peter-lowe': {
        enFormat: 'adblock (hostformat=adblockplus)',
        enPurpose: 'Long-lived ad and tracking servers, updated slowly and conservatively.',
        zhFormat: 'adblock（hostformat=adblockplus）',
        zhPurpose: '长期存在的广告与追踪服务器清单，更新慢、改动保守。',
    },
    'anti-ad': {
        enFormat: 'bare domains, one per line',
        enPurpose: 'Broad Chinese domain list; the largest single source in the whole catalogue.',
        zhFormat: '纯域名，每行一条',
        zhPurpose: '覆盖面很宽的国内域名清单，也是整个目录里条目最多的单一来源。',
    },
    'adguard-chinese-ads': {
        enFormat: 'adblock',
        enPurpose: 'Chinese third-party advertising networks.',
        zhFormat: 'adblock',
        zhPurpose: '国内的第三方广告网络。',
    },
    'adguard-chinese-firstparty': {
        enFormat: 'adblock',
        enPurpose: 'First-party advertising subdomains under Chinese sites.',
        zhFormat: 'adblock',
        zhPurpose: '国内站点自身域名下的广告子域。',
    },
    'adguard-exceptions': {
        enFormat: '@@||domain^ allow rules (kept verbatim)',
        enPurpose: 'Confirmed false positives, published upstream with the bug report behind each one.',
        zhFormat: '@@||domain^ 放行规则（原样保留）',
        zhPurpose: '上游确认的误杀域名，每条规则都能追溯到对应的 bug 报告。',
    },
    'adguard-exclusions': {
        enFormat: 'bare domains, one per line',
        enPurpose: 'Domains upstream withdrew from blocking; subtracted from the compiled set.',
        zhFormat: '纯域名，每行一条',
        zhPurpose: '上游主动解除拦截的域名；构建时从编译结果里减掉。',
    },
    'allowlist-referral': {
        enFormat: '@@||domain^ allow rules, wildcards included',
        enPurpose: 'NOT a feed for this project. It is the allowlist other people install, fetched '
            + 'only so REFERRAL-GAPS.md can be regenerated on any machine. It is never compiled in.',
        zhFormat: '@@||domain^ 放行规则，含通配符',
        zhPurpose: '不是本项目的 feed。这是别人会安装的白名单，抓取它只为了让 REFERRAL-GAPS.md '
            + '能在任何机器上重新生成，绝不参与编译。',
    },};

/** How the fetcher has to treat the raw bytes. Anything not listed falls back to a neutral note. */
const FORMAT_NOTE = {
    mirrors: 'Four URLs per GitHub-hosted feed: three mirrors first, then the canonical '
        + 'raw.githubusercontent.com URL as the fallback. `urls` in tools/sources.js is ordered, '
        + 'and the fetcher stops at the first URL that returns a usable body.',
    mirrorsZh: '每个托管在 GitHub 上的 feed 都有四个 URL：先试三个镜像，最后回落到 '
        + 'raw.githubusercontent.com 的原始地址。tools/sources.js 里的 `urls` 是有顺序的，'
        + '抓取器在第一个能返回可用内容的 URL 上就停下。',
    direct: 'Fetched directly: adguardteam.github.io is a reliable CDN, so no mirror is used.',
    directZh: '直接抓取：adguardteam.github.io 这个 CDN 一直可用，所以不套镜像。',
};

// ─────────────────────────────────────────────────────────────────── helpers

function esc(text) {
    // A `|` inside a table cell is a cell boundary even when it sits inside a code span, so the
    // literals the Format column documents (an allow rule is `@@||domain^`) would split the row in
    // four. Escaping them as `\|` is what CommonMark wants and what a renderer consumes, but it is
    // fragile: anything that splits the row on `|` before rendering the markdown - `cut`, a naive
    // awk, the check that verifies this very file - then sees the wrong number of cells. The two
    // adblock pipes are therefore written as the `&#124;` character reference, which renders as `|`
    // and contains no delimiter at all.
    return String(text == null ? '' : text)
        .replace(/@@\|\|([a-z0-9][a-z0-9.-]*)\^/gi, (m, domain) => `@@&#124;&#124;${domain}^`)
        .replace(/\|/g, '\\|')
        .replace(/\r?\n/g, ' ');
}

/** Multi-URL cells use <br> so the table stays one row per feed. */
function urlCell(urls) {
    return urls.map((u) => String(u).replace(/^https?:\/\//, '')).join('<br>');
}

function isMirrored(source) {
    return (source.urls || []).some((u) => u.includes('raw.githubusercontent.com'));
}

function isAdguardHosted(source) {
    return (source.urls || []).some((u) => u.startsWith('https://adguardteam.github.io/'));
}

/** Entry count of the last fetched copy, or null when the feed has never been fetched. */
function cachedCount(id) {
    const p = path.join(CACHE, `${id}.txt`);
    if (!fs.existsSync(p) || fs.statSync(p).size <= 20) return null;
    return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).length;
}

function fmt(n) {
    return n == null ? null : n.toLocaleString('en-US');
}

function editorial(id, which) {
    const e = EDITORIAL[id];
    if (!e) return which.endsWith('Zh') ? '（见 tools/sources.js 中的风险说明）' : '(see risk note)';
    return e[which];
}

/** Rule counts of the four compiled peers, read from the benchmark log. Nothing is assumed. */
function peerCounts() {
    const p = path.join(ROOT, 'dist', 'benchmark.txt');
    if (!fs.existsSync(p)) return null;
    const out = [];
    fs.readFileSync(p, 'utf8').split('\n').forEach((line) => {
        const m = line.match(/^ {2}(AdGuard DNS filter|HaGeZi's Pro|OISD Big|AdRules DNS List)\s+([\d,]+)/);
        if (m) out.push({ name: m[1], rules: m[2] });
    });
    return out.length ? out : null;
}

// ─────────────────────────────────────────────────────────────────── document builder

const counters = {
    blocking: 0, coverage: 0, reference: 0, required: 0, total: 0, unknownIds: [], uncached: [],
};

function collect() {
    CATALOGUE.forEach((s) => {
        if (!EDITORIAL[s.id]) counters.unknownIds.push(s.id);
        if (cachedCount(s.id) == null) counters.uncached.push(s.id);
    });
    counters.total = CATALOGUE.length;
    // `required === false` entries are fetched for a report rather than for the product, so they
    // are excluded from every count a reader would use to judge what the list is made of.
    counters.required = CATALOGUE.filter((s) => s.required !== false).length;
    counters.reference = counters.total - counters.required;
    counters.coverage = feedsOfLayer('coverage').length;
    counters.blocking = counters.required
        - feedsOfLayer('exclusions').length - feedsOfLayer('exceptions').length;
}

/** One markdown table per layer. `lang` is 'en' or 'zh'. */
function layerTable(layer, lang) {
    const feeds = feedsOfLayer(layer.id);
    const zh = lang === 'zh';
    const head = zh
        ? '| id | Feed 名称 | 上游 URL | 格式 | 刷新 | 用途 | 风险说明 |'
        : '| id | Feed name | Upstream URL(s) | Format | Refresh | Purpose | Risk note |';
    const sep = '| --- | --- | --- | --- | --- | --- | --- |';
    const rows = feeds.map((s) => {
        const n = cachedCount(s.id);
        const entries = n == null ? null : fmt(n);
        const name = zh && entries ? `${esc(s.name)}（${entries} 条）` : esc(s.name);
        const nameEn = !zh && entries ? `${esc(s.name)} (${entries} entries)` : name;
        const cells = [
            `\`${s.id}\``,
            nameEn,
            urlCell(s.urls || []),
            esc(editorial(s.id, zh ? 'zhFormat' : 'enFormat')),
            esc(s.refresh),
            esc(editorial(s.id, zh ? 'zhPurpose' : 'enPurpose')),
            esc(zh && s.riskZh ? s.riskZh : s.risk),
        ];
        if (s.mode) {
            cells[1] += zh ? `（mode: \`${s.mode}\`）` : ` (mode: \`${s.mode}\`)`;
        }
        return `| ${cells.join(' | ')} |`;
    });
    return [head, sep, ...rows].join('\n');
}

function layerSection(layer, lang) {
    const zh = lang === 'zh';
    const feeds = feedsOfLayer(layer.id);
    const lines = [];
    lines.push(`### ${zh ? layer.zh : layer.en}`);
    lines.push('');
    lines.push(zh ? layer.zhNote : layer.enNote);
    lines.push('');
    if (layer.kind === 'policy' && !zh) {
        lines.push('This layer is not a blocking feed. It is imported as policy: it decides what the');
        lines.push('blocking layers are allowed to keep, not what they cover.');
        lines.push('');
    }
    if (layer.kind === 'policy' && zh) {
        lines.push('这一层不参与拦截。它是作为策略导入的：决定拦截层可以保留什么，而不是决定覆盖什么。');
        lines.push('');
    }
    if (layer.kind === 'coverage' && !zh) {
        lines.push('This layer is not a blocking feed either: each entry is an aggregate of many upstream');
        lines.push('feeds, not one publisher\'s own topic list.');
        lines.push('');
    }
    if (layer.kind === 'coverage' && zh) {
        lines.push('这一层同样不是独立 feed：每一条都是许多上游 feed 的汇总，而不是某一个发布者自己的单主题清单。');
        lines.push('');
    }
    if (feeds.length === 0) {
        lines.push(zh ? '_目录中此层暂无条目。_' : '_No catalogue entry in this layer._');
        lines.push('');
        return lines;
    }
    lines.push(`${zh ? '本层条目' : 'Feeds in this layer'}: ${feeds.length}`);
    lines.push('');
    lines.push(layerTable(layer, lang));
    lines.push('');
    const cached = feeds.filter((s) => cachedCount(s.id) != null);
    const missing = feeds.filter((s) => cachedCount(s.id) == null);
    lines.push(zh
        ? `已抓取: ${cached.length}/${feeds.length}。条目数是最近一次抓取到 .cache/sources/ 的行数，运行时可能变化。`
        : `Cached: ${cached.length}/${feeds.length}. Entry counts are line counts of the last fetched copy in .cache/sources/ and change between runs.`);
    if (missing.length) {
        lines.push('');
        lines.push(zh
            ? `尚未抓取: ${missing.map((s) => `\`${s.id}\``).join(', ')} - 运行 \`node tools/fetch.js ${missing[0].id}\`。`
            : `Not fetched yet: ${missing.map((s) => `\`${s.id}\``).join(', ')} - run \`node tools/fetch.js ${missing[0].id}\`.`);
    }
    const mirrored = feeds.filter(isMirrored);
    const hosted = feeds.filter(isAdguardHosted);
    if (mirrored.length || hosted.length) lines.push('');
    if (mirrored.length) lines.push(zh ? FORMAT_NOTE.mirrorsZh : FORMAT_NOTE.mirrors);
    if (mirrored.length && hosted.length) lines.push('');
    if (hosted.length) lines.push(zh ? FORMAT_NOTE.directZh : FORMAT_NOTE.direct);
    lines.push('');
    return lines;
}

function policySection(lang) {
    const zh = lang === 'zh';
    const lines = [];
    const feeds = feedsOfLayer('exclusions').concat(feedsOfLayer('exceptions'));
    const exclusions = feedsOfLayer('exclusions');
    const exceptions = feedsOfLayer('exceptions');
    const exCount = exclusions.length ? cachedCount(exclusions[0].id) : null;
    const apCount = exceptions.length ? cachedCount(exceptions[0].id) : null;

    lines.push(zh ? '## 上游策略层' : '## Upstream policy layers');
    lines.push('');
    lines.push(zh
        ? '这两个 feed 是"只收独立 feed"这条规则的唯一例外，而且例外是合理的：它们都是上游用 GPL-3.0 发布的，'
            + '与本项目同一许可证。'
        : 'These two feeds are the only exception to the "independent feeds only" rule, and the exception is '
            + 'sound: both are published upstream under GPL-3.0, the same licence this project uses.');
    lines.push('');
    lines.push(zh
        ? '它们都不参与拦截，只作为策略导入：决定拦截层可以保留什么，而不是决定覆盖什么。'
        : 'Neither one blocks anything: both are imported as policy, to decide what the blocking layers are '
            + 'allowed to keep rather than what they cover.');
    lines.push('');
    if (apCount != null) {
        lines.push(zh
            ? `\`adguard-exceptions\` 是 ${fmt(apCount)} 条 \`@@||domain^\` 放行规则，每一条对应一个上游确认过的`
                + '真实误杀报告。允许规则只能删规则，不能加覆盖：把它们导进来，覆盖面上限一点也不会变，只会减少错误。'
            : `\`adguard-exceptions\` is ${fmt(apCount)} \`@@||domain^\` allow rules, each one attached to a real `
                + 'false-positive report upstream accepted. An allow rule can only ever remove rules, never add '
                + 'coverage, so importing this feed cannot inflate the list - it can only remove mistakes.');
        lines.push('');
    }
    if (exCount != null) {
        lines.push(zh
            ? `\`adguard-exclusions\` 是 ${fmt(exCount)} 个上游主动解除拦截的域名（银行、零售、同意管理平台等真实故障）。`
                + '本项目把它们作为排除项应用，而不是交给编译器去猜，这样拦截层不会把上游已经撤下的域名重新加回来。'
            : `\`adguard-exclusions\` is ${fmt(exCount)} domains upstream stopped blocking (banking, retail, consent `
                + 'platforms and other real breakage). This project applies them as exclusions rather than letting '
                + 'the compiler guess, so a blocking layer cannot re-introduce a domain upstream already withdrew.');
        lines.push('');
    }
    lines.push(zh
        ? '换句话说：这两条输入只会让列表变短或者变准，不会让它变大。这正是它们值得收录的原因 - '
            + '如果本项目自己攒误杀报告，现在还没有这份数据，而上游已经把每条规则的来龙去脉写清楚了。'
        : 'Put another way: these two inputs can only make the list shorter or more accurate, never bigger. That is '
            + 'exactly why they are worth importing - rebuilding the same knowledge from our own user reports would '
            + 'start from nothing, while upstream already records why each rule exists.');
    lines.push('');
    return lines;
}

function buildEn() {
    const L = [];
    const total = counters.total;
    const required = counters.required;
    const blocking = counters.blocking;
    const coverage = counters.coverage;
    const reference = counters.reference;
    const policy = required - blocking;

    L.push('# Sources');
    L.push('');
    L.push('This file is generated from [`tools/sources.js`](tools/sources.js) by '
        + '[`tools/gen-sources-doc.js`](tools/gen-sources-doc.js). Do not edit it by hand: a feed is');
    L.push('added or changed in the catalogue, and the catalogue is the only authoritative list. '
        + 'The Chinese');
    L.push('edition is [`SOURCES.zh-CN.md`](SOURCES.zh-CN.md).');
    L.push('');
    L.push(`Layers in the catalogue: **${LAYERS.length}**. Catalogue entries: **${total}** - the `
        + `**${required} that feed the build**`);
    L.push(`being **${blocking} blocking feed entries** plus **${policy} policy entries**`);
    L.push('(upstream exclusions and upstream exceptions), and **'
        + `${reference} reference-only entry** that is fetched but never compiled in. The policy entries are`);
    L.push('not blocking feeds; they are applied as set arithmetic after the blocking layers are compiled. The');
    L.push('blocking count is twenty single-topic feeds plus the four compiled coverage lists.');
    L.push('');
    L.push(`The reference-only entry (\`allowlist-referral\`) exists only so the referral report can be rebuilt. `
        + 'It is counted');
    L.push('nowhere else and never reaches the published list.');
    L.push('');
    L.push('| Layer | Entries | Role |');
    L.push('| --- | --- | --- |');
    L.push(`| \`security\` | ${feedsOfLayer('security').length} | blocking |`);
    L.push(`| \`ads-trackers\` | ${feedsOfLayer('ads-trackers').length} | blocking |`);
    L.push(`| \`china-telemetry\` | ${feedsOfLayer('china-telemetry').length} | blocking |`);
    L.push(`| \`exclusions\` | ${feedsOfLayer('exclusions').length} | policy - removes block rules |`);
    L.push(`| \`exceptions\` | ${feedsOfLayer('exceptions').length} | policy - adds allow rules |`);
    L.push(`| \`coverage\` | ${coverage} | blocking, but compiled aggregates |`);
    L.push(`| \`reference\` | ${reference} | fetched for a report only - never compiled in |`);
    L.push('');
    L.push('## Source policy');
    L.push('');
    L.push('Each blocking feed must be an independently published, single-topic upstream feed: one '
        + 'publisher,');
    L.push('one subject, and a list that publisher maintains for its own purposes. Nothing here is a '
        + 'mixture of');
    L.push('somebody else\'s feeds presented as an original source, and nothing is assembled by hand to '
        + 'reach a');
    L.push('round number.');
    L.push('');
    L.push('The project does not, however, keep only raw feeds. Four pre-compiled aggregate lists are '
        + 'deliberately');
    L.push('included as the `coverage` layer: **OISD Big**, **HaGeZi\'s Pro Blocklist**, **AdRules DNS '
        + 'List** and');
    L.push('**AdGuard DNS filter**. This was an explicit project decision, and the reasoning is that no '
        + 'single raw');
    L.push('feed covers every region: each of the four aggregates is maintained by a team that tracks '
        + 'regional and');
    L.push('vendor-specific sources this project does not monitor, so composing from raw feeds alone '
        + 'leaves tens of');
    L.push('thousands of domains uncovered.');
    L.push('');
    L.push('The tradeoff, stated honestly:');
    L.push('');
    L.push('- Coverage goes up, and so does the amount of the list this project did not verify itself. A '
        + 'domain');
    L.push('  blocked because an aggregate carried it is a decision made by that aggregate, not by this '
        + 'project.');
    L.push('- Attribution gets harder. When something breaks, the cause may sit inside an aggregate '
        + 'rather than in');
    L.push('  one of the named raw feeds.');
    L.push('- Provenance is coarser. The same domain is often in several of the four, so the list cannot '
        + 'say which');
    L.push('  upstream first published it.');
    L.push('- The aggregates receive domain-level review upstream, but they are not uniform in what they '
        + 'accept:');
    L.push('  OISD Big accepts anything with a credible report, AdGuard DNS filter is deliberately '
        + 'conservative.');
    L.push('');
    L.push('What this project adds on top is the part those lists are weakest at: an allow layer that '
        + 'stops a');
    L.push('whitelist from silently re-enabling tracking, infrastructure guards that keep shared CDN '
        + 'apexes from');
    L.push('being blocked wholesale, and an audit that fails the build on a regression.');
    L.push('');
    L.push('## Layers');
    L.push('');
    L.push('The three blocking layers come first, then the two policy layers, which are clearly '
        + 'marked as');
    L.push('**not blocking feeds**. The compiled coverage layer is last, because it is the one '
        + 'departure from');
    L.push('the "independent feeds only" rule.');
    L.push('');
    LAYERS.forEach((layer) => { L.push(...layerSection(layer, 'en')); });
    L.push(...policySection('en'));

    L.push('## Upstream URL handling and mirrors');
    L.push('');
    L.push('GitHub raw fetches are unreliable on some networks. On the line this project was built on, '
        + '5 of the 6');
    L.push('github-hosted sources failed on the first run, so `tools/sources.js` defines mirror '
        + 'fallbacks for every');
    L.push('`raw.githubusercontent.com` source: **ghproxy.net**, **gh-proxy.com** and '
        + '**cdn.statically.io**.');
    L.push('`urls` is ordered; the mirrors are tried before the direct URL, and the direct URL is the '
        + 'last fallback.');
    L.push('');
    L.push('**jsDelivr is deliberately not used**: it reset on every attempt from this network. '
        + '`adguardteam.github.io`');
    L.push('sources are fetched directly, because that CDN is reliable and does not need a mirror in '
        + 'front of it.');
    L.push('');
    const peers = peerCounts();
    if (peers) {
        L.push('The coverage layer is also what this project is benchmarked against in '
            + '[`dist/benchmark.txt`](dist/benchmark.txt):');
        L.push(peers.map((p) => `${p.name} ${p.rules} rules`).join(', ') + '.');
        L.push('');
    }
    L.push('## How to add a feed');
    L.push('');
    L.push('1. Edit [`tools/sources.js`](tools/sources.js) and add one entry with `id`, `name`, '
        + '`urls`, `layer`,');
    L.push('   `refresh` and `risk`. `id` must match the cache file name; `urls` must be ordered, '
        + 'mirrors first.');
    L.push('2. Run `node tools/fetch.js <id>` to download and normalise it into '
        + '`.cache/sources/<id>.txt`.');
    L.push('3. Run `node tools/build.js` to rebuild the published list.');
    L.push('4. Run `node tools/audit.js` and check for new failures or warnings.');
    L.push('5. Run `node tools/gen-sources-doc.js` so both documents pick up the new feed.');
    L.push('');
    L.push('## Notes on this document');
    L.push('');
    L.push('The catalogue fields **id**, **name**, **urls**, **layer**, **refresh**, **risk** and '
        + '**mode** are read');
    L.push('straight from `tools/sources.js`. Two columns are not catalogue fields and are kept '
        + 'editorially in the');
    L.push('generator: **Format** and **Purpose**. The **Risk note** column is the catalogue\'s own '
        + 'text -');
    L.push('`risk` in this document, `riskZh` in the Chinese one - unmodified. Entry counts are line '
        + 'counts of the');
    L.push('cached copies, not figures published by the upstream projects.');
    L.push('');
    return L.join('\n');
}

function buildZh() {
    const L = [];
    const total = counters.total;
    const required = counters.required;
    const blocking = counters.blocking;
    const coverage = counters.coverage;
    const reference = counters.reference;
    const policy = required - blocking;

    L.push('# 来源清单');
    L.push('');
    L.push('本文件由 [`tools/gen-sources-doc.js`](tools/gen-sources-doc.js) 从 '
        + '[`tools/sources.js`](tools/sources.js) 生成，请勿手工修改。');
    L.push('要增删或修改某个 feed，改目录文件即可，目录是唯一的权威清单。英文版见 '
        + '[`SOURCES.md`](SOURCES.md)。');
    L.push('');
    L.push(`目录中的层数：**${LAYERS.length}**。目录条目总数：**${total}**，即参与构建的 **${required} 条**`);
    L.push(`（其中 **${blocking} 条为拦截 feed 条目**，另有 **${policy} 条策略条目**）`);
    L.push(`以及 **${reference} 条仅供参照的条目**（只抓取、绝不参与编译）。`);
    L.push('策略条目不参与拦截，它们是在拦截层编译完成之后，以集合运算的方式施加的。');
    L.push('拦截 feed 条目由二十个单一主题订阅源加四份已编译的聚合覆盖清单构成。');
    L.push('');
    L.push(`仅供参照的那一条（\`allowlist-referral\`）存在的唯一目的是让返利报告能在任何机器上重新生成；`);
    L.push('它不计入任何其他地方，也永远不会进入发布产物。');
    L.push('');
    L.push('| 层 | 条目数 | 作用 |');
    L.push('| --- | --- | --- |');
    L.push(`| \`security\` | ${feedsOfLayer('security').length} | 拦截 |`);
    L.push(`| \`ads-trackers\` | ${feedsOfLayer('ads-trackers').length} | 拦截 |`);
    L.push(`| \`china-telemetry\` | ${feedsOfLayer('china-telemetry').length} | 拦截 |`);
    L.push(`| \`exclusions\` | ${feedsOfLayer('exclusions').length} | 策略，删除拦截规则 |`);
    L.push(`| \`exceptions\` | ${feedsOfLayer('exceptions').length} | 策略，新增放行规则 |`);
    L.push(`| \`coverage\` | ${coverage} | 拦截，但属于上游已编译的聚合清单 |`);
    L.push(`| \`reference\` | ${reference} | 仅供参照，抓取用来出报告，绝不参与编译 |`);
    L.push('');
    L.push('## 来源政策');
    L.push('');
    L.push('每一条拦截 feed 都必须是独立发布、主题单一的上游清单：一个发布者、一个主题，');
    L.push('而且这份清单是发布者为自己维护的。这里没有把别人的 feed 拼起来当成自研来源的东西，');
    L.push('也没有为了凑数量而手工堆出来的清单。');
    L.push('');
    L.push('但本项目并不是只收原始 feed。目录里把四份上游已编译的聚合清单作为 `coverage` 层明确收了进来：');
    L.push('**OISD Big**、**HaGeZi\'s Pro Blocklist**、**AdRules DNS List** 和 **AdGuard DNS filter**。');
    L.push('这是一个明确的决定，理由是：没有任何一份原始 feed 能覆盖所有地区。这四份聚合清单各自都有团队');
    L.push('在跟踪本项目没有人力去盯的地区性、厂商专属来源，只靠原始 feed 拼，会有几万个域名漏掉。');
    L.push('');
    L.push('代价也要说清楚：');
    L.push('');
    L.push('- 覆盖面变大了，但项目中"由本项目自己核实过"的比例变小了。某个域名被拦，');
    L.push('  是因为那份聚合清单收过它，这个判断是上游做的，不是本项目做的。');
    L.push('- 归因变难。出问题时，原因可能在聚合清单里，而不在那些有名字的原始 feed 里。');
    L.push('- 出处更粗。同一个域名往往同时出现在四份清单里，列表没法说清是哪家先发布的。');
    L.push('- 聚合清单在上游会做域名级审核，但四家的收录尺度并不一致：');
    L.push('  OISD Big 只要有可信报告就收，AdGuard DNS filter 则刻意保守。');
    L.push('');
    L.push('本项目在它们之上补的，正是这些清单最薄弱的部分：一层放行机制，防止白名单悄悄把追踪域名放回去；');
    L.push('共享基础设施保护，避免把公共 CDN 的顶级域名整块拦掉；以及一个在出现回退时直接让构建失败的审计。');
    L.push('');
    L.push('## 分层');
    L.push('');
    L.push('先列三个拦截层，再列两个策略层并明确标注其**不参与拦截**，最后单列覆盖层，');
    L.push('因为它是"只收独立 feed"这条规则的唯一例外。');
    L.push('');
    LAYERS.forEach((layer) => { L.push(...layerSection(layer, 'zh')); });
    L.push(...policySection('zh'));

    L.push('## 上游 URL 与镜像处理');
    L.push('');
    L.push('在某些网络环境下，从 GitHub 原始地址抓取并不可靠。本项目搭建时所在的线路，第一次运行就有 6 个');
    L.push('托管在 GitHub 上的来源里有 5 个失败，所以 `tools/sources.js` 为每一个 '
        + '`raw.githubusercontent.com`');
    L.push('来源都定义了镜像回退：**ghproxy.net**、**gh-proxy.com** 和 **cdn.statically.io**。');
    L.push('`urls` 是有顺序的，镜像先试，直连的原始地址放在最后兜底。');
    L.push('');
    L.push('**jsDelivr 被刻意排除在外**：在这条线路上它每次尝试都会重置连接。');
    L.push('`adguardteam.github.io` 的来源则直接抓取，因为那个 CDN 稳定，不需要在前面套镜像。');
    L.push('');
    const peers = peerCounts();
    if (peers) {
        L.push('覆盖层同时也是本项目的对标对象，具体数字见 [`dist/benchmark.txt`](dist/benchmark.txt)：');
        L.push(peers.map((p) => `${p.name} ${p.rules} 条`).join('、') + '。');
        L.push('');
    }
    L.push('## 如何新增一个 feed');
    L.push('');
    L.push('1. 编辑 [`tools/sources.js`](tools/sources.js)，新增一个条目，填好 `id`、`name`、`urls`、'
        + '`layer`、');
    L.push('   `refresh` 和 `risk`。`id` 要与缓存文件名一致，`urls` 必须有序，镜像在前。');
    L.push('2. 运行 `node tools/fetch.js <id>`，把它下载并规范化到 `.cache/sources/<id>.txt`。');
    L.push('3. 运行 `node tools/build.js` 重新生成发布的列表。');
    L.push('4. 运行 `node tools/audit.js`，确认没有新增失败或警告。');
    L.push('5. 运行 `node tools/gen-sources-doc.js`，让两份文档都带上这个新 feed。');
    L.push('');
    L.push('## 关于本文档');
    L.push('');
    L.push('目录字段 **id**、**name**、**urls**、**layer**、**refresh**、**risk**、**mode** 都是直接从');
    L.push('`tools/sources.js` 读出来的。表里有两列不是目录字段，而是写在生成器里的编辑内容：');
    L.push('**格式** 和 **用途**。**风险说明** 一列是目录里自带的原文：本文档用 `riskZh`，');
    L.push('英文文档用 `risk`，两侧都未经改写。条目数取自本地缓存的副本行数，不是上游项目公布的数字。');
    L.push('');
    return L.join('\n');
}

// ─────────────────────────────────────────────────────────────────── main

function main() {
    collect();
    const outEn = argOutDir ? path.join(argOutDir, 'SOURCES.md') : OUT_EN;
    const outZh = argOutDir ? path.join(argOutDir, 'SOURCES.zh-CN.md') : OUT_ZH;
    if (argOutDir) fs.mkdirSync(argOutDir, { recursive: true });

    const docEn = buildEn();
    const docZh = buildZh();
    fs.writeFileSync(outEn, docEn, 'utf8');
    fs.writeFileSync(outZh, docZh, 'utf8');

    const lineCount = (t) => t.split('\n').length;
    console.log(`catalogue entries   ${counters.total}`);
    console.log(`layers              ${LAYERS.length} (${LAYERS.map((l) => l.id).join(', ')})`);
    console.log(`blocking feeds      ${counters.blocking}`);
    console.log(`coverage lists      ${counters.coverage}`);
    console.log(`policy feeds        ${counters.required - counters.blocking}`);
    console.log(`reference only      ${counters.reference} (fetched for a report, never compiled in)`);
    console.log(`compiled entries    ${counters.required}`);
    console.log(`cached sources      ${counters.total - counters.uncached.length}/${counters.total}`);
    if (counters.uncached.length) {
        console.log('not fetched yet (Entries column left out; run tools/fetch.js):');
        counters.uncached.forEach((id) => console.log(`  - ${id}`));
    }
    LAYERS.forEach((l) => {
        console.log(`  ${l.id.padEnd(16)} ${String(feedsOfLayer(l.id).length).padStart(2)} entries`);
    });
    if (counters.unknownIds.length) {
        console.log('catalogue ids with no editorial format/purpose text (rendered with a fallback):');
        counters.unknownIds.forEach((id) => console.log(`  - ${id}`));
    }
    console.log(`\nwrote ${outEn}  (${lineCount(docEn)} lines, ${docEn.length} bytes)`);
    console.log(`wrote ${outZh}  (${lineCount(docZh)} lines, ${docZh.length} bytes)`);
    if (lineCount(docEn) > 400 || lineCount(docZh) > 400) {
        console.log('WARNING  one of the documents is over 400 lines');
    }
}

main();
