# 来源清单

本文件由 [`tools/gen-sources-doc.js`](tools/gen-sources-doc.js) 从 [`tools/sources.js`](tools/sources.js) 生成，请勿手工修改。
要增删或修改某个 feed，改目录文件即可，目录是唯一的权威清单。英文版见 [`SOURCES.md`](SOURCES.md)。

目录中的层数：**7**。目录条目总数：**27**，即参与构建的 **26 条**
（其中 **24 条为拦截 feed 条目**，另有 **2 条策略条目**）
以及 **1 条仅供参照的条目**（只抓取、绝不参与编译）。
策略条目不参与拦截，它们是在拦截层编译完成之后，以集合运算的方式施加的。
拦截 feed 条目由二十个单一主题订阅源加四份已编译的聚合覆盖清单构成。

仅供参照的那一条（`allowlist-referral`）存在的唯一目的是让返利报告能在任何机器上重新生成；
它不计入任何其他地方，也永远不会进入发布产物。

| 层 | 条目数 | 作用 |
| --- | --- | --- |
| `security` | 6 | 拦截 |
| `ads-trackers` | 11 | 拦截 |
| `china-telemetry` | 3 | 拦截 |
| `exclusions` | 1 | 策略，删除拦截规则 |
| `exceptions` | 1 | 策略，新增放行规则 |
| `coverage` | 4 | 拦截，但属于上游已编译的聚合清单 |
| `reference` | 1 | 仅供参照，抓取用来出报告，绝不参与编译 |

## 来源政策

每一条拦截 feed 都必须是独立发布、主题单一的上游清单：一个发布者、一个主题，
而且这份清单是发布者为自己维护的。这里没有把别人的 feed 拼起来当成自研来源的东西，
也没有为了凑数量而手工堆出来的清单。

但本项目并不是只收原始 feed。目录里把四份上游已编译的聚合清单作为 `coverage` 层明确收了进来：
**OISD Big**、**HaGeZi's Pro Blocklist**、**AdRules DNS List** 和 **AdGuard DNS filter**。
这是一个明确的决定，理由是：没有任何一份原始 feed 能覆盖所有地区。这四份聚合清单各自都有团队
在跟踪本项目没有人力去盯的地区性、厂商专属来源，只靠原始 feed 拼，会有几万个域名漏掉。

代价也要说清楚：

- 覆盖面变大了，但项目中"由本项目自己核实过"的比例变小了。某个域名被拦，
  是因为那份聚合清单收过它，这个判断是上游做的，不是本项目做的。
- 归因变难。出问题时，原因可能在聚合清单里，而不在那些有名字的原始 feed 里。
- 出处更粗。同一个域名往往同时出现在四份清单里，列表没法说清是哪家先发布的。
- 聚合清单在上游会做域名级审核，但四家的收录尺度并不一致：
  OISD Big 只要有可信报告就收，AdGuard DNS filter 则刻意保守。

本项目在它们之上补的，正是这些清单最薄弱的部分：一层放行机制，防止白名单悄悄把追踪域名放回去；
共享基础设施保护，避免把公共 CDN 的顶级域名整块拦掉；以及一个在出现回退时直接让构建失败的审计。

## 分层

先列三个拦截层，再列两个策略层并明确标注其**不参与拦截**，最后单列覆盖层，
因为它是"只收独立 feed"这条规则的唯一例外。

### 安全层 —— 恶意软件、钓鱼与诈骗域名

这一层的 feed 只做一件事：恶意软件分发、钓鱼、诈骗注册。这类域名本身寿命很短，所以同一个域名不会长期留在列表里。

本层条目: 6

