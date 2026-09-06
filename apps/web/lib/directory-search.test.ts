import { describe, expect, it } from 'vitest';
import {
  applyDirectoryFilters,
  fallbackCounts,
  type DirectoryEntry,
  type DirectoryFilters,
} from './directory-search';

/**
 * What a manager sees when they look for somebody, and what they are told when
 * nobody comes back.
 *
 * The second half matters more than the first at this size. The brief is
 * explicit that an empty result must never be a bare "no matches", so the
 * fallback counts are a tested part of the feature rather than decoration.
 */

const NONE: DirectoryFilters = { query: '', role: null, city: null, availability: null };

function person(over: Partial<DirectoryEntry> & { userId: string }): DirectoryEntry {
  return {
    displayName: 'Ada Obi',
    city: 'Lagos',
    availability: 'open',
    roles: [{ role: 'graphic_designer', delivered: 2 }],
    ...over,
  };
}

const ADA = person({ userId: 'ada' });
const CHIDI = person({
  userId: 'chidi',
  displayName: 'Chidi Eze',
  city: 'Abuja',
  availability: 'closed',
  roles: [{ role: 'pr', delivered: 1 }],
});
const TOLU = person({
  userId: 'tolu',
  displayName: 'Tolu Bello',
  city: 'Lagos',
  availability: 'selective',
  roles: [{ role: 'graphic_designer', delivered: 0 }],
});

const EVERYONE = [ADA, CHIDI, TOLU];

describe('filters', () => {
  it('returns everyone when nothing is asked', () => {
    // This bar FILTERS a list rather than being a palette that appears on
    // demand, so an empty box means "no filter". searchTasks does the opposite
    // and copying the wrong sibling here would empty the page on arrival.
    expect(applyDirectoryFilters(EVERYONE, NONE)).toHaveLength(3);
  });

  it('finds a person by name, in any word order', () => {
    expect(applyDirectoryFilters(EVERYONE, { ...NONE, query: 'obi ada' })).toEqual([ADA]);
  });

  it('ranks a name that starts with the query first', () => {
    const bello = person({ userId: 'b', displayName: 'Bello Ade' });
    const ade = person({ userId: 'a', displayName: 'Ade Bello' });
    const ranked = applyDirectoryFilters([bello, ade], { ...NONE, query: 'ade' });
    expect(ranked.map((entry) => entry.userId)).toEqual(['a', 'b']);
  });

  it('filters by role, delivered or claimed', () => {
    const designers = applyDirectoryFilters(EVERYONE, { ...NONE, role: 'graphic_designer' });
    expect(designers.map((entry) => entry.userId).sort()).toEqual(['ada', 'tolu']);
  });

  it('filters by city, ignoring case and padding', () => {
    expect(
      applyDirectoryFilters(EVERYONE, { ...NONE, city: '  lagos ' }).map((entry) => entry.userId).sort()
    ).toEqual(['ada', 'tolu']);
  });

  it('filters by availability', () => {
    expect(applyDirectoryFilters(EVERYONE, { ...NONE, availability: 'open' })).toEqual([ADA]);
  });

  it('combines filters', () => {
    expect(
      applyDirectoryFilters(EVERYONE, { ...NONE, city: 'Lagos', availability: 'selective' })
    ).toEqual([TOLU]);
  });
});

describe('fallback counts', () => {
  it('counts from the WHOLE set, not the filtered one', () => {
    // The rule the whole empty state rests on. Computed from the filtered set
    // every suggestion reads zero, which is worse than saying nothing.
    const counts = fallbackCounts(EVERYONE, {
      ...NONE,
      role: 'pr',
      city: 'Lagos',
    });
    expect(counts.withoutCity).toBe(1);
    expect(counts.withoutRole).toBe(2);
  });

  it('counts who is open to work across everyone', () => {
    expect(fallbackCounts(EVERYONE, { ...NONE, role: 'pr', city: 'Lagos' }).openToWork).toBe(1);
  });

  it('reports zero rather than a wrong number when nothing helps', () => {
    const counts = fallbackCounts([CHIDI], { ...NONE, role: 'graphic_designer', city: 'Lagos' });
    expect(counts.withoutCity).toBe(0);
    expect(counts.withoutRole).toBe(0);
  });

  it('does not suggest dropping a filter that is not set', () => {
    // A suggestion to "drop the city" when no city was chosen is nonsense, so
    // the count is null and the line does not render.
    const counts = fallbackCounts(EVERYONE, { ...NONE, role: 'pr' });
    expect(counts.withoutCity).toBeNull();
    expect(counts.withoutRole).toBe(3);
  });
});
