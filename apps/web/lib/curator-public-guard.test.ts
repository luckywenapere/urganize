import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Structural guard on the public curator page, /pitch/{slug}.
 *
 * The same shape as lib/press-kit-public-guard.test.ts and for the same
 * reason: this is a page a stranger reaches with no session, there are no
 * route or page tests in this repo and no database in CI, so these properties
 * are proved by reading the real source rather than by running it.
 *
 * Comments are stripped first. Prose about a rule must never satisfy the rule.
 */

const WEB = join(__dirname, '..');
const PAGE = join(WEB, 'app', 'pitch', '[slug]', 'page.tsx');
const LOADER = join(WEB, 'lib', 'curator-public-server.ts');
const PAYLOAD = join(WEB, 'lib', 'curator-public.ts');
const PUBLISH_ROUTE = join(
  WEB,
  'app',
  'api',
  'curator',
  'profile',
  'publish',
  'route.ts'
);

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const read = (path: string): string => stripComments(readFileSync(path, 'utf8'));

describe('the public curator page', () => {
  it('is behind its own flag', () => {
    expect(read(LOADER)).toContain('NEXT_PUBLIC_FEATURE_CURATOR_PAGE');
  });

  it('is dark unless pitching itself is switched on too', () => {
    // A page advertising playlists she cannot log in to manage would outlive
    // the feature it belongs to.
    expect(read(LOADER)).toContain('NEXT_PUBLIC_FEATURE_PITCHING');
  });

  it('refuses an unpublished page', () => {
    expect(read(LOADER)).toContain('isCuratorPageLive');
  });

  it('answers every failure the same way', () => {
    // A flag that is off, a slug nobody had, an unpublished page and a broken
    // database all have to be one answer — this page must never tell a
    // stranger whether a curator with that handle merely exists.
    const loader = read(LOADER);
    expect(loader).toContain('catch');
    expect(loader).toMatch(/return null/);
    expect(read(PAGE)).toContain('notFound()');
  });

  it('is noindex on both branches', () => {
    const page = read(PAGE);
    const robotsLines = page.match(/robots:\s*\{[^}]*\}/g) || [];
    expect(robotsLines.length).toBeGreaterThanOrEqual(2);
    for (const line of robotsLines) {
      expect(line).toMatch(/index:\s*false/);
      expect(line).toMatch(/follow:\s*false/);
    }
  });

  it('never uses next/image on a signed photo URL', () => {
    expect(read(PAGE)).not.toContain("from 'next/image'");
  });

  it('force-dynamic, so a signed photo URL and a fresh publish state are never cached stale', () => {
    expect(read(PAGE)).toContain("dynamic = 'force-dynamic'");
  });
});

describe('the payload boundary', () => {
  it('never spreads the profile or playlist row', () => {
    // The service-role client can read every column of either table, so this
    // is the entire privacy boundary. A spread would leak the next column
    // somebody adds to curator_profiles without anyone deciding to show it.
    const payload = read(PAYLOAD);
    expect(payload).not.toMatch(/\.\.\.\s*\(?\s*profile/i);
    expect(payload).not.toMatch(/\.\.\.\s*\(?\s*row/i);
  });

  it('never names the columns it must not expose', () => {
    const payload = read(PAYLOAD);
    for (const secret of ['user_id', 'invite_id', 'photoPath']) {
      // photo_path (the storage path) must not reach the payload type; photoUrl
      // (the signed link) is fine and is asserted separately below.
      expect(payload).not.toContain(secret);
    }
  });

  it('carries a signed URL, never a storage path', () => {
    expect(read(PAYLOAD)).toContain('photoUrl');
  });
});

describe('the publish route', () => {
  it('is dedicated, not a field on the autosaving profile PATCH', () => {
    // Anything reachable from that save can happen without the curator
    // meaning it, and this one puts her page on the public internet.
    const route = read(PUBLISH_ROUTE);
    expect(route).toContain('export async function POST');
    expect(route).toContain('export async function DELETE');
  });

  it('keeps the slug when unpublishing', () => {
    // The one property that makes republishing restore the same URL rather
    // than minting a new one.
    const route = read(PUBLISH_ROUTE);
    const deleteBody = route.slice(route.indexOf('export async function DELETE'));
    expect(deleteBody).not.toMatch(/slug:\s*null/);
    expect(deleteBody).toMatch(/published_at:\s*null/);
  });

  it('checks the feature flag before touching auth, in each handler', () => {
    // Scoped to each function's OWN body, not the whole file: the two names
    // also appear once each in the import block at the top, and comparing
    // whole-file positions would find the import order rather than the call
    // order inside POST and DELETE.
    const route = read(PUBLISH_ROUTE);
    for (const name of ['POST', 'DELETE']) {
      const start = route.indexOf(`export async function ${name}`);
      expect(start).toBeGreaterThan(-1);
      const nextHandler = route.indexOf('export async function', start + 1);
      const body = route.slice(start, nextHandler === -1 ? undefined : nextHandler);
      const flagIndex = body.indexOf('isCuratorPageFeatureEnabled()');
      const authIndex = body.indexOf('requireCuratorUser(');
      expect(flagIndex).toBeGreaterThan(-1);
      expect(authIndex).toBeGreaterThan(-1);
      expect(flagIndex).toBeLessThan(authIndex);
    }
  });
});
