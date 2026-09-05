import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Structural guard on the public press kit surface.
 *
 * This is the one page in the product a stranger reaches without a token in the
 * URL, and the one page a search engine may be invited to index. The rules
 * below are the ones that would leak something if they slipped, and none of
 * them can be proved by calling the code: there are no route or page tests in
 * this repo and no database in CI. So they are proved by reading the real
 * source, the way `release-access-guard.test.ts` does.
 *
 * Comments are stripped first. Prose about a rule must never satisfy the rule.
 */

const WEB = join(__dirname, '..');
const PAGE = join(WEB, 'app', 'k', '[slug]', 'page.tsx');
const LOADER = join(WEB, 'lib', 'press-kit-public-server.ts');
const VIEW_ROUTE = join(WEB, 'app', 'api', 'k', '[slug]', 'view', 'route.ts');
const DOWNLOAD_ROUTE = join(
  WEB,
  'app',
  'api',
  'k',
  '[slug]',
  'photos',
  '[assetId]',
  'download',
  'route.ts'
);
const PUBLISH_ROUTE = join(
  WEB,
  'app',
  'api',
  'press-kits',
  '[kitId]',
  'publish',
  'route.ts'
);

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const read = (path: string): string => stripComments(readFileSync(path, 'utf8'));

describe('the public press kit page', () => {
  it('renders published content and never the working draft', () => {
    // The page reads its sections through the loader, and the loader reads
    // published_content. Selecting `content` here would put half typed copy in
    // front of a journalist.
    const loader = read(LOADER);
    expect(loader).toContain('published_content');
    expect(loader).not.toMatch(/select\([^)]*[^_]\bcontent\b[^_]/);
  });

  it('refuses an unpublished kit', () => {
    expect(read(LOADER)).toContain('isKitLive');
  });

  it('answers every failure the same way', () => {
    // A flag that is off, an unknown slug, an unpublished kit and a broken
    // database all have to be one answer, or the page becomes a way to ask
    // whether an artist is preparing something.
    const loader = read(LOADER);
    expect(loader).toContain('catch');
    expect(loader).toMatch(/return null/);
    expect(read(PAGE)).toContain('notFound()');
  });

  it('is noindex unless the kit was deliberately listed', () => {
    const page = read(PAGE);
    expect(page).toContain('isKitIndexable');
    expect(page).toContain('robots');
    // The not-found branch must be noindex too, or a 404 for a slug somebody
    // guessed becomes an indexable page.
    expect(page).toMatch(/robots: \{ index: false, follow: false \}/);
  });

  it('never uses next/image on a signed URL', () => {
    const page = read(PAGE);
    expect(page).not.toContain("from 'next/image'");
  });
});

describe('the public asset routes', () => {
  it('scope the photo to the kit the slug resolved to', () => {
    // Without this, an id lifted from one artist's page would download from
    // another's. The same defence-in-depth the owner routes carry.
    expect(read(LOADER)).toMatch(/photo\.kit_id[\s\S]{0,40}!==\s*kitId/);
  });

  it('require the kit to still be published', () => {
    // A link taken down a minute ago must stop handing out files, which means
    // the photo lookup checks published_at rather than only the asset row.
    const loader = read(LOADER);
    const photoAt = loader.indexOf('loadPublicKitPhoto');
    expect(photoAt).toBeGreaterThan(-1);
    expect(loader.slice(photoAt)).toContain('isKitLive');
  });

  it('never proxy bytes', () => {
    for (const path of [VIEW_ROUTE, DOWNLOAD_ROUTE]) {
      const source = read(path);
      expect(source, path).not.toContain('arrayBuffer()');
      expect(source, path).not.toContain('Content-Disposition');
    }
  });

  it('check the feature flag', () => {
    for (const path of [VIEW_ROUTE, DOWNLOAD_ROUTE]) {
      expect(read(path), path).toContain('isPressKitsFeatureEnabled()');
    }
  });

  it('never report whether a kit exists from the view beacon', () => {
    // Always 204. A beacon that answered differently for a real slug would be
    // a way to enumerate unpublished artists.
    const source = read(VIEW_ROUTE);
    expect(source).toContain('status: 204');
    expect(source).not.toMatch(/status: 40[03] \}[\s\S]{0,80}kitId/);
  });
});

describe('publishing', () => {
  it('checks the contact rule on the server, not only in the button', () => {
    expect(read(PUBLISH_ROUTE)).toContain('canPublishKit');
  });

  it('copies content into published_content rather than the other way round', () => {
    const source = read(PUBLISH_ROUTE);
    expect(source).toContain('published_content: section.content');
  });

  it('leaves the published copy in place when a kit is taken down', () => {
    // Taking a kit down is not discarding what was on it. Only published_at
    // moves, so publishing again within the hour rebuilds nothing.
    const source = read(PUBLISH_ROUTE);
    const deleteAt = source.indexOf('export async function DELETE');
    expect(deleteAt).toBeGreaterThan(-1);
    expect(source.slice(deleteAt)).not.toContain('published_content');
  });
});

