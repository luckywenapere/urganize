import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  artistHref,
  describeArtistCounts,
  epkHref,
  formatCalendarDate,
  isArtistPageEnabled,
  releaseHref,
} from './artist-page';

afterEach(() => vi.unstubAllEnvs());

describe('isArtistPageEnabled', () => {
  it('needs both the artist page flag and the workspace flag', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_ARTIST_PAGE', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_WORKSPACE', 'true');
    expect(isArtistPageEnabled()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_WORKSPACE', 'false');
    expect(isArtistPageEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_WORKSPACE', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_ARTIST_PAGE', 'false');
    expect(isArtistPageEnabled()).toBe(false);
  });

  it('is off when neither is set', () => {
    expect(isArtistPageEnabled()).toBe(false);
  });
});

describe('links', () => {
  it('opens a release in the catalogue and an artist on its own page', () => {
    expect(releaseHref('r 1')).toBe('/dashboard?release=r%201');
    expect(artistHref('a/1')).toBe('/dashboard/artists/a%2F1');
    expect(epkHref('a1')).toBe('/dashboard/press-kits/a1');
  });
});

describe('formatCalendarDate', () => {
  it('keeps the day the date says', () => {
    expect(formatCalendarDate('2026-10-02')).toBe('Oct 2, 2026');
  });

  it('answers null for nothing or junk', () => {
    expect(formatCalendarDate(null)).toBeNull();
    expect(formatCalendarDate('')).toBeNull();
    expect(formatCalendarDate('not a date')).toBeNull();
  });
});

describe('describeArtistCounts', () => {
  it('never prints a zero', () => {
    expect(describeArtistCounts({ releases: 3, planned: 0, live: 0 })).toBe('3 releases');
  });

  it('puts the rest after the total', () => {
    expect(describeArtistCounts({ releases: 1, planned: 1, live: 0 })).toBe(
      '1 release · 1 planned'
    );
  });

  it('says so when there is nothing', () => {
    expect(describeArtistCounts({ releases: 0, planned: 0, live: 0 })).toBe('Nothing yet');
  });
});
