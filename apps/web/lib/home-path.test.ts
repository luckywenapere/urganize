import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * HOME_PATH reads NEXT_PUBLIC_FEATURE_CHAPPI at MODULE SCOPE, so every case
 * re-imports the module with the env stubbed first (the documented
 * flag-dependent pattern — stubbing after import is too late, because the
 * value is already computed).
 */
async function loadHomePath(chappi: string | undefined) {
  vi.resetModules();
  if (chappi === undefined) vi.stubEnv('NEXT_PUBLIC_FEATURE_CHAPPI', '');
  else vi.stubEnv('NEXT_PUBLIC_FEATURE_CHAPPI', chappi);
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
