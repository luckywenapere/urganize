import { describe, expect, it } from 'vitest';
import { destinationReady, shouldAnimateNavigation } from './view-transition';

describe('shouldAnimateNavigation', () => {
  it('animates only when supported and motion is not reduced', () => {
    expect(shouldAnimateNavigation({ supported: true, reducedMotion: false })).toBe(true);
    expect(shouldAnimateNavigation({ supported: false, reducedMotion: false })).toBe(false);
    expect(shouldAnimateNavigation({ supported: true, reducedMotion: true })).toBe(false);
    expect(shouldAnimateNavigation({ supported: true, reducedMotion: false, visible: false })).toBe(false);
  });
});

describe('destinationReady', () => {
  const base = { href: '/dashboard/urgans', needsComposer: true, hasComposer: true };
  it('waits for the right page', () => {
    expect(destinationReady({ ...base, pathname: '/dashboard/home' })).toBe(false);
    expect(destinationReady({ ...base, pathname: '/dashboard/urgans' })).toBe(true);
  });
  it('waits for the composer only when it is being morphed into', () => {
    expect(destinationReady({ ...base, pathname: '/dashboard/urgans', hasComposer: false })).toBe(false);
    expect(
      destinationReady({ ...base, pathname: '/dashboard/home', href: '/dashboard/home', needsComposer: false, hasComposer: false })
    ).toBe(true);
  });
});