| id | Feed 名称 | 上游 URL | 格式 | 刷新 | 用途 | 风险说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `urlhaus-domains` | URLhaus malicious domain feed (abuse.ch)（576 条） | urlhaus.abuse.ch/downloads/text_online/ | 完整 URL（text_online），每行一条 | realtime | 当前活跃的恶意软件分发站点；抓取时只保留主机名。 | 是完整 URL 而不是主机名——必须先规范化。这类主机寿命很短，某个域名过一阵就会自然消失。 |
| `urlhaus-hostfile` | URLhaus hosts-format feed (abuse.ch)（408 条） | urlhaus.abuse.ch/downloads/hostfile/ | hosts 格式 | realtime | 同一份 abuse.ch 数据的 hosts 版本，作为同一主题的第二次覆盖。 | 低。与域名版 feed 有重叠；保留它是因为格式不同，偶尔还能互补。 |
| `phishing-army` | Phishing Army extended blocklist（144,243 条） | phishing.army/download/phishing_army_blocklist_extended.txt | 纯域名，每行一条 | several times daily | 规模较大的钓鱼黑名单，extended 变体包含了顶级域名条目。 | extended 变体包含顶级域名条目；有少量处在合法边界上的注册。它的许可证也与其他源不同：Creative Commons BY-NC 4.0，禁止商业性使用。这是该 feed 自身的属性，不是本列表的，但正因如此 THIRD-PARTY-NOTICES.md 把这一行标为限制而非明确授权。 |
| `openphish` | OpenPhish live phishing feed（259 条） | openphish.com/feed.txt | 完整 URL，每行一条 | realtime (delayed free tier) | 免费通道的实时钓鱼 URL；抓取时只保留主机名。 | 免费档只是约 300 条、有延迟的样本，不是完整 feed。 |
| `spam404` | Spam404 domain blacklist（8,140 条） | ghproxy.net/https://raw.githubusercontent.com/Spam404/lists/master/main-blacklist.txt<br>gh-proxy.com/https://raw.githubusercontent.com/Spam404/lists/master/main-blacklist.txt<br>cdn.statically.io/gh/Spam404/lists/master/main-blacklist.txt<br>raw.githubusercontent.com/Spam404/lists/master/main-blacklist.txt | hosts / 纯域名 | weekly | 域名抢注垃圾与论坛垃圾注册来源。 | 低。稳定的抢注/垃圾注册域名。 |
| `scamblocklist` | Scam Blocklist by DurableNapkin（2,189 条） | ghproxy.net/https://raw.githubusercontent.com/durablenapkin/scamblocklist/master/hosts.txt<br>gh-proxy.com/https://raw.githubusercontent.com/durablenapkin/scamblocklist/master/hosts.txt<br>cdn.statically.io/gh/durablenapkin/scamblocklist/master/hosts.txt<br>raw.githubusercontent.com/durablenapkin/scamblocklist/master/hosts.txt | hosts 格式 | weekly | 只收诈骗类域名，主题单一。 | 低。只收诈骗类域名，主题单一。 |

已抓取: 6/6。条目数是最近一次抓取到 .cache/sources/ 的行数，运行时可能变化。

每个托管在 GitHub 上的 feed 都有四个 URL：先试三个镜像，最后回落到 raw.githubusercontent.com 的原始地址。tools/sources.js 里的 `urls` 是有顺序的，抓取器在第一个能返回可用内容的 URL 上就停下。

### 广告与追踪器 —— 通用

面向全球的广告服务器、追踪网络和统计上报端点，不针对某一个国家。这一层是整份列表里条目最多的一层。

本层条目: 11

