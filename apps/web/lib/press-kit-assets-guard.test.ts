import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Structural guard on the press kit asset routes.
 *
 * There are no route tests in this repo and no database in CI, so the rule
 * these files have to keep cannot be proved by calling them. It CAN be proved
 * by reading them, which is the same thing `release-access-guard.test.ts` and
 * `tool-registry.test.ts` do: scan the real source rather than assert a fixed
 * list, so a NEW route violating the rule fails too.
 *
 * Comments are stripped before matching. Prose about a check must never be
 * able to satisfy a check.
 */

const ROOT = join(__dirname, '..', 'app', 'api', 'press-kits', '[kitId]', 'assets');

const PER_ASSET_ROUTES = [
  join(ROOT, '[assetId]', 'route.ts'),
  join(ROOT, '[assetId]', 'download', 'route.ts'),
];

const ALL_ROUTES = [join(ROOT, 'route.ts'), join(ROOT, 'upload-url', 'route.ts'), ...PER_ASSET_ROUTES];

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * The source with its import block removed.
 *
 * Order matters below, and every one of these files IMPORTS the auth helper
 * near the top, which would otherwise read as auth coming before the flag.
 */
const read = (path: string): string => {
  const source = stripComments(readFileSync(path, 'utf8'));
  const lastImport = source.lastIndexOf("} from '");
  const bodyStart = lastImport === -1 ? 0 : source.indexOf('\n', lastImport);
  return source.slice(bodyStart === -1 ? 0 : bodyStart);
};

describe('press kit asset routes', () => {
  it('every one of them checks the feature flag before anything else', () => {
    for (const path of ALL_ROUTES) {
      const source = read(path);
      expect(source, path).toContain('isPressKitsFeatureEnabled()');
      expect(source, path).toContain('pressKitsDisabledResponse()');

      // The flag has to be read before auth, or the 404 could be told apart
      // from a route that does not exist by whether it asks for a token first.
      const flagAt = source.indexOf('isPressKitsFeatureEnabled()');
      const authAt = source.indexOf('requireActiveAuthenticatedUser');
      expect(flagAt, path).toBeGreaterThan(-1);
      expect(authAt, path).toBeGreaterThan(flagAt);
    }
  });

  it('every one of them resolves access through the shared rule', () => {
    for (const path of ALL_ROUTES) {
      expect(read(path), path).toContain('ensurePressKitAccess');
    }
  });

  /**
   * THE RULE THIS FILE EXISTS FOR.
   *
   * Access is checked for the KIT. Without a second check that the asset row
   * actually belongs to that kit, an id from someone else's kit would be
   * edited, downloaded or deleted on this kit's authority. The single-asset
   * release route carries the same guard with `release_id`.
   */
  it('scopes every per-asset row read to the kit it was reached through', () => {
    for (const path of PER_ASSET_ROUTES) {
      const source = read(path);
      expect(source, path).toMatch(/row\.kit_id[\s\S]{0,40}!==\s*kitId/);
    }
  });

  it('scopes every per-asset write to the kit as well', () => {
    // Belt and braces on top of the row check: the UPDATE and DELETE both
    // carry .eq('kit_id', kitId), so even a row that slipped the read check
    // could not be written through.
    const source = read(join(ROOT, '[assetId]', 'route.ts'));
    const scoped = source.match(/\.eq\('kit_id', kitId\)/g) || [];
    expect(scoped.length).toBeGreaterThanOrEqual(2);
  });

  it('never proxies bytes', () => {
    // Nothing in this codebase returns a file body, and the download route is
    // the one most likely to be "improved" into doing so. A signed URL keeps
    // print resolution photos out of a serverless function's memory.
    for (const path of ALL_ROUTES) {
      const source = read(path);
      expect(source, path).not.toContain('arrayBuffer()');
      expect(source, path).not.toContain('Content-Disposition');
    }
  });

  it('stamps a new photo with the kit owner, not the caller', () => {
    // A press photo outlives whoever happened to add it, and every
    // owner-scoped read and export keys off this column.
    const source = read(join(ROOT, 'route.ts'));
    expect(source).toContain('owner_user_id: access.ownerUserId');
    expect(source).not.toContain('owner_user_id: auth.user');
  });

  it('checks a reported storage path against the kit prefix before trusting it', () => {
    const source = read(join(ROOT, 'route.ts'));
    expect(source).toContain('pressKitStoragePrefix(kitId)');
  });
});