describe('rolling a release in', () => {
  const ROLLOUT_ROUTE = join(
    WEB,
    'app',
    'api',
    'press-kits',
    '[kitId]',
    'rollout',
    'route.ts'
  );

  it('is read only, with no write of any kind', () => {
    // THE PROPERTY OF THAT WHOLE FEATURE. Autofill writes; a roll in proposes,
    // and a person accepts each one. A write here would be a silent overwrite
    // of somebody's hand written section, which is exactly what the module was
    // built to make impossible.
    const source = read(ROLLOUT_ROUTE);
    expect(source).not.toMatch(/\.update\(/);
    expect(source).not.toMatch(/\.insert\(/);
    expect(source).not.toMatch(/\.upsert\(/);
    expect(source).not.toMatch(/\.delete\(/);
  });

  it('exposes no method other than GET', () => {
    const source = read(ROLLOUT_ROUTE);
    expect(source).toContain('export async function GET');
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(source, method).not.toContain(`export async function ${method}`);
    }
  });

  it('checks the flag and resolves access', () => {
    const source = read(ROLLOUT_ROUTE);
    expect(source).toContain('isPressKitsFeatureEnabled()');
    expect(source).toContain('ensurePressKitAccess');
  });

  it('reads sources against the kit owner, not the caller', () => {
    // A teammate looking at somebody else's kit has to see the same releases
    // and the same team the owner would.
    const source = read(ROLLOUT_ROUTE);
    expect(source).toContain('ownerUserId: access.ownerUserId');
    expect(source).not.toContain('ownerUserId: auth.user');
  });
});

describe('the retired EPK', () => {
  const EPK_PAGE = join(WEB, 'app', 'epk', '[token]', 'page.tsx');
  const EPK_SERVER = join(WEB, 'lib', 'epk-server.ts');

  it('still resolves, because links to it are already in press inboxes', () => {
    // The one page in this product a stranger may already hold a link to. It is
    // kept as a compatibility shim rather than deleted or stubbed, so nothing
    // anyone was ever sent stops working.
    expect(existsSync(EPK_PAGE)).toBe(true);
    expect(existsSync(EPK_SERVER)).toBe(true);
    expect(read(EPK_PAGE)).toContain('loadPublicEpk');
  });

  it('hands over with a TEMPORARY redirect, never a permanent one', () => {
    // A kit can be taken back down. A browser holding a cached 308 would keep
    // sending a journalist to a page that has gone back to a 404, with nothing
    // we could do about it.
    const source = read(EPK_PAGE);
    expect(source).toContain('resolveEpkSuccessorPath');
    expect(source).toMatch(/\bredirect\(/);
    expect(source).not.toContain('permanentRedirect');
  });

  it('keeps its loading state', () => {
    // Not a redirect stub, so this still earns its keep. It exists because of a
    // recorded incident: the public EPK and credits pages had zero loading
    // state, which is a blank tab on the surface a press contact judges the
    // product by.
    expect(existsSync(join(WEB, 'app', 'epk', '[token]', 'loading.tsx'))).toBe(true);
  });

  it('can only produce a path through the pure decision', () => {
    // The resolver does four database reads and every one of them can fail.
    // Each failure has to answer null, which means "render the EPK" — the page
    // the reader had yesterday — rather than sending them somewhere invented.
    // Asserted structurally because the reads cannot be reached from a unit
    // test: a hand written path anywhere in this file would be a way for a
    // failure to strand somebody on a 404.
    const source = read(EPK_SERVER);
    expect(source).toContain('successorPathForKit(');
    expect(source).not.toMatch(/['"`]\/k\//);
  });

  it('has no authoring surface left', () => {
    // Everything that MINTS a link is gone: the scene, the API routes, the
    // type, and the three UrgAns tools.
    expect(existsSync(join(WEB, 'components', 'releases', 'EpkSection.tsx'))).toBe(false);
    expect(existsSync(join(WEB, 'types', 'epk.ts'))).toBe(false);
    expect(existsSync(join(WEB, 'app', 'api', 'releases', '[releaseId]', 'epk'))).toBe(false);

    const promo = read(join(WEB, 'lib', 'chappi', 'tool-families', 'promo.ts'));
    for (const tool of ['get_epk', 'create_epk_link', 'revoke_epk_link']) {
      expect(promo, tool).not.toContain(`name: '${tool}'`);
    }
  });
});