| id | Feed 名称 | 上游 URL | 格式 | 刷新 | 用途 | 风险说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `easyprivacy-trackers` | EasyPrivacy tracking servers（31 条） | ghproxy.net/https://raw.githubusercontent.com/easylist/easylist/master/easyprivacy/easyprivacy_trackingservers.txt<br>gh-proxy.com/https://raw.githubusercontent.com/easylist/easylist/master/easyprivacy/easyprivacy_trackingservers.txt<br>cdn.statically.io/gh/easylist/easylist/master/easyprivacy/easyprivacy_trackingservers.txt<br>raw.githubusercontent.com/easylist/easylist/master/easyprivacy/easyprivacy_trackingservers.txt | adblock | weekly | 只做追踪、没有别的作用的主机。 | 极低。只收已确认的纯追踪主机。 |
| `easyprivacy-thirdparty` | EasyPrivacy third-party requests（1,909 条） | ghproxy.net/https://raw.githubusercontent.com/easylist/easylist/master/easyprivacy/easyprivacy_thirdparty.txt<br>gh-proxy.com/https://raw.githubusercontent.com/easylist/easylist/master/easyprivacy/easyprivacy_thirdparty.txt<br>cdn.statically.io/gh/easylist/easylist/master/easyprivacy/easyprivacy_thirdparty.txt<br>raw.githubusercontent.com/easylist/easylist/master/easyprivacy/easyprivacy_thirdparty.txt | adblock | weekly | 加载追踪脚本的第三方请求，范围比纯追踪文件宽。 | 中。部分条目处在统计上报与 CDN 的边界上。 |
| `adguard-trackers` | AdGuard Tracking Protection - third-party tracking networks（4,214 条） | adguardteam.github.io/AdguardFilters/SpywareFilter/sections/tracking_servers.txt | adblock | weekly | 第三方追踪网络；上游按政策只收录整域规则。 | 低。上游按政策把这份文件限制为整域规则。 |
| `adguard-mobile-trackers` | AdGuard Tracking Protection - in-app analytics and spyware（1,156 条） | adguardteam.github.io/AdguardFilters/SpywareFilter/sections/mobile.txt | adblock | weekly | 移动 SDK 的应用内统计与间谍软件端点。 | 低。移动 SDK 端点。 |
| `easylist-adservers` | EasyList advertising servers（45,640 条） | ghproxy.net/https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_adservers.txt<br>gh-proxy.com/https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_adservers.txt<br>cdn.statically.io/gh/easylist/easylist/master/easylist/easylist_adservers.txt<br>raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_adservers.txt | adblock | weekly | 广告服务器；广告与追踪器这一层里条目最多的单一来源。 | 本层条目最多的来源。上游偶尔会分错类，所以出问题时这里是第一个该查的地方。 |
| `easylist-thirdparty` | EasyList third-party advertising（1,471 条） | ghproxy.net/https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_thirdparty.txt<br>gh-proxy.com/https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_thirdparty.txt<br>cdn.statically.io/gh/easylist/easylist/master/easylist/easylist_thirdparty.txt<br>raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_thirdparty.txt | adblock | weekly | 第三方广告规则。 | 低。 |
| `adguard-adservers` | AdGuard Base filter - third-party advertising networks（1,203 条） | adguardteam.github.io/AdguardFilters/BaseFilter/sections/adservers.txt | adblock | weekly | 第三方广告网络，只保留整域规则。 | 低。上游政策把这份文件限制为整域规则。 |
| `adguard-foreign` | AdGuard Base filter - language-neutral advertising rules（162 条） | adguardteam.github.io/AdguardFilters/BaseFilter/sections/foreign.txt | adblock，大多不是域名规则 | weekly | 语言无关的广告规则；规范化之后只剩域名级规则，产出很少。 | 上游的混合文件；规范化之后只有域名级规则能留下，所以产出很少。 |
| `adguard-mobile-ads` | AdGuard Mobile Ads filter（935 条） | adguardteam.github.io/AdguardFilters/MobileFilter/sections/adservers.txt | adblock | weekly | 移动端应用访问的广告服务器。 | 低。 |
| `adguard-cryptominers` | AdGuard cryptominer domains（49 条） | adguardteam.github.io/AdguardFilters/BaseFilter/sections/cryptominers.txt | adblock | weekly | 网页挖矿域名。条目很少，但价值高。 | 低。条目很少，但价值高。 |
| `peter-lowe` | Peter Lowe's ad and tracking server list（3,551 条） | pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext | adblock（hostformat=adblockplus） | monthly | 长期存在的广告与追踪服务器清单，更新慢、改动保守。 | 低。清单长期存在、改动保守、更新很慢。 |

已抓取: 11/11。条目数是最近一次抓取到 .cache/sources/ 的行数，运行时可能变化。

每个托管在 GitHub 上的 feed 都有四个 URL：先试三个镜像，最后回落到 raw.githubusercontent.com 的原始地址。tools/sources.js 里的 `urls` 是有顺序的，抓取器在第一个能返回可用内容的 URL 上就停下。

