import { describe, expect, it } from 'vitest';
import { searchReleases, type SearchableRelease } from './release-search';

/**
 * The catalog bar's filter. The rule most worth pinning is the one that differs
 * from the activity search: an empty query returns EVERYTHING here, because
 * this bar filters a list the user is already looking at.
 */

const make = (title: string, artistName: string | null = 'Dorian'): SearchableRelease => ({
  release: { title, artistName },
});

const titles = (entries: SearchableRelease[]) => entries.map((entry) => entry.release.title);

describe('searchReleases', () => {
  it('returns the list unchanged for an empty query', () => {
    const releases = [make('Midnight EP'), make('Lagos Nights')];
    expect(searchReleases(releases, '')).toBe(releases);
    expect(searchReleases(releases, '   ')).toBe(releases);
  });

  it('filters by a word in the title', () => {
    const releases = [make('Midnight EP'), make('Lagos Nights')];
    expect(titles(searchReleases(releases, 'lagos'))).toEqual(['Lagos Nights']);
  });

  it('is case-insensitive', () => {
    expect(titles(searchReleases([make('Midnight EP')], 'MIDNIGHT'))).toEqual(['Midnight EP']);
  });

  it('matches terms in any order', () => {
    expect(titles(searchReleases([make('Lagos Nights Deluxe')], 'nights lagos'))).toEqual([
      'Lagos Nights Deluxe',
    ]);
  });

  it('ranks a title that STARTS with the query above one that merely contains it', () => {
    const releases = [make('The Midnight Tape'), make('Midnight EP')];
    expect(titles(searchReleases(releases, 'midnight'))).toEqual([
      'Midnight EP',
      'The Midnight Tape',
    ]);
  });

  it('finds a release by its artist name', () => {
    const releases = [make('Midnight EP', 'Dorian'), make('Lagos Nights', 'Tems')];
    expect(titles(searchReleases(releases, 'tems'))).toEqual(['Lagos Nights']);
  });

  it('ranks a title match above an artist match', () => {
    const releases = [make('Sunrise', 'Midnight Collective'), make('Midnight EP', 'Dorian')];
    expect(titles(searchReleases(releases, 'midnight'))).toEqual(['Midnight EP', 'Sunrise']);
  });

  it('ranks a MID-title match above an artist match too', () => {
    // The case that separates tier 1 from tier 2. Without it, deleting the
    // title-contains tier still passes every other test, because a
    // title-contains match falls through to the combined title+artist tier
    // and lands in the same relative position.
    const releases = [make('Sunrise', 'Midnight Collective'), make('The Midnight Tape', 'Dorian')];
    expect(titles(searchReleases(releases, 'midnight'))).toEqual([
      'The Midnight Tape',
      'Sunrise',
    ]);
  });

  it('spans title and artist for a multi-word query', () => {
    const releases = [make('Midnight EP', 'Dorian')];
    expect(titles(searchReleases(releases, 'midnight dorian'))).toEqual(['Midnight EP']);
  });

  it('tolerates a null artist name', () => {
    const releases = [make('Midnight EP', null)];
    expect(() => searchReleases(releases, 'dorian')).not.toThrow();
    expect(searchReleases(releases, 'dorian')).toEqual([]);
    expect(titles(searchReleases(releases, 'midnight'))).toEqual(['Midnight EP']);
  });

  it('is empty when nothing matches — the caller shows a no-match state', () => {
    expect(searchReleases([make('Midnight EP')], 'zzz')).toEqual([]);
  });

  it('preserves the incoming order for equally-ranked matches', () => {
    const releases = [make('Midnight Three'), make('Midnight One'), make('Midnight Two')];
    expect(titles(searchReleases(releases, 'midnight'))).toEqual([
      'Midnight Three',
      'Midnight One',
      'Midnight Two',
    ]);
  });

  it('does not cap the results — it is a filter, not a palette', () => {
    const releases = Array.from({ length: 30 }, (_, index) => make(`Midnight ${index}`));
    expect(searchReleases(releases, 'midnight')).toHaveLength(30);
  });

  it('is empty for an empty catalog', () => {
    expect(searchReleases([], 'midnight')).toEqual([]);
  });

  it('carries the caller\'s own card shape through unchanged', () => {
    // The generic exists so WorkspaceView can hand it ReleaseCardData and get
    // ReleaseCardData back, rather than the structural slice.
    const card = { release: { title: 'Midnight EP', artistName: 'Dorian' }, tasksDone: 3 };
    const [match] = searchReleases([card], 'midnight');
    expect(match.tasksDone).toBe(3);
  });
});
