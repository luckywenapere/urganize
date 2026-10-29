import { describe, expect, it } from 'vitest';
import { errorBackHref } from './error-back-link';
import { HOME_PATH } from './home-path';

describe('errorBackHref', () => {
  it('sends a crash on Home to the catalogue, never back into Home', () => {
    expect(errorBackHref(HOME_PATH)).toBe('/dashboard');
    expect(errorBackHref('/dashboard/home/')).toBe('/dashboard');
    expect(errorBackHref(HOME_PATH)).not.toBe(HOME_PATH);
  });

  it('sends a crash anywhere else to the catalogue', () => {
    expect(errorBackHref('/dashboard/urgans')).toBe('/dashboard');
    expect(errorBackHref('/settings')).toBe('/dashboard');
    expect(errorBackHref(null)).toBe('/dashboard');
    expect(errorBackHref(undefined)).toBe('/dashboard');
  });

  it('never links a crashed page back to itself', () => {
    expect(errorBackHref('/dashboard')).toBe('/dashboard/artists');
    expect(errorBackHref('/dashboard/')).toBe('/dashboard/artists');
    for (const path of ['/dashboard', '/dashboard/home', '/dashboard/notes', '/']) {
      expect(errorBackHref(path)).not.toBe(path.replace(/\/+$/, '') || '/');
    }
  });
});