直接抓取：adguardteam.github.io 这个 CDN 一直可用，所以不套镜像。

### 中国区遥测与广告 SDK

国内 App 的广告 SDK 与埋点上报域名，通用 feed 要么不收，要么收得很不完整。

本层条目: 3

| id | Feed 名称 | 上游 URL | 格式 | 刷新 | 用途 | 风险说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `anti-ad` | anti-AD domain list（108,349 条） | anti-ad.net/domains.txt | 纯域名，每行一条 | daily | 覆盖面很宽的国内域名清单，也是整个目录里条目最多的单一来源。 | 本清单中最高。条目最多的单一来源（约 108k），而且颗粒度很粗；国内 App 出问题时，第一个该怀疑的就是它。 |
| `adguard-chinese-ads` | AdGuard Chinese filter - third-party advertising networks（219 条） | adguardteam.github.io/AdguardFilters/ChineseFilter/sections/adservers.txt | adblock | weekly | 国内的第三方广告网络。 | 低。条目少，针对性强。 |
| `adguard-chinese-firstparty` | AdGuard Chinese filter - first-party advertising subdomains（15 条） | adguardteam.github.io/AdguardFilters/ChineseFilter/sections/adservers_firstparty.txt | adblock | weekly | 国内站点自身域名下的广告子域。 | 低。条目极少，但很精准。 |

已抓取: 3/3。条目数是最近一次抓取到 .cache/sources/ 的行数，运行时可能变化。

直接抓取：adguardteam.github.io 这个 CDN 一直可用，所以不套镜像。

### 策略层 —— 上游排除清单（不参与拦截）

这些是 AdGuard 在收到真实故障报告后决定不再拦截的域名。构建时从编译结果里减去，所以这一层只会删规则，不会加规则。

这一层不参与拦截。它是作为策略导入的：决定拦截层可以保留什么，而不是决定覆盖什么。

本层条目: 1

| id | Feed 名称 | 上游 URL | 格式 | 刷新 | 用途 | 风险说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `adguard-exclusions` | AdGuard DNS filter exclusion rules (GPL-3.0)（545 条）（mode: `exclude`） | ghproxy.net/https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/exclusions.txt<br>gh-proxy.com/https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/exclusions.txt<br>cdn.statically.io/gh/AdguardTeam/AdGuardSDNSFilter/master/Filters/exclusions.txt<br>raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/exclusions.txt | 纯域名，每行一条 | per issue | 上游主动解除拦截的域名；构建时从编译结果里减掉。 | AdGuard 在收到真实故障报告（银行、零售、同意管理平台）后解除拦截的域名。本项目把它们作为排除项应用，这样拦截层不会再把它们加回来。 |

已抓取: 1/1。条目数是最近一次抓取到 .cache/sources/ 的行数，运行时可能变化。

每个托管在 GitHub 上的 feed 都有四个 URL：先试三个镜像，最后回落到 raw.githubusercontent.com 的原始地址。tools/sources.js 里的 `urls` 是有顺序的，抓取器在第一个能返回可用内容的 URL 上就停下。

### 策略层 —— 上游例外清单（不参与拦截）

上游确认的误杀域名，以 @@ 放行规则的形式发布。本项目原样输出到列表的放行段。

这一层不参与拦截。它是作为策略导入的：决定拦截层可以保留什么，而不是决定覆盖什么。

本层条目: 1

| id | Feed 名称 | 上游 URL | 格式 | 刷新 | 用途 | 风险说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `adguard-exceptions` | AdGuard DNS filter exception rules (GPL-3.0)（172 条）（mode: `allow`） | ghproxy.net/https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/exceptions.txt<br>gh-proxy.com/https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/exceptions.txt<br>cdn.statically.io/gh/AdguardTeam/AdGuardSDNSFilter/master/Filters/exceptions.txt<br>raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/exceptions.txt | @@&#124;&#124;domain^ 放行规则（原样保留） | per issue | 上游确认的误杀域名，每条规则都能追溯到对应的 bug 报告。 | 每条规则都带着当初促成它的 bug 报告。只有放行规则——不可能撑大覆盖面。 |

