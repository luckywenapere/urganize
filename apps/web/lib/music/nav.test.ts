import { describe, expect, it } from 'vitest';
import { MUSIC_SWIPE_MIN_PX, MUSIC_TABS, musicSwipeTarget, musicTabForPath } from './nav';

describe('MUSIC_TABS', () => {
  it('is Home then Collection, and nothing else (#1364)', () => {
    expect(MUSIC_TABS.map((tab) => tab.label)).toEqual(['Home', 'Collection']);
  });
});

describe('musicTabForPath', () => {
  it('names the tab a page belongs to', () => {
    expect(musicTabForPath('/music')).toBe('home');
    expect(musicTabForPath('/music/')).toBe('home');
    expect(musicTabForPath('/music/collection')).toBe('collection');
  });
  it('is null for a page pushed on top', () => {
    expect(musicTabForPath('/music/search')).toBeNull();
    expect(musicTabForPath('/musical')).toBeNull();
  });
});

describe('musicSwipeTarget', () => {
  const far = MUSIC_SWIPE_MIN_PX + 20;
  it('goes left to the next tab and right to the one before', () => {
    expect(musicSwipeTarget('home', -far, 0)).toBe('/music/collection');
    expect(musicSwipeTarget('collection', far, 0)).toBe('/music');
  });
  it('stops at either end', () => {
    expect(musicSwipeTarget('home', far, 0)).toBeNull();
    expect(musicSwipeTarget('collection', -far, 0)).toBeNull();
  });
  it('ignores a short drag, a scroll and a pushed page', () => {
    expect(musicSwipeTarget('home', -(MUSIC_SWIPE_MIN_PX - 1), 0)).toBeNull();
    expect(musicSwipeTarget('home', -far, far)).toBeNull();
    expect(musicSwipeTarget(null, -far, 0)).toBeNull();
  });
});
