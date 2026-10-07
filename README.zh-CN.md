# DNS Shield

[![build](https://github.com/LucentDNS/dns-shield/actions/workflows/build.yml/badge.svg)](https://github.com/LucentDNS/dns-shield/actions/workflows/build.yml)
[![规则条数](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FLucentDNS%2Fdns-shield%2Fmain%2Fdist%2Fstats.json&query=%24.blockRules&label=%E6%8B%A6%E6%88%AA%E8%A7%84%E5%88%99&color=blue)](https://github.com/LucentDNS/dns-shield/blob/main/dist/stats.json)
[![许可证：GPL-3.0](https://img.shields.io/badge/%E8%AE%B8%E5%8F%AF%E8%AF%81-GPL--3.0-blue)](LICENSE)
[![订阅源：目录 27，参与编译 26](https://img.shields.io/badge/%E8%AE%A2%E9%98%85%E6%BA%90-27%20%E7%9B%AE%E5%BD%95%EF%BC%8C26%20%E5%8F%82%E4%B8%8E%E7%BC%96%E8%AF%91-blue)](THIRD-PARTY-NOTICES.md)

DNS Shield 是一份 DNS 层屏蔽列表，用于拦截广告、跟踪器、遥测上报、钓鱼、恶意软件与诈骗域名。
它以单个纯文本文件发布，只使用 AdGuard / DNS 规则语法：`||domain^` 屏蔽规则与
`@@||domain^` 例外规则，不含外观过滤规则（cosmetic rules）、脚本注入规则（scriptlet）和 `$`
修饰符。正因如此，它由 DNS 解析器消费，而不是浏览器扩展：可用于 AdGuard Home、AdGuard DNS、
Pi-hole（需按惯例转换成 hosts 格式）、dnsmasq 和 blocky。

发布文件每天都会重新构建，规则条数会上下浮动几百条。当前的真实数字永远写在文件自己的头部：

```
! Contains 516,987 block rules and 19 exception rules.
! List revision: 6d37dc164e2d
```

下文引用的数字来自 2026-10-07 的参考构建：**516,987 条屏蔽规则、19 条例外规则、11.21 MiB**。
请把它们当作量级而不是承诺——今天的精确条数请以头部或 `dist/stats.json` 为准。

## 为什么选择这个列表

它不是新的检测引擎，也不声称能发现上游项目漏掉的东西。它是一份**经过整理的并集，外加一层策略**，
并且对两者各自的作用毫不含糊：

- **覆盖范围来自上游。** 四份维护良好的聚合列表充当覆盖层——OISD Big、HaGeZi's Pro、
  AdRules DNS List 和 AdGuard DNS filter——另外还有二十个单一主题的原始订阅源，覆盖滥用与钓鱼、
  广告与跟踪服务器、以及中国大陆特有的遥测 SDK：屏蔽类订阅源共 24 个，另有 AdGuard 的两份策略源
  （其排除列表与人工确认的误报列表），合计 26 个订阅源参与构建。每个上游源都保留自己的许可证和维护者；
  `tools/sources.js` 记录了每一个来源的出处、更新频率和风险说明。
- **本项目补充的是策略，而不是检测能力。** 聚合列表自己不会做的三件事：
  - **禁止白名单**（`data/never-whitelist.txt`，93 个受保护域名），让白名单永远无法悄悄重新放行
    跟踪器；
  - **基础设施守卫**（`data/guards.txt`，135 个共享 CDN / 托管平台顶级域名），避免一个恶意租户
    连带拖垮整个平台；
  - **人工补丁规则**（`data/extra-block.txt`，3 条），用于上游只以无法通过规范化的形式发布的主机名。
- **用测量代替声明。** `tools/benchmark.js` 把本列表和四个同类列表放在同一把尺子上比较，
  `tools/audit.js` 一旦发现回归就让构建失败。参考运行（2026-10-07）的数据如下——同类列表的条数
  同样每天都在变，这也是它们只出现在这张带日期的表里的原因：

  | 同类列表 | 其规则数 | 我们同时屏蔽的比例 |
  | --- | --- | --- |
  | OISD Big | 240,418 | 95.1% |
  | HaGeZi's Pro | 198,605 | 94.5% |
  | AdRules DNS List | 198,109 | 95.4% |
  | AdGuard DNS filter | 178,228 | 96.8% |

  四者并集共 541,489 条规则，本列表覆盖其中 **95.5%**；有 24,502 条规则只存在于这些列表中。
  剩下的差距是被解释清楚的，而不是被隐藏的：`tools/coverage-gap.js` 会把每一条未收录的同类规则
  归入“符合预期”（已被上级域名的规则覆盖，或被排除项、守卫、白名单、例外规则放行）或“缺陷”，
  在参考运行中四份列表全部报告 `0 are defects`，且推导出的规则集与发布文件完全对得上。
- **过度屏蔽同样被测量。** AdGuard 自己手写的 172 条例外规则被用作独立的尺子：每一条都对应一个
  已被人证实被误伤的主机名。本列表仍然屏蔽其中 **2 条**——`sax.sina.com.cn` 和
  `log.mmstat.com`，二者都是因为属于遥测端点而被刻意固定在 `data/never-whitelist.txt` 和
  `data/extra-block.txt` 中的。在同一把尺子上，AdGuard DNS filter 屏蔽 23 条、AdRules DNS List
  18 条、OISD Big 4 条、HaGeZi's Pro 2 条。

代价是真实的，也值得直说：516,987 条规则是 OISD Big 的 240,418 条的两倍多，文件体积 11.21 MiB。
因此它并不适合内存紧张的软路由，也不适合按流量计费的手机。`dist/audit.log` 里还长期带着一条警告：
十四个两用型短链接与 DNS 服务（bit.ly、tinyurl.com、adf.ly 等）因为被滥用类订阅源收录而被整域屏蔽，
通过这些服务分享普通链接会失效——这是审计日志中记录的刻意决定，不是悄悄发生的副作用。

## 快速开始

订阅原始文件：

```
https://raw.githubusercontent.com/LucentDNS/dns-shield/main/dist/dns-shield.txt
```

> 如果你在自己的其他账号下发布，请把此处的 `LucentDNS/dns-shield`、下方 issue 链接里的地址，
> 以及构建时的 `DNS_SHIELD_HOMEPAGE` 一并改掉，这样成品头部才会指向正确位置。

### AdGuard Home

1. 打开管理面板，进入 **Filters → DNS blocklists**。
2. 点击 **Add blocklist**，再点击 **Add a custom list**。
3. 命名为 `DNS Shield`，把上面的 URL 粘贴到列表地址栏并保存。
4. AdGuard Home 会按你为屏蔽列表配置的周期自动刷新。

### 列表是如何保持更新的

订阅地址永远不变，它背后的文件由 `.github/workflows/build.yml` 重建，**每天 03:17 UTC（北京时间
11:17）**跑一次。刻意避开整点：GitHub 的定时 runner 在 `:00` 极度拥塞，启动延迟是定时任务被跳过
最常见的原因。你也可以在 **Actions** 页面手动点 **Run workflow** 触发一次，并可勾选强制重新下载
全部源。

如果一次运行发现内容没有变化，它什么都不发布：最后一步会比较重建结果，只有真的不同才提交。另外
两点在你依赖它时很重要：

- **它绝不会发布未经校验的列表。** 审计、覆盖率对账、回归预算都在提交步骤之前运行，一旦回归就以
  非零码退出，因此构建失败只会让昨天的文件继续留在这里，而不会把你的解析器换成一个更糟的版本。
- **闸门也会在可能破坏它的那次推送里跑。** 任何改动 `tools/`、`data/`、`package.json`、`LICENSE`、
  `THIRD-PARTY-NOTICES.md` 或工作流自身的提交，都会再跑一次 `npm run verify`。这样，破坏了署名、
  覆盖率或规则语法的改动会在它自己的那次运行里失败，而不是等到第二天早上的定时构建才发现——那时
  它已经上线了。
- **文件头部是可复现的。** `! List revision:` 是所有源文件正文的摘要，`! Last modified:` 取自上游
  `Last-Modified` 而不是当前时钟，所以 `dist/stats.json` 里的哈希对应的就是你实际下载到的那份字节，
  而不是它被重新构建的时刻。

决定这份列表长什么样的一切都在仓库里，并且能在 diff 中逐行审查：[`ARCHITECTURE.md`](ARCHITECTURE.md)
讲了各个阶段，[`SOURCES.md`](SOURCES.md) 讲了每个源以及各自的风险，
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) 讲了它们归谁所有。

唯一没法放进 diff 的是仓库页面上那个 About 栏。如果你在维护自己的副本，可以运行
`node tools/github-metadata.js` 看它会写入什么，加 `--apply` 真正写入（令牌通过 `GITHUB_TOKEN`
提供）；它同时会关掉 wiki——因为文档的第二份副本，就是一份迟早会和数据对不上的副本。

GitHub 会停用「连续 60 天无任何活动」的仓库里的定时工作流；每日提交本身就是活动，所以只有当上游所有
源整整两个月都没动静时这条才会生效。

### 信任它之前，先检查你的白名单

AdGuard Home 是**用白名单过滤器去覆盖黑名单**的。你安装的任何白名单里只要有一条 `@@` 规则，就能
穿透本列表——不管当前启用了哪几条黑名单；而且**关掉黑名单并不会关掉白名单**。一个实测数字：
HaGeZi's Allowlist Referral（用来让联盟/返利链接能正常跳转的那条）会从本列表中释放 272 个主机名、
覆盖 249 个可注册域，其中包含 `adjust.com`、`appsflyer.com`、`a9.com`、`ad.doubleclick.net`、
`adform.net` 和 `amazon-adsystem.com`。

两个工具把这件事从"看不见"变成"看得见"：

```bash
node tools/whitelist-impact.js <白名单文件>   # 这条白名单开出了多少个洞？
node tools/referral-gaps.js                   # 生成带注释的 REFERRAL-GAPS.md
```

`REFERRAL-GAPS.md` 按可注册域分组列出每一个被释放的主机名，并对属于广告/归因基础设施的那些加上
说明，同时列出覆盖了拦截项的通配符规则。如果你只是想让某个返利域名可用，更稳妥的做法是把你自己的
解析器用户规则里加上那一个主机，而不是安装一条会释放几百个追踪器的白名单：

```yaml
user_rules:
  - '@@||adjust.com^'   # 只有在你确实需要 Adjust SDK 能解析时才加
```

### AdGuard DNS 与 AdGuard 应用

在产品支持“按 URL 订阅过滤器”的地方把这个地址添加为自定义过滤器列表即可：在 AdGuard DNS 面板中，
或在 AdGuard 桌面端与移动端的 **Settings → Filters → Custom filters** 中。由于本列表只使用 DNS
语法，你得到的是 DNS 层屏蔽；AdGuard 浏览器扩展所做的那种外观元素隐藏不属于本列表的功能。

### Pi-hole

Pi-hole 的 gravity 需要 hosts 格式（`0.0.0.0 domain`），因此先转换文件：

```bash
sed -e '/^!/d' -e '/^@@/d' -e 's/^||\(.*\)\^$/0.0.0.0 \1/' dns-shield.txt > dns-shield.hosts
```

让 Pi-hole 指向生成的 `dns-shield.hosts`（作为本地列表，或通过 HTTP 提供该文件），然后用
`pihole -g` 重新运行 gravity。

转换时丢弃 `@@||domain^` 行不会有任何损失：构建过程拒绝把同一个域名同时写入两个区段，因此所有
例外域名本来就不在屏蔽区段中，去掉之后它们只是保持不被屏蔽。

### 通用 `||domain^` 客户端（dnsmasq、blocky）

能够识别 AdGuard / DNS 域名规则的客户端（例如 blocky）可以直接指向该文件或该 URL。dnsmasq
不识别这种语法，请像 Pi-hole 那样转换，并把结果作为额外的 hosts 文件加载：

```bash
sed -e '/^!/d' -e '/^@@/d' -e 's/^||\(.*\)\^$/0.0.0.0 \1/' dns-shield.txt > dns-shield.hosts
```

```conf
addn-hosts=/etc/dnsmasq.d/dns-shield.hosts
```

需要留意：516,987 行的 `addn-hosts` 文件对 dnsmasq 来说负担很重，因为它会把 hosts 条目常驻内存
——小型软路由上适用同样的内存顾虑。

## 它屏蔽什么，以及刻意不做什么

它在 DNS 层屏蔽：广告服务器与广告交易平台；跟踪、分析归因端点；遥测上报；移动应用内广告与分析
SDK；挖矿域名；钓鱼、恶意软件分发与诈骗域名；以及中国大陆特有的遥测与广告 SDK 层。

它刻意**不**做这些事：

- 不做外观过滤——没有元素隐藏规则，因为这里根本没有页面可以修改；
- 不含脚本注入规则、`$modifier`、通配符或正则规则——只要这类形式进入文件，审计就会让构建失败；
- 不绕过 HTTPS 或 DNS-over-HTTPS——它只回答 DNS 查询，所以自带 DoH/DoT 解析器、或直接连接硬编码
  IP 的应用完全不受影响；
- 不提供客户端内容规则——这是解析器侧的列表，不是浏览器扩展过滤器；
- 不过滤成人内容——它组合的订阅源中不含成人列表，需要该功能的订阅者请自行把相应订阅源加入自己的
  解析器。

## 误报处理

如果本列表导致某个网站或应用异常，请反馈，而不是默默忍受。

1. **提交反馈。** 在 <https://github.com/LucentDNS/dns-shield/issues> 开一个 issue，说明被屏蔽的
   主机名、出问题的网站或应用，以及解析器日志中记录的查询。带上准确主机名的反馈在上游是最容易被
   快速修复的。
2. **或者本地自行修复**，编辑 `data/whitelist.txt`。两种语法，刻意区分：

   ```
   domain.com     # 只放行这个主机名，其子域名仍然被屏蔽
   @domain.com    # 放行整棵子树：该主机名及其所有子域名
   ```

   `@` 很粗暴——它会连该域名下所有跟踪子域名一起放行。只有在某项服务确实会在不可预测的子域名之间
   切换端点时才使用它。个人条目请加在文件末尾的 `PERSONAL` 区块下。之后重新构建并重新运行审计。

### 不要编辑 `data/never-whitelist.txt`

`data/never-whitelist.txt` 是**保护集**（93 个域名），不是建议清单。构建过程会按设计拒绝：

- 任何指名受保护域名的精确白名单规则；
- 任何包含受保护域名的整树规则——这些受保护主机会在之后被重新写回（在参考构建中，白名单阶段放行了
  2,860 个域名，随后有 86 个受保护域名因此被重新拉回屏蔽）；
- 任何指名、或位于受保护域名之下的上游例外规则（参考构建中拒绝了 2 条形如指名受保护域名的例外，
  以及另外 12 条被保护集覆盖的例外）。

白名单正是过滤列表悄悄失去价值的地方：只要一条规则放行了跟踪器，整层保护就变得毫无意义。因此，
要求解除其中某个跟踪器属于**按设计拒绝，而不是疏忽**。如果你确实需要访问其中某个域名，那等于要求
关掉本项目唯一的保证；正确的做法是修改你自己的解析器规则，而不是这个文件。`data/extra-block.txt`
同理，它固定了上游只以“例外规则”形式发布的三个主机名——`pagead2.googlesyndication.com`、
`log.mmstat.com` 和 `sax.sina.com.cn`。处理误报请改 `data/whitelist.txt`，绝不要从保护集里删行。

## 仓库结构

- `package.json` — npm 脚本（`fetch`、`build`、`audit`、`gap`、`benchmark`、`stats`、`sources`、
  `pipeline`、`verify`、`referral-gaps`、`whitelist-impact`，以及用于实机验证的 `live` /
  `clean:live`）与 `@adguard/hostlist-compiler` 开发依赖；要求 Node.js `>= 20`。
- `tools/sources.js` — 订阅源目录：共 27 项，即 24 个屏蔽类订阅源（二十个单一主题源加四份聚合覆盖
  清单）、AdGuard 的两份策略源，以及一个仅供参照、只抓取绝不参与编译的白名单源。每项都记录了
  URL 顺序、更新频率，以及中英双语的风险说明。
- `tools/fetch.js` — 带逐源重试与镜像地下载目录中的订阅源，并把每个订阅源规范化为
  `.cache/sources/<id>.txt` 中每行一个主机名。
- `tools/build.js` — 构建流水线：编译屏蔽源，然后依次应用排除层、守卫层、白名单层、保护集层和
  例外层，最后输出列表与 `dist/build.log`。
- `tools/audit.js` — 九个部分（语法、整洁性、必须屏蔽、必须可达、共享顶级域名、两用服务、白名单
  影响、永不白名单保护集、无效白名单条目），另有一道署名闸门：某个订阅源被编入产物却没有登记在
  `THIRD-PARTY-NOTICES.md` 里，构建即失败；写出 `dist/audit.log`，任何一项失败都以非零状态退出。
- `tools/coverage-gap.js` — 解释本列表未收录的每一条同类规则，把它归入“符合预期”或“缺陷”，并让
  推导出的规则集与发布文件对账；存在缺陷时以非零状态退出。
- `tools/benchmark.js` — 以四份同类列表和 AdGuard 例外尺子为基准，测量覆盖率与过度屏蔽；
  写出 `dist/benchmark.txt`。
- `tools/ci-regression.js` — 把新构建与上一次发布的成品对比，规则数、例外数或体积出现不合理的
  大幅摆动时直接失败。
- `tools/write-stats.js` — 从发布文件写出 `dist/stats.json`（计数、体积、订阅源数、SHA-256），
  让 CI、提交信息与回归检查用的是同一组数字。
- `tools/gen-sources-doc.js` — 根据目录生成 `SOURCES.md` 与 `SOURCES.zh-CN.md`。
- `tools/agh-live-check.js`、`tools/agh-toggle.js`、`tools/dns-probe.js`、`tools/serve-dist.js`、
  `tools/cleanup-live-check.js` — 实机验证工具组：通过 HTTP 提供 `dist/`，用 API 驱动一个
  AdGuard Home，做真实查询，最后清理。不属于常规构建流程。
- `tools/whitelist-impact.js` — 给定一个白名单文件，报告它会释放多少条被拦主机名、哪些可注册域
  因此失去保护。白名单文件与列表文件都可指定，因此可以在安装某条外部白名单**之前**先评估它。
- `tools/referral-gaps.js` — 针对 HaGeZi's Allowlist Referral 生成带注释的 `REFERRAL-GAPS.md`；
  加 `--check` 只校验文档是否最新，不写文件。
- `tools/github-metadata.js` — 那个由 GitHub 而非仓库保存的 About 栏：描述、主页、topics，以及
  wiki/discussions 两个开关。默认只做预演；它是唯一会改动仓库设置的工具，因此也是唯一不由 CI 运行的。
- `data/whitelist.txt` — 私有白名单，参考构建中为 69 条精确条目和 286 条整树条目。
- `data/never-whitelist.txt` — 保护集，93 个任何白名单都不得放行的域名。
- `data/guards.txt` — 135 个共享基础设施顶级域名；只放行顶级域名本身，子域名不放行。
- `data/private-exclusions.txt` — 13 条项目级排除项（`localhost`、`invalid`、`onion` 等保留名与
  反向解析域），在白名单阶段之前生效。
- `data/extra-block.txt` — 人工补丁文件，3 条规则。
- `dist/dns-shield.txt` — 发布产物：516,987 条屏蔽规则、19 条例外规则、11.21 MiB。
- `CONTRIBUTING.md` — 误杀怎么报（最有价值的一类反馈），某个主机名该写进哪个 `data/` 文件。
- `SECURITY.md` — 在一个"只有数据、没有可执行代码"的项目里，什么算安全问题，以及如何私下报告。
- `CHANGELOG.md` — 工具链、策略文件与文档的变更。每日产物不记流水账：列表内部的
  `! List revision:` 就是它的身份标识。
- `THIRD-PARTY-NOTICES.md` — 每个订阅源归谁所有、采用什么许可证，以及那一条禁止商业使用的源。
  某个源没有登记在这里，`tools/audit.js` 会让构建失败。
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1。
- `.github/ISSUE_TEMPLATE/` — 误杀与漏拦两个表单。它们只问四件事，因为缺任何一件都无法着手排查。
- `.github/workflows/build.yml` — 每日构建。它对本地和线上跑的是同一道闸门：任何可能改变判定结果的
  推送都会再跑一次 `npm run verify`。
- `REFERRAL-GAPS.md` — 自动生成：一条白名单过滤器会从发布文件中释放哪些域名。
- `dist/build.log`、`dist/audit.log`、`dist/benchmark.txt`、`dist/stats.json` — 参考构建产生的日志与
  统计摘要。
- `dist/.compiled.raw` — 编译器的中间输出，供 `--no-compile` 复用。
- `.cache/sources/` — 27 个已缓存的订阅源，每行一个主机名；所有网络输入只落在这里。

### 想查什么，看哪份文档

| 问题 | 文档 |
| --- | --- |
| 怎么安装、怎么自查？ | 本文件 |
| 它是怎么一层层编译出来的？ | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| 用了哪些订阅源，每一份的风险是什么？ | [`SOURCES.zh-CN.md`](SOURCES.zh-CN.md)（英文：[`SOURCES.md`](SOURCES.md)） |
| 装上一条白名单过滤器会释放掉什么？ | [`REFERRAL-GAPS.md`](REFERRAL-GAPS.md) |
| 跟那些流行清单比，它是什么水平？ | [`dist/benchmark.txt`](dist/benchmark.txt) |
| 某个主机名坏了，该改哪里？ | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| 什么算本项目的安全问题？ | [`SECURITY.md`](SECURITY.md) |
| 每个订阅源归谁、什么许可证？ | [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) |
| 工具链改了什么？ | [`CHANGELOG.md`](CHANGELOG.md) |
| 参与者的行为规范是什么？ | [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) |

## 自行构建

环境要求：Node.js 20 或更高版本（见 `package.json`）。参考构建运行于 Node v24.21.0
（见 `dist/build.log`）。

```bash
npm install
node tools/fetch.js          # 冷启动约需 10 分钟：26 个订阅源，含重试与镜像
node tools/build.js          # 命中缓存约需 30 秒（参考值 31.6 秒，其中编译占 19.0 秒）
node tools/audit.js          # 必须以 "failures 0" 结束
node tools/coverage-gap.js   # 必须让推导出的规则集与发布文件对账一致
node tools/benchmark.js      # 刷新 dist/benchmark.txt；需要能访问同类列表的网络
node tools/write-stats.js    # 根据刚构建的列表刷新 dist/stats.json
node tools/referral-gaps.js  # 刷新 REFERRAL-GAPS.md；加 --check 则只校验不写
```

`npm run pipeline` 会依次执行 fetch、build、audit、coverage-gap、benchmark、订阅源文档生成、统计
和返利漏洞报告。`tools/fetch.js` 只认 `--force`：它的默认行为本来就是复用任何大于 20 字节的缓存
文件，因此并没有 `--missing` 这个参数。`node tools/build.js --no-compile` 复用
`dist/.compiled.raw`；`node tools/build.js --out <path>` 把列表写到其他位置。

发布文件是字节可复现的，而且头部两行让这件事可以被验证，而不只是一句声明。`! List revision:`
是对构建所消费的每一份 feed 正文求出的摘要——两台机器拿着同一批 feed 就会算出同一个 revision，
`dist/stats.json` 里的 `sha256` 也就能拿来核对你下载到的那份文件。`! Last modified:` 同样不是墙上
时间：它是上游真正声明过的最新 `Last-Modified`（27 个源里有 16 个会返回）。服务器不返回该头部的
源**不贡献任何日期**，它们的变化只由 revision 那一行体现——这样列表就不会写上一个它的上游从未
声明过的日子。需要固定值时，可以设置 `SOURCE_DATE_EPOCH`，或运行
`node tools/build.js --stamp <iso|epoch>`。

冷启动与热构建的差别完全在抓取阶段。命中缓存的构建不访问网络：`tools/build.js` 让
`hostlist-compiler` 读取缓存文件，因此上游停更的订阅源只会被“报告出来”，而不会让整次构建崩掉。
但报告的口气取决于这个源：如果它是列表赖以构建的源，构建会**拒绝发布**——用同一个名字发布一份更窄
的列表，比继续用昨天的文件更糟。两个 abuse.ch 的 URLhaus 源被标记为 `optional: true`，因为少一份
源只会让列表更窄、绝不会让它变错，而上游不稳定时否则就会给一个成品完全正常的仓库挂上红叉。缓存为空
或过期时，请先运行 `tools/fetch.js`。

### 用真实解析器验证

前面的静态检查只是把规则文本与规则文本对比。`tools/agh-live-check.js` 更进一步：它会问一个正在
运行的 AdGuard Home，浏览器真正查询的主机名到底有没有被过滤。它需要一台一次性实例监听
`127.0.0.1:13000`（DNS 在 `15353`），并由 `tools/serve-dist.js` 在 8123 端口本地提供清单；
完整步骤见 `ARCHITECTURE.md` 的 “Live verification” 一节。通过 `AGH_BASE`、`AGH_USER` 可以指向
任意实例，实例口令要通过环境变量 `AGH_PASS` 提供（PowerShell 用
`$env:AGH_PASS = Read-Host -AsSecureString`，POSIX shell 用 `export AGH_PASS=...`）。这两个面向
AdGuard 的工具**刻意不设默认口令**：本仓库是公开的，写进仓库的凭据即使以后被删掉，历史里任何人都
仍然读得到——所以缺少口令时它们会直接退出并给出提示，而不是自己猜一个。
`node tools/cleanup-live-check.js` 负责事后清理临时文件。

有三个与具体机器相关的开关值得了解：

- `tools/build.js` 默认从全局 npm 路径解析 `@adguard/hostlist-compiler`。执行 `npm install`
  之后，请改为指向本地副本——PowerShell：
  `$env:HOSTLIST_COMPILER="$PWD\node_modules\@adguard\hostlist-compiler\src\index.js"`，cmd：
  `set HOSTLIST_COMPILER=%CD%\node_modules\@adguard\hostlist-compiler\src\index.js`。
- `DNS_SHIELD_HOMEPAGE`、`DNS_SHIELD_NAME` 和 `DNS_SHIELD_VERSION` 会被写入输出文件的头部。
  默认主页为 `https://github.com/LucentDNS/dns-shield`；发布前请把 `DNS_SHIELD_HOMEPAGE` 设为
  真实的仓库地址，让头部信息告诉订阅者这份列表的实际位置。
- `tools/fetch.js` 和 `tools/benchmark.js` 会优先使用本地解析器 `127.0.0.1` 和 `192.168.3.1`，
  失败后才回退到系统解析器。如果你的网络不同，请修改这两个文件中的 `DNS_SERVERS` 常量。

## 已验证的环境

本列表端到端验证过的环境只有一个：一台 Windows 机器上的 AdGuard Home（管理界面
127.0.0.1:3000，DNS 使用 53 端口）、Node v24.21.0，参考构建与基准测试日期为 2026-10-07。
2026-10-07 当天，发布产物还被装入一台隔离的 AdGuard Home v0.107.79 做了真实查询：25 个探针
主机名中有 21 个在 DNS 层被过滤，且 AdGuard 自身的规则归因对每一个都指出了预期的规则；能够正常
解析的 4 个都是有意放行（`github.io` 属于基础设施保护、`www.qq.com` 与
`raw.githubusercontent.com` 属于白名单、`sentry.io` 则不在任何订阅源中）。

它**没有**在未经验证的硬件上测试过：验证范围不包含任何软路由、手机、Pi-hole 或 dnsmasq 部署。
对这些平台而言，被验证的只是语法——审计证明每条规则都是 `||domain^` 或 `@@||domain^`，没有字面
IP 规则、没有通配符、没有修饰符，且为纯 ASCII，正因如此，快速开始里的 hosts 转换才是一步机械
操作，而不是一次赌博。

### 一次真实部署带来的教训

随后本列表在同一台机器上正式投用，作为**唯一启用**的黑名单，原有的五条黑名单全部关闭。同样的 25
个主机名再次对真实解析器做了探测，其中一个的表现与隔离测试不同：`app.adjust.com` 没有被拦而是正常
解析。AdGuard Home 的 `check_host` 用一行给出了原因——

```
reason=NotFilteredWhiteList   rule=@@||app.adjust.com^
```

——它指出的那条例外**并不在发布文件里**（`grep -F '@@||app.adjust.com^'` 在那里找不到任何东西；构建
日志显示的恰恰相反：`refused 12 upstream exception(s) covered by the never-whitelist`）。这条规则
来自一条已安装的**白名单过滤器** HaGeZi's Allowlist Referral，它的用途是让联盟/返利链接能正常跳转。
那是一个独立的开关：关掉全部黑名单并不会关掉它，而它会从本列表中释放 272 个主机名。

关掉它之后，探测结果是 25 个中 22 个被过滤，3 个正常解析均为有意放行。这个教训比修复本身更有价值：
在解析器上，**黑名单并不是故事的全部**——在下结论说列表没生效之前，先用
`tools/whitelist-impact.js` 审计一遍你的白名单。

## 许可协议

GPL-3.0 —— 已在 `package.json`、`dist/dns-shield.txt` 的文件头中声明，并以 `LICENSE` 文件形式
放在仓库根目录。每个上游订阅源保留自己的许可证，并在 `tools/sources.js` 中注明出处。
