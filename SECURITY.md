# Security policy

## What this repository is

This project publishes **data**, not executable code: one plain-text file of `||domain^` rules at
`dist/dns-shield.txt`, plus the small set of Node scripts under `tools/` that build and verify it.
There is no server, no runtime, no user accounts and no network service in this repository.

That shapes what "a security problem" means here:

| Class | Where to report it | In scope? |
| --- | --- | --- |
| A credential committed to this repository | Private report (below) | Yes — treat as urgent |
| Script-injection or path-traversal in `tools/` | Private report (below) | Yes |
| A rule that silently un-blocks a protected domain | Public issue | Yes, but not confidential |
| A false positive (a legitimate site blocked) | Public issue | Yes, but not confidential |
| A malicious domain the list misses | Public issue / upstream feed | Prefer the upstream project |

The most likely real-world impact of a bug here is not compromise but **a resolver that stops
protecting its users** — a rule that stops being emitted, a parse of an upstream feed that silently
drops entries, or a build that publishes a narrower list under the same name. Those are treated as
correctness bugs with a public issue, not as secrets.

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting**: the *Security* tab of
`https://github.com/LucentDNS/dns-shield` → *Report a vulnerability*. Do not open a public issue for
a credential leak or an exploitable defect in the scripts.

If private reporting is unavailable, open a public issue that says only "please contact me about a
security report" and nothing else, and a maintainer will follow up.

Useful content for a report:

- the commit or file and line the problem is in,
- what an attacker could do with it,
- whether it affects the published list, the build scripts, or only one machine's setup.

**Response window:** a best-effort acknowledgement within 5 working days. This is a
volunteer-maintained list, so no bounty program and no formal SLA is offered or implied.

## Known and accepted risks

These are public and deliberate, so they are not vulnerabilities:

- **Four aggregate lists are used as an input by decision** (OISD Big, HaGeZi's Pro, AdRules DNS
  List, AdGuard DNS filter). They are third-party data; see `ARCHITECTURE.md` and `SOURCES.md`. A
  problem with *their* content belongs in *their* tracker.
- **Some dual-use services are blocked whole**, including URL shorteners. `dist/audit.log` records
  this as a standing warning. It is a tradeoff, not a defect.
- **No credential has a default value in `tools/`.** `AGH_PASS` must be exported for the two
  AdGuard-facing helpers; they exit rather than guess. This is intentional and documented in the
  README.
- **The published list is data under GPL-3.0**, while each upstream feed keeps its own licence.
  Licensing is not a security matter; see `SOURCES.md` and `LICENSE`.
- **`tools/agh-toggle.js` and `tools/agh-live-check.js` default to `http://127.0.0.1:3000`.** They
  send the password as an HTTP Basic credential, so `AGH_BASE` should stay on loopback or a trusted
  LAN. If you point them at a remote instance, put HTTPS in front of it first.

## What a maintainer will do

1. Confirm the report and decide whether it affects the published list, the scripts, or neither.
2. For a credential: rotate it first, then decide on history rewriting. Note that a credential
   pushed to a public repository should be considered disclosed the moment it is pushed, even if the
   commit is later rewritten.
3. For a script defect: fix, add a regression check if one is possible, and reference the report in
   the commit message.
