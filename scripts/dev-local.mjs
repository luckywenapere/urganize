#!/usr/bin/env node
// Runs the web app against the LOCAL Supabase on http://localhost:3100 (issue #862).
//
//   pnpm dev:local
//
// Next.js always loads apps/web/.env.local, which points at PRODUCTION. Values
// already in the environment win over .env files, so this wrapper sets every
// key it finds in apps/web/.env*, plus every key the app reads for an outside
// service, to a local value or to an empty string before starting Next. Nothing
// from .env.local reaches the app, and the start is refused unless the
// Supabase URL is on this machine.
//
// Optional overrides (feature flags and the like, never production secrets):
// apps/web/.env.local-test, KEY=value lines (gitignored).

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'apps', 'web');
const PORT = process.env.LOCAL_TEST_PORT || '3100';
const APP_URL = `http://localhost:${PORT}`;

function parseEnvFile(path) {
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

function localSupabase() {
  const result = spawnSync('npx', ['-y', 'supabase@2', 'status', '-o', 'json'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const text = result.stdout || '';
  const start = text.indexOf('{');
  if (result.status !== 0 || start < 0) {
    console.error('Local Supabase is not running. Start it with: pnpm db:local:start');
    console.error(result.stderr || text);
    process.exit(1);
  }
  const status = JSON.parse(text.slice(start, text.lastIndexOf('}') + 1));
  return { url: status.API_URL, anon: status.ANON_KEY, service: status.SERVICE_ROLE_KEY };
}

// Every outside service the app can reach. Blank means "not configured", and
// each of these degrades to off in code: no PostHog, no Resend mail, no
// Paystack checkout, no AI (UrgAns falls back to its no-model mode), no Sentry.
const BLANK = [
  // Analytics and monitoring
  'NEXT_PUBLIC_POSTHOG_KEY', 'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'NEXT_PUBLIC_POSTHOG_HOST',
  'NEXT_PUBLIC_CLARITY_PROJECT_ID', 'NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS',
  'SENTRY_DSN', 'SENTRY_AUTH_TOKEN',
  // Email
  'RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET', 'EMAIL_FROM', 'EMAIL_REPLY_TO', 'BILLING_ALERTS_EMAIL',
  // Payments
  'PAYSTACK_SECRET_KEY', 'NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY',
  // AI
  'AI_API_KEY', 'AI_API_BASE', 'CHAPPI_API_KEY', 'CHAPPI_API_BASE', 'CHAPPI_MODEL',
  'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'EXA_API_KEY', 'AI_PLANNER_MODEL',
  // Other outside services
  'TRM_CLIENT_ID', 'TRM_CLIENT_SECRET', 'TRM_WEBHOOK_SECRET', 'TRM_API_BASE_URL',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'WHATSAPP_FROM', 'WHATSAPP_WEBHOOK_URL', 'WHATSAPP_KEY_SECRET',
  'LINEAR_API_KEY', 'ALTLINK_API_KEY', 'ALTLINK_WEBHOOK_SECRET', 'FCM_SERVICE_ACCOUNT_JSON',
  'WEB_PUSH_VAPID_PRIVATE_KEY', 'NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY',
  'DATABASE_URL', 'MCP_ACCESS_KEY',
];

const supabase = localSupabase();
const env = { ...process.env };

// 1. Blank every key any apps/web/.env* file sets, so none of it is used.
for (const name of readdirSync(WEB)) {
  if (!name.startsWith('.env') || name === '.env.local-test' || name.endsWith('.example')) continue;
  for (const key of Object.keys(parseEnvFile(join(WEB, name)))) env[key] = '';
}
for (const key of BLANK) env[key] = '';
for (const key of Object.keys(env)) if (key.startsWith('PAYSTACK_PLAN_')) env[key] = '';

// 2. Local values.
Object.assign(env, {
  NEXT_PUBLIC_SUPABASE_URL: supabase.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.anon,
  SUPABASE_SERVICE_ROLE_KEY: supabase.service,
  NEXT_PUBLIC_APP_URL: APP_URL,
  NEXT_PUBLIC_SENTRY_DSN: 'off',
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: 'local-test',
  NEXT_TELEMETRY_DISABLED: '1',
  CRON_SECRET: 'local-test-cron-secret',
  URGANIZE_LOCAL_TEST: '1',
});

// 3. Feature flags. Most flags are read as `=== 'true'` and are switched on in
// the Vercel production env, which this repo cannot read; with them unset the
// app 404s whole areas (Artists, the record page, Team). So every flag the code
// switches on with 'true' is on here (found by scanning apps/web), except the
// few that need an outside service or are known off in production. Flags the
// code reads as "on unless 'false'" stay unset, i.e. on. lib/cut-features.json
// still forces its list off (next.config.js gives it precedence). BEST GUESS at
// production, not a copy of it: override in apps/web/.env.local-test.
const FLAGS_OFF = new Set([
  'NEXT_PUBLIC_FEATURE_CARD_TRIAL', // off in production; needs Paystack
  'NEXT_PUBLIC_FEATURE_NATIVE_PUSH', // needs FCM
  'NEXT_PUBLIC_FEATURE_PUSH_PROMPT', // needs VAPID keys
  'NEXT_PUBLIC_FEATURE_URGANS_VOICE', // needs an AI key
]);
// Flags that are on in production but that the scan below cannot see, because
// the code reads them through a helper (trimmed and lowercased first) rather
// than `=== 'true'`. Without this the credits system is off locally, so plan
// allowances, the credit balance and anything paid for in credits (an AI pitch
// to a paid playlist) cannot be tested (#1271).
const FLAGS_ON = new Set([
  'NEXT_PUBLIC_FEATURE_URGANS_CREDITS', // on in production since v1.55.0; lib/credits/config.ts
]);
const flagPattern = /NEXT_PUBLIC_FEATURE_[A-Z0-9_]+(?=\s*===\s*'true')/g;
function scanFlags(dir, found) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) scanFlags(path, found);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      for (const match of readFileSync(path, 'utf8').match(flagPattern) || []) found.add(match);
    }
  }
  return found;
}
for (const dir of ['app', 'components', 'lib', 'stores']) {
  if (!existsSync(join(WEB, dir))) continue;
  for (const flag of scanFlags(join(WEB, dir), new Set())) env[flag] = FLAGS_OFF.has(flag) ? 'false' : 'true';
}
for (const flag of FLAGS_ON) env[flag] = 'true';

// 4. Optional overrides from apps/web/.env.local-test.
const overridePath = join(WEB, '.env.local-test');
if (existsSync(overridePath)) Object.assign(env, parseEnvFile(overridePath));

// 5. Refuse anything that is not local.
const host = (() => {
  try {
    return new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname;
  } catch {
    return '';
  }
})();
if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
  console.error(`Refusing to start: NEXT_PUBLIC_SUPABASE_URL is not local (${host || 'unset'}).`);
  process.exit(1);
}

console.log(`Local test app: ${APP_URL}  (Supabase ${supabase.url}, Studio http://127.0.0.1:54323, mail http://127.0.0.1:54324)`);
const child = spawn('pnpm', ['exec', 'next', 'dev', '--port', PORT], {
  cwd: WEB,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
