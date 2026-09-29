import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * HOME_PATH reads NEXT_PUBLIC_FEATURE_HOME and NEXT_PUBLIC_FEATURE_CHAPPI at
 * MODULE SCOPE, so every case re-imports the module with both env vars
 * stubbed first (the documented flag-dependent pattern — stubbing after
 * import is too late, because the value is already computed).
 */
async function loadHomePath(chappi: string | undefined, home: string | undefined = undefined) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_FEATURE_CHAPPI', chappi === undefined ? '' : chappi);
  vi.stubEnv('NEXT_PUBLIC_FEATURE_HOME', home === undefined ? '' : home);
  return import('./home-path');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('HOME_PATH', () => {
  it('lands on the assistant when it is switched on', async () => {
    const { HOME_PATH } = await loadHomePath('true');
    expect(HOME_PATH).toBe('/dashboard/urgans');
  });

  /**
   * THE LOOP GUARD, and the reason this file is flag-conditional at all.
   * ChappiPageClient bounces to '/dashboard' when the flag is off, so a
   * landing path of '/dashboard/urgans' in a flag-off deployment would send
   * every sign-in through a redirect. These three cases are the ways the flag
   * can be "not on".
   */
  it.each([
    ['unset', undefined],
    ['false', 'false'],
    ['a non-"true" value', '1'],
  ])('lands on the catalog when the assistant is %s, so the bounce cannot loop', async (_label, value) => {
    const { HOME_PATH } = await loadHomePath(value);
    expect(HOME_PATH).toBe('/dashboard');
  });

  it('lands on Home when it is switched on, regardless of the assistant flag', async () => {
    const onHome = await loadHomePath('true', 'true');
    expect(onHome.HOME_PATH).toBe('/dashboard/home');

    const homeOnlyResult = await loadHomePath('false', 'true');
    expect(homeOnlyResult.HOME_PATH).toBe('/dashboard/home');
  });

  /**
   * The same loop guard as the assistant's, for Home: HomePageClient bounces
   * to '/dashboard' when NEXT_PUBLIC_FEATURE_HOME is off, so this must never
   * resolve to '/dashboard/home' in that state.
   */
  it.each([
    ['unset', undefined],
    ['false', 'false'],
    ['a non-"true" value', '1'],
  ])('never lands on Home when it is %s, whatever the assistant flag says', async (_label, value) => {
    expect((await loadHomePath('true', value)).HOME_PATH).not.toBe('/dashboard/home');
    expect((await loadHomePath('false', value)).HOME_PATH).not.toBe('/dashboard/home');
  });

  it('falls through to the assistant when Home is off and the assistant is on', async () => {
    const { HOME_PATH } = await loadHomePath('true', 'false');
    expect(HOME_PATH).toBe('/dashboard/urgans');
  });

  it('falls through to the catalog when both Home and the assistant are off', async () => {
    const { HOME_PATH } = await loadHomePath('false', 'false');
    expect(HOME_PATH).toBe('/dashboard');
  });
});

describe('resolveHomePath', () => {
  it('sends a curator-only account to its own surface, whatever the assistant flag says', async () => {
    for (const flag of ['true', 'false']) {
      const { resolveHomePath, CURATOR_HOME_PATH } = await loadHomePath(flag);
      expect(resolveHomePath('curator')).toBe(CURATOR_HOME_PATH);
    }
  });

  it.each([['manager'], ['artist-manager'], ['team-member'], ['viewer']])(
    'sends a %s to the landing surface',
    async (role) => {
      const { resolveHomePath, HOME_PATH } = await loadHomePath('true');
      expect(resolveHomePath(role)).toBe(HOME_PATH);
    }
  );

  it('treats a missing or blank role as a team account rather than a curator', async () => {
    const { resolveHomePath, HOME_PATH } = await loadHomePath('true');
    for (const role of [undefined, null, '', '   ']) {
      expect(resolveHomePath(role)).toBe(HOME_PATH);
    }
  });

  it('matches the curator role case- and whitespace-insensitively', async () => {
    const { resolveHomePath, CURATOR_HOME_PATH } = await loadHomePath('true');
    for (const role of ['Curator', ' CURATOR ', 'cUrAtOr']) {
      expect(resolveHomePath(role)).toBe(CURATOR_HOME_PATH);
    }
  });
});
