import { describe, expect, it } from 'vitest';
import { errorBackHref } from './error-back-link';
import { HOME_PATH } from './home-path';

describe('errorBackHref', () => {
  it('sends a crash anywhere else to Home', () => {
    expect(errorBackHref('/dashboard/urgans')).toBe('/dashboard');
    expect(errorBackHref('/dashboard/home/')).toBe('/dashboard');
    expect(errorBackHref('/settings')).toBe('/dashboard');
    expect(errorBackHref(null)).toBe('/dashboard');
    expect(errorBackHref(undefined)).toBe('/dashboard');
  });

  it('sends a crashed rollout to Home, the artist list', () => {
    expect(errorBackHref('/dashboard', '?release=abc')).toBe('/dashboard');
    expect(errorBackHref('/dashboard', 'release=abc&scene=pitch')).toBe('/dashboard');
  });

  it('sends a crash on Home itself to Team, never back into Home', () => {
    expect(errorBackHref(HOME_PATH)).toBe('/dashboard/team');
    expect(errorBackHref('/dashboard/')).toBe('/dashboard/team');
    expect(errorBackHref('/dashboard', '')).toBe('/dashboard/team');
    expect(errorBackHref('/dashboard', '?settings=team')).toBe('/dashboard/team');
  });
});
