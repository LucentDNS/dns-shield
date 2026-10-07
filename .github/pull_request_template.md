<!--
One paragraph is usually enough. The two things worth saying explicitly:

1. What changed and why (a new feed, a policy file edit, a tool fix).
2. What you ran. `node tools/fetch.js` and `node tools/build.js` need to have been run, and
   `npm run verify` has to exit 0 - CI runs the same gate and will fail the pull request otherwise.

Do not hand-edit anything under dist/. Those files are build output; CI regenerates and commits
them. A pull request that edits dist/ by hand is closed rather than merged.
-->

## What changed

## Why

## Checks

- [ ] `node tools/build.js` exits 0
- [ ] `npm run verify` exits 0
- [ ] New feed entries carry both `risk` and `riskZh`, and a row in `THIRD-PARTY-NOTICES.md`
- [ ] No secrets, and nothing under `dist/` edited by hand
