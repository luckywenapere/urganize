import { describe, expect, it } from 'vitest';
import { buildArtistChips } from './artists';

describe('buildArtistChips', () => {
  it('returns roster artists', () => {
    const chips = buildArtistChips([], [{ id: 'a1', name: 'Dorian' }]);
    expect(chips).toEqual([{ id: 'a1', name: 'Dorian' }]);
  });

  it('adds an artist from an in-flight release that is missing from the roster read', () => {
    const chips = buildArtistChips([{ artistId: 'a2', artistName: 'Nova' }], [{ id: 'a1', name: 'Dorian' }]);
    expect(chips).toHaveLength(2);
    expect(chips.map((c) => c.id).sort()).toEqual(['a1', 'a2']);
  });

  it('prefers the roster name over a release\'s cached artistName for the same artist', () => {
    const chips = buildArtistChips(
      [{ artistId: 'a1', artistName: 'Stale Cache Name' }],
      [{ id: 'a1', name: 'Dorian (renamed)' }]
    );
    expect(chips).toEqual([{ id: 'a1', name: 'Dorian (renamed)' }]);
  });

  it('does not duplicate an artist seen in both sources', () => {
    const chips = buildArtistChips(
      [
        { artistId: 'a1', artistName: 'Dorian' },
        { artistId: 'a1', artistName: 'Dorian' },
      ],
      [{ id: 'a1', name: 'Dorian' }]
    );
    expect(chips).toHaveLength(1);
  });

  it('returns an empty list with no artists anywhere', () => {
    expect(buildArtistChips([], [])).toEqual([]);
  });
});
