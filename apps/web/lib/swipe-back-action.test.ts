import { describe, expect, it } from 'vitest';
import { swipeBackAction } from './swipe-nav';

describe('swipeBackAction', () => {
  it('goes back in history when an earlier in-app page exists, so a push never leaves a ping-pong behind', () => {
    expect(swipeBackAction('/dashboard/home', '/dashboard/directory', '/dashboard/home', 4)).toEqual({ kind: 'history' });
    expect(swipeBackAction('/dashboard/artists/1', '/dashboard/directory', '/dashboard/home', 4)).toEqual({ kind: 'history' });
  });
  it('replaces with the fallback on a deep link, a fresh tab or the same page', () => {
    const fallback = { kind: 'replace', href: '/dashboard/home' };
    expect(swipeBackAction(null, '/dashboard/directory', '/dashboard/home', 1)).toEqual(fallback);
    expect(swipeBackAction('/dashboard/directory', '/dashboard/directory', '/dashboard/home', 4)).toEqual(fallback);
    expect(swipeBackAction('https://elsewhere.test/', '/dashboard/directory', '/dashboard/home', 4)).toEqual(fallback);
    expect(swipeBackAction('/dashboard/home', '/dashboard/directory', '/dashboard/home', 1)).toEqual(fallback);
  });
});
