import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeLastContact, isRelationshipsPageEnabled, parseTagInput, relationshipHref } from './relationships-page';

const NOW = new Date('2026-10-03T12:00:00Z');

describe('isRelationshipsPageEnabled', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('needs both flags', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_RELATIONSHIPS', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_WORKSPACE', '');
    expect(isRelationshipsPageEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_WORKSPACE', 'true');
    expect(isRelationshipsPageEnabled()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_RELATIONSHIPS', 'false');
    expect(isRelationshipsPageEnabled()).toBe(false);
  });
});

describe('describeLastContact', () => {
  it('says plainly when nobody has been in touch', () => {
    expect(describeLastContact(null, NOW)).toBe('Not contacted yet');
    expect(describeLastContact('nonsense', NOW)).toBe('Not contacted yet');
  });

  it('counts days, then months, then years', () => {
    expect(describeLastContact('2026-10-03T08:00:00Z', NOW)).toBe('Contacted today');
    expect(describeLastContact('2026-10-02T08:00:00Z', NOW)).toBe('Contacted yesterday');
    expect(describeLastContact('2026-09-23T12:00:00Z', NOW)).toBe('Contacted 10 days ago');
    expect(describeLastContact('2026-05-03T12:00:00Z', NOW)).toBe('Contacted 5 months ago');
    expect(describeLastContact('2023-10-03T12:00:00Z', NOW)).toBe('Contacted 3 years ago');
  });
});

describe('parseTagInput', () => {
  it('splits, trims, lowercases and dedupes', () => {
    expect(parseTagInput(' Mixing, lagos\nMIXING,, ')).toEqual(['mixing', 'lagos']);
    expect(parseTagInput('')).toEqual([]);
  });
});

describe('relationshipHref', () => {
  it('encodes the id', () => {
    expect(relationshipHref('a b')).toBe('/dashboard/relationships/a%20b');
  });
});
