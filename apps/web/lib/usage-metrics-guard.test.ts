import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Structural guards for the "last seen" ping and /admin/metrics (2026-10-07).
// They read the real source rather than trusting a comment. Comments are
// stripped before matching so prose cannot satisfy a check.

const ROOT = join(__dirname, '..');

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const posix = (path: string) => path.split(sep).join('/');

describe('the presence ping', () => {
  const source = stripComments(read('app/api/presence/route.ts'));

  it('is an open route, so a team on the wall or in read-only mode still counts as seen', () => {
    expect(source).toMatch(/getAuthenticatedUser\(request\)/);
    for (const gated of [
      'requireActiveAuthenticatedUser',
      'requireAuthenticatedAdmin',
      'requireActiveAccount',
      'requireActiveAuthenticatedUserOrInternal',
    ]) {
      expect(source, gated).not.toContain(gated);
    }
  });

  it('never answers 402, which the browser would turn into a redirect to the paywall', () => {
    expect(source).not.toMatch(/status:\s*402/);
  });

  it('is mounted once, in the app shell', () => {
    const shell = stripComments(read('components/app/AppShell.tsx'));
    expect(shell.match(/<PresenceBeacon \/>/g) ?? []).toHaveLength(1);
  });
});

describe('the metrics route', () => {
  const source = stripComments(read('app/api/admin/metrics/route.ts'));

  it('checks the admin list before it reads anything', () => {
    const gate = source.indexOf('verifyAdmin(request)');
    const read = source.indexOf('loadUsageMetrics(');
    const waitlist = source.indexOf('readWaitlistTotal()', source.indexOf('export async function GET'));
    expect(gate).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(gate);
    expect(waitlist).toBeGreaterThan(gate);
  });
});

describe('who may touch the presence table', () => {
  it('is only the ping route, the metrics reads and the account export', () => {
    const allowed = new Set([
      'app/api/presence/route.ts',
      'lib/usage-metrics-server.ts',
      'lib/presence.ts',
      'app/api/account/export/route.ts',
    ]);
    const touching = walk(ROOT)
      .map((file) => posix(relative(ROOT, file)))
      .filter((file) => {
        const source = stripComments(readFileSync(join(ROOT, file), 'utf8'));
        return source.includes('user_presence_days') || source.includes('PRESENCE_TABLE');
      });
    expect(touching.length).toBeGreaterThan(0);
    for (const file of touching) expect(allowed, file).toContain(file);
  });
});
