import { describe, expect, it } from 'vitest';
import {
  DIRECTORY_DEMAND_SOURCES,
  bucketResultCount,
  isSameUtcDayAs,
  parseDirectoryDemand,
} from './directory-demand';

describe('parseDirectoryDemand', () => {
  it('accepts a real role, a decision and a source', () => {
    expect(parseDirectoryDemand({ role: 'graphic_designer', matched: false, source: 'search' })).toEqual({
      role: 'graphic_designer',
      matched: false,
      source: 'search',
    });
  });

  it('accepts the role gap panel as a source', () => {
    const parsed = parseDirectoryDemand({ role: 'pr', matched: true, source: 'role_gap' });
    expect(parsed?.source).toBe('role_gap');
  });

  it('rejects a role outside the vocabulary', () => {
    expect(parseDirectoryDemand({ role: 'wizard', matched: false, source: 'search' })).toBeNull();
  });

  it('rejects an unknown source rather than defaulting one', () => {
    // A source we did not define cannot be aggregated, and guessing 'search'
    // would silently attribute plan-seeded demand to hand typing.
    expect(parseDirectoryDemand({ role: 'pr', matched: true, source: 'email' })).toBeNull();
  });

  it('rejects a missing decision', () => {
    expect(parseDirectoryDemand({ role: 'pr', source: 'search' })).toBeNull();
  });

  it('carries no free text, whatever the caller sends', () => {
    // THE PRIVACY RULE. Somebody typing a person's name into the search box is
    // making a private search, and it must never reach a durable server row.
    // The parser is an allowlist of three fields for exactly this reason.
    const parsed = parseDirectoryDemand({
      role: 'pr',
      matched: false,
      source: 'search',
      query: 'jane doe',
      city: 'Lagos',
      email: 'jane@example.com',
    });
    expect(parsed).toEqual({ role: 'pr', matched: false, source: 'search' });
    expect(JSON.stringify(parsed)).not.toContain('jane');
  });

  it('rejects a non-object', () => {
    expect(parseDirectoryDemand(null)).toBeNull();
    expect(parseDirectoryDemand('graphic_designer')).toBeNull();
  });

  it('lists both sources', () => {
    expect([...DIRECTORY_DEMAND_SOURCES].sort()).toEqual(['role_gap', 'search']);
  });
});

describe('isSameUtcDayAs', () => {
  it('is true within one UTC day', () => {
    expect(isSameUtcDayAs('2026-09-05T01:00:00.000Z', new Date('2026-09-05T23:59:00.000Z'))).toBe(true);
  });

  it('is false across the boundary', () => {
    expect(isSameUtcDayAs('2026-09-05T23:59:00.000Z', new Date('2026-09-06T00:01:00.000Z'))).toBe(false);
  });

  it('treats no previous record as a new day', () => {
    // Nothing recorded means record it. Erring the other way would lose the
    // very first row for every role.
    expect(isSameUtcDayAs(null, new Date())).toBe(false);
  });

  it('treats an unreadable timestamp as a new day', () => {
    expect(isSameUtcDayAs('not a date', new Date())).toBe(false);
  });
});

describe('bucketResultCount', () => {
  it('reports zero exactly, because zero is the signal', () => {
    expect(bucketResultCount(0)).toBe('0');
  });

  it('buckets everything else', () => {
    expect(bucketResultCount(1)).toBe('1-4');
    expect(bucketResultCount(4)).toBe('1-4');
    expect(bucketResultCount(5)).toBe('5-19');
    expect(bucketResultCount(19)).toBe('5-19');
    expect(bucketResultCount(20)).toBe('20+');
    expect(bucketResultCount(500)).toBe('20+');
  });
});