已抓取: 1/1。条目数是最近一次抓取到 .cache/sources/ 的行数，运行时可能变化。

每个托管在 GitHub 上的 feed 都有四个 URL：先试三个镜像，最后回落到 raw.githubusercontent.com 的原始地址。tools/sources.js 里的 `urls` 是有顺序的，抓取器在第一个能返回可用内容的 URL 上就停下。

### 覆盖层 —— 四份上游已编译的聚合清单（本身不是独立 feed）

这一层不是独立发布的单主题 feed，而是四个团队各自维护的聚合清单：他们跟踪的地区性、厂商专属来源，本项目并不监控。把它们收进来是明确决定，"来源政策"一节说明了原因和代价。

这一层同样不是独立 feed：每一条都是许多上游 feed 的汇总，而不是某一个发布者自己的单主题清单。

本层条目: 4

| id | Feed 名称 | 上游 URL | 格式 | 刷新 | 用途 | 风险说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `oisd-big` | OISD Big（240,439 条） | adguardteam.github.io/HostlistsRegistry/assets/filter_27.txt | hosts 与 adblock 混合，已编译 | daily | 覆盖上限之一：四份聚合清单加起来能覆盖的部分。 | 聚合清单。四份里收得最宽的一份；也最容易带上边界域名，因为它只要有可信报告就收。 |
| `hagezi-pro` | HaGeZi's Pro Blocklist（198,605 条） | adguardteam.github.io/HostlistsRegistry/assets/filter_48.txt | hosts 与 adblock 混合，已编译 | daily | 在广告、追踪和滥用之间取平衡，刻意不选最激进的那一档。 | 聚合清单。在广告、追踪和滥用之间取平衡，其 "Pro" 档刻意不是最激进的那一档。 |
| `adrules-dns` | AdRules DNS List（198,109 条） | adguardteam.github.io/HostlistsRegistry/assets/filter_29.txt | hosts 与 adblock 混合，已编译 | daily | 四份聚合清单里国内规则占比最高的一份。 | 聚合清单，国内覆盖较好。中文地区规则的占比高于另外三份。 |
| `adguard-dns-filter` | AdGuard DNS filter（178,250 条） | adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt | adblock，已编译 | daily | 偏保守的聚合清单；AdGuard 把不少广告域名留给浏览器扩展处理。 | 由 AdGuard 维护的聚合清单。刻意保守——把不少广告域名留给自家的浏览器扩展——所以按设计它就是四份里收得最窄的。 |

已抓取: 4/4。条目数是最近一次抓取到 .cache/sources/ 的行数，运行时可能变化。

直接抓取：adguardteam.github.io 这个 CDN 一直可用，所以不套镜像。

### 仅供参照 —— 抓取是为了生成报告，绝不参与编译

这是别人会去安装的白名单。AdGuard Home 是用白名单覆盖黑名单的，所以一旦装上它，不管启用哪几条黑名单，都会有几百条本列表拦截的域名被放行。抓取它只为了让 REFERRAL-GAPS.md 能在任何机器上重新生成；它不参与任何计数，也不会进入发布产物。

本层条目: 1

| id | Feed 名称 | 上游 URL | 格式 | 刷新 | 用途 | 风险说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `allowlist-referral` | HaGeZi's Allowlist Referral (reference only)（936 条）（mode: `allow`） | adguardteam.github.io/HostlistsRegistry/assets/filter_45.txt | @@&#124;&#124;domain^ 放行规则，含通配符 | weekly | 不是本项目的 feed。这是别人会安装的白名单，抓取它只为了让 REFERRAL-GAPS.md 能在任何机器上重新生成，绝不参与编译。 | 对本列表没有风险——它从不参与编译。之所以收录，是因为 AdGuard Home 是用白名单过滤器覆盖黑名单的，所以一旦装上它，不管启用了哪几条黑名单，都会放行本列表拦截的数百个主机名（其中包括 adjust.com、appsflyer.com 和 amazon-adsystem.com）。这里刻意不写死具体条数，因为它会随着两份列表的更新而变化：REFERRAL-GAPS.md 逐一列出被放行的主机，tools/whitelist-impact.js 可以测量任何白名单文件。 |

