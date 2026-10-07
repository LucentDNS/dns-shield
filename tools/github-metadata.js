#!/usr/bin/env node
/**
 * Set the GitHub-side metadata that cannot live in the repository: the About box.
 *
 * `description`, `homepage` and `topics` are stored by GitHub, not by files, so unlike every other
 * property of this project they cannot be reviewed in a pull request or caught by `npm run verify`.
 * GitHub's own startup checklist calls the description and topics the difference between a
 * repository people find and one nobody opens; leaving them blank is the one piece of housekeeping
 * a maintainer has to do outside git.
 *
 * Two fields are not About-box text and are worth stating explicitly:
 *
 *   has_wiki=false          The wiki is a second, unreviewed copy of the documentation, and a
 *                           blocklist's documentation has to be reviewable in the same diff as the
 *                           data it describes. Every install instruction is already in README.md.
 *   has_discussions=false   Discussions fragment answers away from issues, where the false-positive
 *                           and missed-block templates do the work of asking the right questions.
 *
 * Usage:
 *   set GITHUB_TOKEN=...        (fine-grained token with "Administration: read and write", or a
 *                                classic token with the `repo` scope; it must be able to edit
 *                                repository settings, which is why CI does not run this)
 *   node tools/github-metadata.js            # show what would change
 *   node tools/github-metadata.js --apply    # write it
 *
 * Optionally override the repository with GITHUB_REPOSITORY=owner/name.
 */

'use strict';

const https = require('https');

const REPO = process.env.GITHUB_REPOSITORY || 'LucentDNS/dns-shield';
const TOKEN = process.env.GITHUB_TOKEN;
const APPLY = process.argv.includes('--apply');

const DESCRIPTION =
  'A DNS blocklist for ads, trackers, telemetry, phishing, malware and scams - 27 upstream feeds ' +
  'compiled into one plain AdGuard-format file, rebuilt daily with every rule attributed.';

const HOMEPAGE = `https://github.com/${REPO}`;

const TOPICS = [
  'adguard',
  'adguard-home',
  'dns-blocklist',
  'dns-filter',
  'blocklist',
  'adblock',
  'pi-hole',
  'tracking-protection',
  'malware-domains',
  'phishing-protection',
  'privacy',
  'hosts-file',
];

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const headers = {
      accept: 'application/vnd.github+json',
      'user-agent': 'dns-shield-metadata',
      'x-github-api-version': '2022-11-28',
    };
    if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
    if (payload) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(payload.length);
    }
    const req = https.request({ hostname: 'api.github.com', path, method, headers, timeout: 30000 }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = null;
        }
        resolve({ status: res.statusCode, json: parsed, text });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timed out after 30s')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function say(line) {
  process.stdout.write(line + '\n');
}

async function main() {
  const current = await request('GET', `/repos/${REPO}`);
  if (current.status !== 200) {
    say(`cannot read ${REPO}: HTTP ${current.status}`);
    say(current.json && current.json.message ? current.json.message : current.text.slice(0, 200));
    process.exit(1);
  }

  const repo = current.json;
  say(`repository ${repo.full_name} (${repo.visibility})`);
  say('');
  say('current:');
  say(`  description    ${repo.description === null ? '(empty)' : JSON.stringify(repo.description)}`);
  say(`  homepage       ${repo.homepage === null ? '(empty)' : JSON.stringify(repo.homepage)}`);
  say(`  topics         ${repo.topics && repo.topics.length ? repo.topics.join(', ') : '(none)'}`);
  say(`  has_wiki       ${repo.has_wiki}`);
  say(`  has_discussions ${repo.has_discussions}`);
  say(`  license        ${repo.license ? repo.license.spdx_id : '(not detected)'}`);
  say('');
  say('target:');
  say(`  description    ${JSON.stringify(DESCRIPTION)}`);
  say(`  homepage       ${JSON.stringify(HOMEPAGE)}`);
  say(`  topics         ${TOPICS.join(', ')}`);
  say('  has_wiki       false   (documentation belongs in the repository, not in a second copy)');
  say('  has_discussions false  (reports belong in the issue templates, which ask the right questions)');
  say('');

  if (repo.license === null) {
    say('NOTE  GitHub has not detected a licence. That is decided by files in the repository, so if');
    say('      it stays empty the cause is LICENSE missing from the default branch, not this script.');
  }

  if (!APPLY) {
    say('dry run - nothing written. Re-run with --apply to write it.');
    return;
  }

  if (!TOKEN) {
    say('GITHUB_TOKEN is not set, so the write cannot be attempted.');
    say('Create a token that may edit repository settings (fine-grained: Administration read and');
    say('write; classic: repo scope) and set it for this shell only:');
    say('  $env:GITHUB_TOKEN = "..."      # PowerShell');
    say('  export GITHUB_TOKEN=...        # sh');
    process.exit(2);
  }

  const patch = await request('PATCH', `/repos/${REPO}`, {
    description: DESCRIPTION,
    homepage: HOMEPAGE,
    has_wiki: false,
    has_discussions: false,
  });
  say(`PATCH /repos/${REPO} -> HTTP ${patch.status}`);
  if (patch.status !== 200) {
    say(patch.json && patch.json.message ? patch.json.message : patch.text.slice(0, 300));
    process.exit(1);
  }

  // Topics are a separate endpoint and replace the whole list, so they are sent as one call.
  const topics = await request('PUT', `/repos/${REPO}/topics`, { names: TOPICS });
  say(`PUT /repos/${REPO}/topics -> HTTP ${topics.status}`);
  if (topics.status !== 200) {
    say(topics.json && topics.json.message ? topics.json.message : topics.text.slice(0, 300));
    process.exit(1);
  }

  const after = await request('GET', `/repos/${REPO}`);
  say('');
  say('now:');
  say(`  description    ${JSON.stringify(after.json.description)}`);
  say(`  homepage       ${JSON.stringify(after.json.homepage)}`);
  say(`  topics         ${(after.json.topics || []).join(', ')}`);
  say(`  has_wiki       ${after.json.has_wiki}`);
  say(`  has_discussions ${after.json.has_discussions}`);
}

main().catch((err) => {
  say(`failed: ${err.message}`);
  process.exit(1);
});
