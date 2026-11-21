import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Structural guard on Urganize music, the part anyone can reach.
 *
 * Listening needs no account, so the three /api/music routes must never ask for
 * one, and the artist-side routes must never lose the check that keeps one
 * team's songs from another. There are no route tests and no database in CI, so
 * these are proved by reading the real source. Comments are stripped first:
 * prose about a rule must never satisfy the rule.
 */

const WEB = join(__dirname, '..');
const PUBLIC_DIR = join(WEB, 'app', 'api', 'music');
const OWNER_DIR = join(WEB, 'app', 'api', 'releases', '[releaseId]', 'music');

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (name === 'route.ts') out.push(full);
  }
  return out;
}

const read = (path: string): string => stripComments(readFileSync(path, 'utf8'));

describe('the public music routes', () => {
  const files = routeFiles(PUBLIC_DIR);

  it('finds the three routes it is meant to guard', () => {
    expect(files.length).toBe(3);
  });

  it('never put a payment or sign-in wall in front of listening', () => {
    for (const file of files) {
      const source = read(file);
      expect(source, file).not.toMatch(/requireActiveAuthenticatedUser|requireAuthenticatedAdmin|requireActiveAccount|getAuthenticatedUser\(/);
    }
  });

  it('read with the service client only, never the caller\'s own session', () => {
    for (const file of files) {
      expect(read(file), file).not.toMatch(/createUserClient|createClient\(\s*url\s*,\s*anon/i);
    }
  });

  it('never let a signed audio link be cached', () => {
    const stream = files.find((file) => file.includes('stream'));
    expect(stream).toBeTruthy();
    expect(read(stream!)).toContain("'no-store'");
  });

  it('only count a play for a song that is live right now', () => {
    const play = files.find((file) => file.includes('play'));
    expect(play).toBeTruthy();
    expect(read(play!)).toMatch(/recordPlay|loadStreamableTrack/);
  });
});

describe('the artist-side music routes', () => {
  const files = routeFiles(OWNER_DIR);

  it('finds the routes it is meant to guard', () => {
    expect(files.length).toBe(3);
  });

  it('sign the caller in and check team access to the rollout before anything else', () => {
    for (const file of files) {
      const source = read(file);
      expect(source, file).toMatch(/requireActiveAuthenticatedUser/);
      expect(source, file).toMatch(/ensureReleaseTeam(Read|Write)Access|_shared/);
    }
  });

  it('keep every write behind write access, so a guest can look and not change', () => {
    for (const file of files) {
      const source = read(file);
      if (/export async function (POST|PATCH|DELETE)/.test(source)) {
        expect(source, file).toMatch(/ensureReleaseTeamWriteAccess/);
      }
    }
  });
});
