import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchesSearchTerms, parseSearchTerms } from './task-search';

/**
 * The page catalog behind the mobile search surface's Pages group.
 *
 * The flags are read at MODULE scope (the NEXT_PUBLIC_* inlining pattern), so
 * every case re-imports the module with vi.resetModules() + vi.stubEnv rather
 * than trusting the ambient environment — the approach
 * lib/chappi/intent-router.test.ts established. Both flag states are asserted
 * on purpose: a page whose feature is off must not be offered, because tapping
 * it would bounce or 404.
 */

type PagesModule = typeof import('./app-pages');

async function loadPages(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_FEATURE_NOTES', env.NEXT_PUBLIC_FEATURE_NOTES ?? '');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_EVENTS', env.NEXT_PUBLIC_FEATURE_EVENTS ?? '');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_PITCHING', env.NEXT_PUBLIC_FEATURE_PITCHING ?? '');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_PRESS_KITS', env.NEXT_PUBLIC_FEATURE_PRESS_KITS ?? '');
  return (await import('./app-pages')) as PagesModule;
}

const ALL_ON = {
  NEXT_PUBLIC_FEATURE_NOTES: 'true',
  NEXT_PUBLIC_FEATURE_EVENTS: 'true',
  NEXT_PUBLIC_FEATURE_PITCHING: 'true',
  NEXT_PUBLIC_FEATURE_PRESS_KITS: 'true',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('buildAppPages — always present', () => {
  it('offers the catalog, the assistant and settings with every flag off', async () => {
    const { buildAppPages } = await loadPages();
    const keys = buildAppPages({ hasCuratorProfile: false }).map((page) => page.key);
    expect(keys).toEqual(['catalog', 'urgans', 'settings']);
  });

  it('points each of them at the route the nav uses', async () => {
    const { buildAppPages } = await loadPages();
    const byKey = new Map(buildAppPages({ hasCuratorProfile: false }).map((p) => [p.key, p.href]));
    expect(byKey.get('catalog')).toBe('/dashboard');
    expect(byKey.get('urgans')).toBe('/dashboard/urgans');
    expect(byKey.get('settings')).toBe('/settings');
  });

  it('marks ONLY the catalog as leaving the release', async () => {
    const { buildAppPages } = await loadPages(ALL_ON);
    const leaving = buildAppPages({ hasCuratorProfile: true })
      .filter((page) => page.leavesRelease)
      .map((page) => page.key);
    expect(leaving).toEqual(['catalog']);
  });

  it('never offers /admin — its availability is unreliable when the identity flag is off', async () => {
    const { buildAppPages } = await loadPages(ALL_ON);
    const hrefs = buildAppPages({ hasCuratorProfile: true }).map((page) => page.href);
    expect(hrefs).not.toContain('/admin');
  });
});

describe('buildAppPages — flag gates', () => {
  it('adds Notes only when its flag is on', async () => {
    const off = await loadPages();
    expect(off.buildAppPages({ hasCuratorProfile: false }).some((p) => p.key === 'notes')).toBe(
      false
    );
    const on = await loadPages({ NEXT_PUBLIC_FEATURE_NOTES: 'true' });
    expect(on.buildAppPages({ hasCuratorProfile: false }).some((p) => p.key === 'notes')).toBe(true);
  });

  it('adds Shows only when the events flag is on', async () => {
    const off = await loadPages();
    expect(off.buildAppPages({ hasCuratorProfile: false }).some((p) => p.key === 'shows')).toBe(
      false
    );
    const on = await loadPages({ NEXT_PUBLIC_FEATURE_EVENTS: 'true' });
    expect(on.buildAppPages({ hasCuratorProfile: false }).some((p) => p.key === 'shows')).toBe(true);
  });

  it('adds Press kits only when the press kits flag is on', async () => {
    const off = await loadPages();
    expect(
      off.buildAppPages({ hasCuratorProfile: false }).some((p) => p.key === 'press-kits')
    ).toBe(false);
    const on = await loadPages({ NEXT_PUBLIC_FEATURE_PRESS_KITS: 'true' });
    expect(
      on.buildAppPages({ hasCuratorProfile: false }).some((p) => p.key === 'press-kits')
    ).toBe(true);
  });

  it('finds the press kit by the words a manager would actually type', async () => {
    const { buildAppPages } = await loadPages({ NEXT_PUBLIC_FEATURE_PRESS_KITS: 'true' });
    const page = buildAppPages({ hasCuratorProfile: false }).find((p) => p.key === 'press-kits');
    expect(page?.keywords).toEqual(expect.arrayContaining(['epk', 'bio', 'photos']));
  });

  it('needs BOTH the pitching flag and a real curator profile for the crossing', async () => {
    const { buildAppPages } = await loadPages({ NEXT_PUBLIC_FEATURE_PITCHING: 'true' });
    expect(buildAppPages({ hasCuratorProfile: true }).some((p) => p.key === 'curator')).toBe(true);
    expect(buildAppPages({ hasCuratorProfile: false }).some((p) => p.key === 'curator')).toBe(false);

    const flagOff = await loadPages();
    expect(flagOff.buildAppPages({ hasCuratorProfile: true }).some((p) => p.key === 'curator')).toBe(
      false
    );
  });

  it('treats an unanswered curator probe as "not yet", not as no', async () => {
    // null must never be read as false anywhere in the app; here the cost of
    // getting it wrong is only a missing result, which is why it is safe to
    // leave out until the probe answers.
    const { buildAppPages } = await loadPages({ NEXT_PUBLIC_FEATURE_PITCHING: 'true' });
    expect(buildAppPages({ hasCuratorProfile: null }).some((p) => p.key === 'curator')).toBe(false);
  });

  it('keeps Settings last so the ordering stays "most wanted first"', async () => {
    const { buildAppPages } = await loadPages(ALL_ON);
    const pages = buildAppPages({ hasCuratorProfile: true });
    expect(pages[pages.length - 1].key).toBe('settings');
  });
});

describe('appPageHaystack + the shared matcher', () => {
  it('finds Settings by a section it contains rather than by its own name', async () => {
    const { buildAppPages, appPageHaystack } = await loadPages();
    const settings = buildAppPages({ hasCuratorProfile: false }).find(
      (page) => page.key === 'settings'
    );
    expect(settings).toBeDefined();
    // The whole reason keywords exist: nothing in this app is labelled
    // "billing", and a manager hunting for their card details types exactly
    // that.
    for (const query of ['billing', 'subscription', 'teammates', 'export']) {
      expect(matchesSearchTerms(appPageHaystack(settings!), parseSearchTerms(query))).toBe(true);
    }
  });

  it('finds Shows by "setlist" and by "dj"', async () => {
    const { buildAppPages, appPageHaystack } = await loadPages({
      NEXT_PUBLIC_FEATURE_EVENTS: 'true',
    });
    const shows = buildAppPages({ hasCuratorProfile: false }).find((page) => page.key === 'shows');
    expect(shows).toBeDefined();
    expect(matchesSearchTerms(appPageHaystack(shows!), parseSearchTerms('setlist'))).toBe(true);
    expect(matchesSearchTerms(appPageHaystack(shows!), parseSearchTerms('dj'))).toBe(true);
  });

  it('finds the assistant by "assistant" as well as by its name', async () => {
    const { buildAppPages, appPageHaystack } = await loadPages();
    const urgans = buildAppPages({ hasCuratorProfile: false }).find((page) => page.key === 'urgans');
    expect(matchesSearchTerms(appPageHaystack(urgans!), parseSearchTerms('assistant'))).toBe(true);
    expect(matchesSearchTerms(appPageHaystack(urgans!), parseSearchTerms('urgans'))).toBe(true);
  });

  it('is the label alone for a page with no keywords', async () => {
    const { appPageHaystack } = await loadPages();
    expect(appPageHaystack({ key: 'x', label: 'Plain', href: '/x' })).toBe('Plain');
  });

  it('does not match an unrelated query', async () => {
    const { buildAppPages, appPageHaystack } = await loadPages(ALL_ON);
    const pages = buildAppPages({ hasCuratorProfile: true });
    const matched = pages.filter((page) =>
      matchesSearchTerms(appPageHaystack(page), parseSearchTerms('zzzznope'))
    );
    expect(matched).toEqual([]);
  });
});
