#!/usr/bin/env node
// Local test database (issue #862). LOCAL ONLY: every command here talks to the
// Docker container `supabase start` runs on this machine, never to production.
//
//   node scripts/local-db.mjs reset     wipe the local DB, then bootstrap + every migration + seed
//   node scripts/local-db.mjs migrate   apply bootstrap + every migration + seed to the running local DB
//   node scripts/local-db.mjs seed      re-run supabase/local/seed.sql only
//   node scripts/local-db.mjs from <file-prefix>   apply migrations from that file onwards (debugging)
//
// Why not plain `supabase db reset`: the CLI cannot apply supabase/migrations as
// it stands (ten version numbers are used twice, the first files alter tables
// production had before migrations existed, and 99999999_* must never run).
// Production never used the CLI's migration history either: migrations were
// applied by hand. So this applies them the way production got them, in file
// name order, with psql, after a local-only bootstrap. Migration files are
// never edited. See docs/notes/2026-10-29-local-test-environment.md.

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_DIR = join(ROOT, 'supabase');
const MIGRATIONS_DIR = join(SUPABASE_DIR, 'migrations');
const LOCAL_DIR = join(SUPABASE_DIR, 'local');
const CONTAINER = 'supabase_db_urganize-local';
const SKIP = /DO_NOT_APPLY/i;

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (result.status !== 0) {
    console.error(`\n✗ ${cmd} ${args.join(' ')} exited with ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

function assertLocalContainer() {
  const result = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER], { encoding: 'utf8' });
  if (result.status !== 0 || result.stdout.trim() !== 'true') {
    console.error(`The local database container ${CONTAINER} is not running. Run: pnpm db:local:start`);
    process.exit(1);
  }
}

function psqlFile(path, label) {
  const sql = readFileSync(path);
  const result = spawnSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-q', '-X', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  const noise = (line) => !line.trim() || /^(NOTICE|psql:.*NOTICE|DETAIL|HINT|WARNING|psql:.*WARNING)/.test(line.replace(/^psql:[^:]+:\d+:\s*/, ''));
  const errLines = (result.stderr || '').split(/\r?\n/).filter((line) => !noise(line));
  if (result.status !== 0) {
    console.error(`✗ ${label}\n${errLines.join('\n') || result.stderr}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

// Order by the version number before the first underscore, read as a
// timestamp: a short '20260602_' is 2 June 00:00, so it runs before
// '20260602010000_'. Plain name order would put the 14-digit one first, which
// breaks 20260602010000 (it needs artists.workspace_id from 20260602_). Ties
// (ten versions are used twice) fall back to the full name.
const versionKey = (name) => name.split('_')[0].padEnd(14, '0');

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => {
      const va = versionKey(a);
      const vb = versionKey(b);
      if (va !== vb) return va < vb ? -1 : 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
}

function applyAll(fromPrefix = null) {
  if (!fromPrefix) psqlFile(join(LOCAL_DIR, 'bootstrap.sql'), 'local bootstrap (supabase/local/bootstrap.sql)');
  let started = !fromPrefix;
  let applied = 0;
  for (const name of migrationFiles()) {
    if (!started && name.startsWith(fromPrefix)) started = true;
    if (!started) continue;
    if (SKIP.test(name)) {
      console.log(`- skipped ${name} (marked DO NOT APPLY)`);
      continue;
    }
    psqlFile(join(MIGRATIONS_DIR, name), name);
    applied += 1;
  }
  psqlFile(join(LOCAL_DIR, 'after-migrations.sql'), 'local fix-ups (supabase/local/after-migrations.sql)');
  console.log(`\nApplied ${applied} migrations.`);
  seed();
}

function seed() {
  psqlFile(join(LOCAL_DIR, 'seed.sql'), 'seed (supabase/local/seed.sql)');
}

const [command, arg] = process.argv.slice(2);
switch (command) {
  case 'reset':
    assertLocalContainer();
    // Migrations and seed are off in supabase/config.toml, so this only wipes
    // and recreates the local database (and the storage buckets).
    run('npx', ['-y', 'supabase@2', 'db', 'reset', '--local'], { cwd: ROOT });
    applyAll();
    break;
  case 'migrate':
    assertLocalContainer();
    applyAll();
    break;
  case 'from':
    assertLocalContainer();
    if (!arg) {
      console.error('Usage: node scripts/local-db.mjs from <migration-file-prefix>');
      process.exit(1);
    }
    applyAll(arg);
    break;
  case 'seed':
    assertLocalContainer();
    seed();
    break;
  default:
    console.log('Usage: node scripts/local-db.mjs <reset|migrate|seed|from <prefix>>');
    process.exit(command ? 1 : 0);
}
