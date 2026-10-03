import { describe, expect, it } from 'vitest';
import {
  distinctRoles,
  distinctTags,
  filterRelationships,
  isStale,
  type FilterableRelationship,
} from './relationships-filter';

const NOW = new Date('2026-10-03T12:00:00Z');

const person = (over: Partial<FilterableRelationship> = {}): FilterableRelationship => ({
  personId: 'p',
  label: 'Tunde Okafor',
  role: 'producer',
  tags: [],
  lastContactAt: null,
  profile: null,
  ...over,
});

const list = [
  person({ personId: 'a', label: 'Tunde Okafor', role: 'producer', tags: ['mixing', 'lagos'], lastContactAt: '2026-10-01T00:00:00Z' }),
  person({ personId: 'b', label: 'Ada Eze', role: 'Video Director', tags: ['lagos'], lastContactAt: '2026-05-01T00:00:00Z' }),
  person({ personId: 'c', label: 'Kemi', role: 'dj', tags: [], lastContactAt: null, profile: { city: 'Abuja', country: 'NG' } }),
];

const ids = (rows: FilterableRelationship[]) => rows.map((r) => r.personId);

describe('filterRelationships', () => {
  it('returns everyone for an empty filter', () => {
    expect(ids(filterRelationships(list, {}, NOW))).toEqual(['a', 'b', 'c']);
  });

  it('searches name, role and tags, in any order and ignoring case and accents', () => {
    expect(ids(filterRelationships(list, { query: 'OKAFOR tunde' }, NOW))).toEqual(['a']);
    expect(ids(filterRelationships(list, { query: 'video' }, NOW))).toEqual(['b']);
    expect(ids(filterRelationships(list, { query: 'mixing' }, NOW))).toEqual(['a']);
  });

  it('searches the city of somebody who has claimed and listed a profile', () => {
    expect(ids(filterRelationships(list, { query: 'abuja' }, NOW))).toEqual(['c']);
  });

  it('filters by role, ignoring case', () => {
    expect(ids(filterRelationships(list, { role: 'VIDEO DIRECTOR' }, NOW))).toEqual(['b']);
  });

  it('filters by tag', () => {
    expect(ids(filterRelationships(list, { tag: 'lagos' }, NOW))).toEqual(['a', 'b']);
  });

  it('finds people not contacted in a while, including people never contacted', () => {
    expect(ids(filterRelationships(list, { staleDays: 90 }, NOW))).toEqual(['b', 'c']);
  });

  it('combines every filter', () => {
    expect(ids(filterRelationships(list, { query: 'ada', tag: 'lagos', staleDays: 90 }, NOW))).toEqual(['b']);
  });
});

describe('isStale', () => {
  it('counts never-contacted as stale', () => {
    expect(isStale(null, 30, NOW)).toBe(true);
  });

  it('is exact at the boundary: contacted exactly N days ago is not yet stale', () => {
    expect(isStale('2026-09-03T12:00:00Z', 30, NOW)).toBe(false);
    expect(isStale('2026-09-03T11:59:00Z', 30, NOW)).toBe(true);
  });

  it('treats an unreadable date as never contacted', () => {
    expect(isStale('nonsense', 30, NOW)).toBe(true);
  });
});

describe('distinctRoles and distinctTags', () => {
  it('lists each once, tidy and sorted, skipping blanks', () => {
    expect(distinctRoles([person({ role: 'dj' }), person({ role: 'DJ' }), person({ role: '' }), person({ role: 'editor' })])).toEqual(['dj', 'editor']);
    expect(distinctTags([person({ tags: ['b', 'a'] }), person({ tags: ['a'] })])).toEqual(['a', 'b']);
  });
});
