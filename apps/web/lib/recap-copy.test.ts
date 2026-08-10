import { describe, expect, it } from 'vitest';
import {
  RECAP_STATIC_STRINGS,
  formatRecapDate,
  formatRecapNumber,
  parseReleaseDate,
  sanitizeRecapText,
  titleFontSize,
  truncateTitle,
} from './recap-copy';

describe('sanitizeRecapText', () => {
  it('replaces em dashes with a comma and space', () => {
    expect(sanitizeRecapText('Sold out the show — twice')).toBe('Sold out the show, twice');
  });

  it('replaces en dashes too', () => {
    expect(sanitizeRecapText('Radio – national')).toBe('Radio, national');
  });

  it('drops a comma before "and"', () => {
    expect(sanitizeRecapText('Press, radio, and playlists')).toBe('Press, radio and playlists');
  });

  it('does not leave a comma behind when a dash sits before "and"', () => {
    expect(sanitizeRecapText('We shipped it — and it charted')).toBe('We shipped it and it charted');
  });

  it('is case insensitive on the And rule', () => {
    expect(sanitizeRecapText('One, And two')).toBe('One And two');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(sanitizeRecapText('  big   week  ')).toBe('big week');
  });

  it('leaves compliant text untouched', () => {
    expect(sanitizeRecapText('Our best rollout yet')).toBe('Our best rollout yet');
  });
});

describe('static card copy', () => {
  it('contains no em or en dashes', () => {
    for (const value of RECAP_STATIC_STRINGS) {
      expect(value).not.toMatch(/[–—]/);
    }
  });

  it('never puts a comma before "and"', () => {
    for (const value of RECAP_STATIC_STRINGS) {
      expect(value).not.toMatch(/,\s+and\b/i);
    }
  });
});

describe('formatRecapNumber', () => {
  it('adds thousands separators', () => {
    expect(formatRecapNumber(12400)).toBe('12,400');
  });

  it('leaves small numbers alone', () => {
    expect(formatRecapNumber(7)).toBe('7');
  });
});

describe('parseReleaseDate / formatRecapDate', () => {
  it('parses a DATE string at local midnight, not UTC', () => {
    const parsed = parseReleaseDate('2026-08-09');
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(7);
    expect(parsed?.getDate()).toBe(9);
  });

  it('formats a long date', () => {
    expect(formatRecapDate('2026-08-09')).toBe('August 9, 2026');
  });

  it('returns null for a missing date', () => {
    expect(formatRecapDate(null)).toBeNull();
    expect(formatRecapDate('')).toBeNull();
  });

  it('returns null for an unparseable date', () => {
    expect(formatRecapDate('not-a-date')).toBeNull();
  });
});

describe('truncateTitle', () => {
  it('leaves short titles alone', () => {
    expect(truncateTitle('Free')).toBe('Free');
  });

  it('truncates long titles with a single ellipsis character', () => {
    const long = 'A'.repeat(90);
    const result = truncateTitle(long);
    expect(result).toHaveLength(60);
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toContain('...');
  });
});

describe('titleFontSize', () => {
  it('scales down as the title grows', () => {
    const short = titleFontSize('Free', 'story');
    const medium = titleFontSize('A'.repeat(20), 'story');
    const long = titleFontSize('A'.repeat(50), 'story');
    expect(short).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(long);
  });

  it('renders smaller on the square canvas than the story canvas', () => {
    expect(titleFontSize('Free', 'square')).toBeLessThan(titleFontSize('Free', 'story'));
  });

  it('sizes a truncated title by its truncated length', () => {
    expect(titleFontSize('A'.repeat(200), 'story')).toBe(titleFontSize('A'.repeat(60), 'story'));
  });
});
