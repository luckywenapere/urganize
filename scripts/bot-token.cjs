#!/usr/bin/env node

// Prints a short-lived (1 hour) token for the Urganize Bot GitHub App, so the
// bot can open pull requests that Oyin then reviews. GitHub does not let you
// approve your own pull request, which is why the bot opens them.
//
// Usage: GH_TOKEN=$(node scripts/bot-token.cjs) gh pr create ...
//
// Reads ~/.config/urganize-bot/config.json: { "appId": 123, "installationId": 456 }
// and the private key at ~/.config/urganize-bot/private-key.pem. Both stay off
// the repo. installationId is optional; without it the first install is used.

const { createSign } = require('crypto');
const { readFileSync } = require('fs');
const os = require('os');
const path = require('path');

const configDir = process.env.URGANIZE_BOT_DIR || path.join(os.homedir(), '.config', 'urganize-bot');

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function appJwt(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  // Backdated 60s for clock drift; GitHub caps the lifetime at 10 minutes.
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(appId) }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${base64url(signer.sign(privateKey))}`;
}

async function github(method, url, jwt) {
  const response = await fetch(`https://api.github.com${url}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${jwt}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function main() {
  const config = JSON.parse(readFileSync(path.join(configDir, 'config.json'), 'utf8'));
  const privateKey = readFileSync(path.join(configDir, 'private-key.pem'), 'utf8');
  const jwt = appJwt(config.appId, privateKey);

  let installationId = config.installationId;
  if (!installationId) {
    const installations = await github('GET', '/app/installations', jwt);
    if (installations.length === 0) throw new Error('Urganize Bot is not installed on any repository yet.');
    installationId = installations[0].id;
  }

  const { token } = await github('POST', `/app/installations/${installationId}/access_tokens`, jwt);
  process.stdout.write(token);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
