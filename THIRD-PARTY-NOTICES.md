# Third-party notices / 第三方许可说明

DNS Shield is a **compilation**. The rules in `dist/dns-shield.txt` come from the feeds listed in
[`tools/sources.js`](tools/sources.js), and every one of those feeds belongs to somebody else. This
file says who they are, what they license their work under, and which of those licences carry a
condition a deployer should know about.

This project's own contribution — the toolchain, the policy files, the documentation — is
GPL-3.0 ([`LICENSE`](LICENSE)).

Two rules the project tries to hold itself to:

1. **Attribution is not optional.** Every feed is named here, with its upstream project and licence.
2. **No feed with a non-commercial licence gets added quietly.** See "Limitations" below; there is
   one such feed today, and it is flagged rather than buried.

## Feeds by licence / 按许可证分组的订阅源

### GNU General Public License v3.0

| Feed | Upstream project | Licence source |
| --- | --- | --- |
| `oisd-big` | OISD | stated in the [OISD FAQ](https://oisd.nl/faq#license), text at [sjhgvr/oisd LICENSE](https://github.com/sjhgvr/oisd/blob/main/LICENSE) |
| `hagezi-pro` | HaGeZi DNS Blocklists | [hagezi/dns-blocklists LICENSE](https://github.com/hagezi/dns-blocklists/blob/main/LICENSE) |
| `adguard-dns-filter` | AdGuard DNS filter | [AdGuardSDNSFilter LICENSE](https://github.com/AdguardTeam/AdGuardSDNSFilter/blob/master/LICENSE) |
| `adguard-exceptions` | AdGuard DNS filter | same repository, `Filters/exceptions.txt` |
| `adguard-exclusions` | AdGuard DNS filter | same repository, `Filters/exclusions.txt` |
| `adguard-trackers` | AdGuard Filters (SpywareFilter) | [AdguardFilters LICENSE](https://github.com/AdguardTeam/AdguardFilters/blob/master/LICENSE) |
| `adguard-mobile-trackers` | AdGuard Filters (SpywareFilter) | same repository |
| `adguard-adservers` | AdGuard Filters (BaseFilter) | same repository |
| `adguard-foreign` | AdGuard Filters (BaseFilter) | same repository |
| `adguard-mobile-ads` | AdGuard Filters (MobileFilter) | same repository |
| `adguard-cryptominers` | AdGuard Filters (BaseFilter) | same repository |
| `adguard-chinese-ads` | AdGuard Filters (ChineseFilter) | same repository |
| `adguard-chinese-firstparty` | AdGuard Filters (ChineseFilter) | same repository |
| `adrules-dns` | AdRules DNS List, via HostlistsRegistry | [HostlistsRegistry LICENSE](https://github.com/AdguardTeam/HostlistsRegistry/blob/master/LICENSE) |

AdGuard's HostlistsRegistry is a catalogue, not a maintainer: `oisd-big` (`filter_27`),
`hagezi-pro` (`filter_48`), `adrules-dns` (`filter_29`) and `allowlist-referral` (`filter_45`) are
fetched from its CDN because that mirror is reachable and fast from the networks this project is
built on. The work itself is OISD's, HaGeZi's and AdRules' respectively, under their own licences.

### Dual GPL-3.0-or-later / CC-BY-SA-3.0-or-later, by attribution

| Feed | Upstream project | Licence source |
| --- | --- | --- |
| `easyprivacy-trackers` | EasyPrivacy (EasyList project) | [EasyList repository licences](https://easylist.to/pages/licence.html) |
| `easyprivacy-thirdparty` | EasyPrivacy | same |
| `easylist-adservers` | EasyList | same |
| `easylist-thirdparty` | EasyList | same |

Required attribution: **"The EasyList authors ( https://easylist.to/ )"**. This project takes the
GPL-3.0 branch of that dual licence, so the attribution above is given both here and in
[`SOURCES.md`](SOURCES.md).

### MIT

| Feed | Upstream project | Licence source |
| --- | --- | --- |
| `scamblocklist` | durablenapkin/scamblocklist | [LICENSE](https://github.com/durablenapkin/scamblocklist/blob/master/LICENSE) (MIT, © 2019 durablenapkin) |

### Terms of use rather than a licence

| Feed | Upstream project | Terms |
| --- | --- | --- |
| `urlhaus-domains` | URLhaus, operated by abuse.ch | [URLhaus API terms](https://urlhaus.abuse.ch/api/) |
| `urlhaus-hostfile` | URLhaus | same |

abuse.ch asks that URLhaus be credited as the source; the list header and this file do that. The
feed is queried without an API key, at the rate the site documents as acceptable.

### No licence statement found

These feeds are used as their publishers intended — fetched and consumed as a blocklist — but the
project could not find an explicit licence grant to point at. That is a gap in the record, not a
claim of permission.

| Feed | Upstream project | Where checked |
| --- | --- | --- |
| `openphish` | OpenPhish free feed | openphish.com (free tier is a sample, no terms page) |
| `spam404` | Spam404/lists | repository has no `LICENSE` file |
| `anti-ad` | anti-AD | anti-ad.net (no licence statement) |
| `peter-lowe` | Peter Lowe's Ad and tracking server list | pgl.yoyo.org (the site states the list may be used; no formal licence text) |
| `phishing-army` | Phishing Army | **has a licence — and it is restrictive. See below.** |

## Limitations / 限制

- **`phishing-army` is CC BY-NC 4.0.** Phishing Army's site states: *"This work is licensed under a
  Creative Commons Attribution-NonCommercial 4.0 International License."* NonCommercial forbids use
  "primarily intended for or directed toward commercial advantage or monetary compensation". Using
  the published list yourself is not that. **Selling a product, a service or a support contract
  built on the published file is.** If that is your situation, remove the feed:
  delete its entry from [`tools/sources.js`](tools/sources.js) and rebuild. It is one entry and
  nothing else references it.
- **Four of the feeds are themselves the output of a resolver allowlist** (`allowlist-referral` is
  fetched, never compiled). Its presence here is documentation, not a contribution.
- **Licences travel with the rules, not with this repository.** A GPL-3.0 licence on this compilation
  does not relicense OISD's or HaGeZi's rules; it covers the selection, ordering and policy layer
  this project applies.

## Keeping this file honest

`tools/audit.js` fails if a feed appears in `tools/sources.js` without a row here, so adding a feed
means editing both. When a feed's licence changes upstream, change the row and say so in
[`CHANGELOG.md`](CHANGELOG.md).

## 中文摘要

本列表是**汇编作品**：`dist/dns-shield.txt` 里的规则来自 [`tools/sources.js`](tools/sources.js)
登记的各个上游订阅源，每一份都属于别人。本项目自己的部分（工具链、策略文件、文档）采用
GPL-3.0（见 [`LICENSE`](LICENSE)）。

- 绝大多数上游是 GPL-3.0（OISD、HaGeZi、AdGuard、AdRules）或 MIT（scamblocklist），与本项目兼容。
- EasyList / EasyPrivacy 采用 GPL-3.0 与 CC BY-SA 双许可，本项目取 GPL-3.0 分支，并按要求署名
  **"The EasyList authors ( https://easylist.to/ )"**。
- URLhaus（abuse.ch）按站点的使用条款取用并署名。
- OpenPhish、Spam404、anti-AD、Peter Lowe 的列表**未找到明确的许可证声明**，此处如实记录为
  "记录缺失"，而非声称已获授权。
- **`phishing-army` 使用 CC BY-NC 4.0，禁止商业性使用。** 自己订阅使用不属于商业使用；但把它做成
  收费产品或付费服务则不属于授权范围。如果是这种情况，请从 [`tools/sources.js`](tools/sources.js)
  删除该条目后重新构建。

`tools/audit.js` 会在"某个源没有出现在本文档里"时让构建失败，因此新增订阅源必须同时更新本文档。
