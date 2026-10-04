import { describe, expect, it } from 'vitest';
import { CURATOR_HOME_PATH, HOME_PATH, resolveHomePath } from './home-path';

describe('HOME_PATH', () => {
  it('is Home, whatever else is switched on (the new shell has no flag)', () => {
    expect(HOME_PATH).toBe('/dashboard/home');
  });
});

describe('resolveHomePath', () => {
  it('sends a curator-only account to its own surface', () => {
    expect(resolveHomePath('curator')).toBe(CURATOR_HOME_PATH);
  });

  it('sends every other role to Home', () => {
    for (const role of ['manager', 'artist', 'artist-manager', 'team-member', undefined, null]) {
      expect(resolveHomePath(role as never)).toBe(HOME_PATH);
    }
  });
});
