# Contributing

Thanks for taking the time. This project is a **data project with a verification harness**, so most
useful contributions are not code.

## The most valuable contribution: a false-positive report

A blocklist is judged by what it breaks. If this list blocks something you need, that is the single
most useful thing you can tell us.

Please open an issue and include:

1. **The hostname** that broke, exactly as the browser or app requested it.
2. **What broke** — the site, the app, the feature, the error you saw.
3. **The rule that fired**, if you can get it. In AdGuard Home: Query log → the blocked entry →
   it names the filter and the rule. With the API:
   `curl "http://127.0.0.1:3000/control/filtering/check_host?name=<host>" -u admin:...`
   The answer names the rule text and its `filter_list_id`.
4. **Whether the host is a telemetry or advertising endpoint** as far as you can tell. A host that
   is *only* used for tracking will be refused even if a site breaks, because
   `data/never-whitelist.txt` protects it on purpose. `sax.sina.com.cn` and `log.mmstat.com` are the
   two standing examples, and both are documented.

Two things to know before reporting:

- The list is a union of upstream feeds. A host that should never have been in any feed usually
  belongs in the upstream project's tracker; we will point you there rather than carry a local patch
  forever.
- Some blocks are deliberate even though they break ordinary use — fourteen dual-use URL shorteners
  and DNS providers are blocked whole because abuse feeds carry them. `dist/audit.log` records this
  as a standing warning. A report about `bit.ly` is a known tradeoff, not news.

## Adding a domain deliberately

Four small files under `data/` are hand-maintained. Each has a specific purpose, and using the wrong
one is worse than not contributing:

| File | Use it for | Effect |
| --- | --- | --- |
| `data/never-whitelist.txt` | A tracking/telemetry host that no whitelist may ever release | Re-applied **after** the whitelist stage |
| `data/extra-block.txt` | A host upstream only publishes in a shape that normalisation drops | Added to the final set |
| `data/guards.txt` | A shared CDN/hosting **apex** whose subdomains must stay blocked when the apex is released | The apex is allowlisted, its subdomains are not |
| `data/whitelist.txt` | A host or tree that should be released (`@parent.com` releases the whole tree) | Applied before the never-whitelist stage |
| `data/private-exclusions.txt` | Reserved names that must never become rules (`localhost`, `invalid`, `onion`, reverse-DNS zones — 13 entries) | Merged into the upstream exclusion set before the whitelist stage |

A contribution that adds a host to `data/whitelist.txt` when it should be in
`data/never-whitelist.txt` (or the reverse) will be asked to move.

## Changing a feed

`tools/sources.js` is the catalogue: one entry per feed with its URL, layer, refresh cadence, and a
risk note in both English (`risk`) and Chinese (`riskZh`). Two rules:

- **Never add an entry without a `risk` note and a `riskZh` note.** The risk note is what tells a
  future reader what goes wrong when this feed goes bad. `SOURCES.md` and `SOURCES.zh-CN.md` are
  generated from it; run `node tools/gen-sources-doc.js` and commit the regenerated files.
- **Mark a feed `optional: true` only when a missing feed makes the list narrower but never wrong.**
  A required feed that fails to download makes the build refuse to publish, by design: silently
  publishing a narrower list under the same name is the worst failure mode this project has.

## Before you open a pull request

```
node tools/fetch.js        # cache the feeds (network input lands only in .cache/sources/)
node tools/build.js        # compile dist/dns-shield.txt
npm run verify             # audit + coverage reconciliation + benchmark + referral report check
```

Every one of those must exit 0. `tools/audit.js` failing means the change breaks a documented
property of the list — read its message rather than loosening the check. If your change is to a
script, say in the PR what you ran and what it printed.

Do **not** hand-edit `dist/`. It is generated, and CI rebuilds and republishes it. A PR that only
changes generated files under `dist/` will be closed in favour of the next CI run.

## Style

- Comments explain **why**, not what. A rule that looks arbitrary needs the reason next to it.
- No new dependency without a sentence explaining why the existing ones cannot do the job. The only
  dependency is `@adguard/hostlist-compiler`.
- Documentation is bilingual by convention: `README.md` / `README.zh-CN.md`, `SOURCES.md` /
  `SOURCES.zh-CN.md`. A change to one is expected to update the other.
- Secrets never go into the repository, not even in a test fixture. The two AdGuard helper scripts
  read `AGH_PASS` from the environment and have no fallback, on purpose.

## Licence

By contributing you agree that your contribution is licensed under the GPL-3.0, the licence of this
repository (`LICENSE`). Upstream feeds keep their own licences — see `SOURCES.md`.