已抓取: 1/1。条目数是最近一次抓取到 .cache/sources/ 的行数，运行时可能变化。

直接抓取：adguardteam.github.io 这个 CDN 一直可用，所以不套镜像。

## 上游策略层

这两个 feed 是"只收独立 feed"这条规则的唯一例外，而且例外是合理的：它们都是上游用 GPL-3.0 发布的，与本项目同一许可证。

它们都不参与拦截，只作为策略导入：决定拦截层可以保留什么，而不是决定覆盖什么。

`adguard-exceptions` 是 172 条 `@@||domain^` 放行规则，每一条对应一个上游确认过的真实误杀报告。允许规则只能删规则，不能加覆盖：把它们导进来，覆盖面上限一点也不会变，只会减少错误。

`adguard-exclusions` 是 545 个上游主动解除拦截的域名（银行、零售、同意管理平台等真实故障）。本项目把它们作为排除项应用，而不是交给编译器去猜，这样拦截层不会把上游已经撤下的域名重新加回来。

换句话说：这两条输入只会让列表变短或者变准，不会让它变大。这正是它们值得收录的原因 - 如果本项目自己攒误杀报告，现在还没有这份数据，而上游已经把每条规则的来龙去脉写清楚了。

## 上游 URL 与镜像处理

在某些网络环境下，从 GitHub 原始地址抓取并不可靠。本项目搭建时所在的线路，第一次运行就有 6 个
托管在 GitHub 上的来源里有 5 个失败，所以 `tools/sources.js` 为每一个 `raw.githubusercontent.com`
来源都定义了镜像回退：**ghproxy.net**、**gh-proxy.com** 和 **cdn.statically.io**。
`urls` 是有顺序的，镜像先试，直连的原始地址放在最后兜底。

**jsDelivr 被刻意排除在外**：在这条线路上它每次尝试都会重置连接。
`adguardteam.github.io` 的来源则直接抓取，因为那个 CDN 稳定，不需要在前面套镜像。

覆盖层同时也是本项目的对标对象，具体数字见 [`dist/benchmark.txt`](dist/benchmark.txt)：
AdGuard DNS filter 178,250 条、HaGeZi's Pro 198,605 条、OISD Big 240,439 条、AdRules DNS List 198,109 条、AdGuard DNS filter 23 条、HaGeZi's Pro 2 条、OISD Big 4 条、AdRules DNS List 18 条。

## 如何新增一个 feed

1. 编辑 [`tools/sources.js`](tools/sources.js)，新增一个条目，填好 `id`、`name`、`urls`、`layer`、
   `refresh` 和 `risk`。`id` 要与缓存文件名一致，`urls` 必须有序，镜像在前。
2. 运行 `node tools/fetch.js <id>`，把它下载并规范化到 `.cache/sources/<id>.txt`。
3. 运行 `node tools/build.js` 重新生成发布的列表。
4. 运行 `node tools/audit.js`，确认没有新增失败或警告。
5. 运行 `node tools/gen-sources-doc.js`，让两份文档都带上这个新 feed。

## 关于本文档

目录字段 **id**、**name**、**urls**、**layer**、**refresh**、**risk**、**mode** 都是直接从
`tools/sources.js` 读出来的。表里有两列不是目录字段，而是写在生成器里的编辑内容：
**格式** 和 **用途**。**风险说明** 一列是目录里自带的原文：本文档用 `riskZh`，
英文文档用 `risk`，两侧都未经改写。条目数取自本地缓存的副本行数，不是上游项目公布的数字。

**许可证另有一处记录。** 本文档写的是每个源包含什么、风险如何，刻意不谈它归谁所有、
可以怎么用。那部分记录在 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) 里；
某个源没有登记在那里，`tools/audit.js` 会让构建失败。
