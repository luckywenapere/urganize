import { describe, expect, it } from 'vitest';
import {
  canImportOnto,
  chooseSurvivor,
  findDuplicatePairs,
  findRosterMatches,
  namesLookAlike,
  pairKey,
  type MergeCandidate,
} from './artist-merge';

function artist(over: Partial<MergeCandidate> & { id: string; name: string }): MergeCandidate {
  return { createdVia: 'manual', hasPhoto: false, rollouts: 0, createdAt: '2026-10-01T00:00:00Z', ...over };
}

describe('namesLookAlike', () => {
  it('matches when one name sits inside the other as whole words', () => {
    expect(namesLookAlike('Dorian', 'Babyboy Dorian')).toBe(true);
    expect(namesLookAlike('Babyboy Dorian', 'dorian')).toBe(true);
  });

  it('ignores case, spaces and symbols', () => {
    expect(namesLookAlike('T3N', 't-3-n')).toBe(true);
    expect(namesLookAlike('Burna Boy', 'BURNA  BOY!')).toBe(true);
    expect(namesLookAlike('Beyoncé', 'Beyonce')).toBe(true);
  });

  it('does not match part of a word', () => {
    expect(namesLookAlike('Dor', 'Dorian')).toBe(false);
    expect(namesLookAlike('Ian', 'Dorian')).toBe(false);
  });

  it('does not match on a name shorter than three letters', () => {
    expect(namesLookAlike('DJ', 'DJ Spinall')).toBe(false);
    expect(namesLookAlike('', 'Dorian')).toBe(false);
  });

  it('does not match different names', () => {
    expect(namesLookAlike('Wizkid', 'Davido')).toBe(false);
  });
});

describe('chooseSurvivor', () => {
  it('keeps the one the team made over the imported one', () => {
    const made = artist({ id: 'a', name: 'Dorian' });
    const imported = artist({ id: 'b', name: 'Babyboy Dorian', createdVia: 'import', rollouts: 3, hasPhoto: true });
    expect(chooseSurvivor(made, imported)).toEqual({ keep: made, drop: imported });
    expect(chooseSurvivor(imported, made)).toEqual({ keep: made, drop: imported });
  });

  it('then the one with a photo, then more rollouts, then the older one', () => {
    const photo = artist({ id: 'a', name: 'X1', hasPhoto: true });
    const none = artist({ id: 'b', name: 'X2', rollouts: 5 });
    expect(chooseSurvivor(none, photo).keep.id).toBe('a');

    const more = artist({ id: 'c', name: 'X3', rollouts: 2 });
    const fewer = artist({ id: 'd', name: 'X4', rollouts: 1, createdAt: '2026-01-01T00:00:00Z' });
    expect(chooseSurvivor(fewer, more).keep.id).toBe('c');

    const older = artist({ id: 'e', name: 'X5', createdAt: '2026-01-01T00:00:00Z' });
    const newer = artist({ id: 'f', name: 'X6' });
    expect(chooseSurvivor(newer, older).keep.id).toBe('e');
  });
});

describe('findDuplicatePairs', () => {
  const dorian = artist({ id: 'a1', name: 'Dorian', hasPhoto: true, rollouts: 1 });
  const t3n = artist({ id: 'a2', name: 'T3N' });
  const babyboy = artist({ id: 'a3', name: 'Babyboy Dorian', createdVia: 'import', rollouts: 1 });

  it('finds the Dorian pair and keeps the made one', () => {
    const pairs = findDuplicatePairs([dorian, t3n, babyboy], new Set());
    expect(pairs).toHaveLength(1);
    expect(pairs[0].keep.id).toBe('a1');
    expect(pairs[0].drop.id).toBe('a3');
  });

  it('leaves out a pair the team said is different, in either order', () => {
    expect(findDuplicatePairs([dorian, babyboy], new Set([pairKey('a3', 'a1')]))).toEqual([]);
  });

  it('never offers the same artist twice in one pass', () => {
    const third = artist({ id: 'a4', name: 'Dorian Live' });
    const pairs = findDuplicatePairs([dorian, babyboy, third], new Set());
    const ids = pairs.flatMap((pair) => [pair.keep.id, pair.drop.id]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('canImportOnto', () => {
  it('lets the team owner add releases to any of their artists', () => {
    expect(canImportOnto({ isOwner: true, role: undefined, scopeArtistId: null, artistId: 'a1' })).toBe(true);
  });

  it('lets a teammate who sees every artist add to any of them', () => {
    expect(canImportOnto({ isOwner: false, role: 'member', scopeArtistId: null, artistId: 'a1' })).toBe(true);
    expect(canImportOnto({ isOwner: false, role: 'admin', scopeArtistId: null, artistId: 'a1' })).toBe(true);
  });

  it('lets a teammate limited to one artist add only to that artist', () => {
    expect(canImportOnto({ isOwner: false, role: 'member', scopeArtistId: 'a1', artistId: 'a1' })).toBe(true);
    expect(canImportOnto({ isOwner: false, role: 'member', scopeArtistId: 'a1', artistId: 'a2' })).toBe(false);
  });

  it('never lets a guest or a non-member add', () => {
    expect(canImportOnto({ isOwner: false, role: 'guest', scopeArtistId: null, artistId: 'a1' })).toBe(false);
    expect(canImportOnto({ isOwner: false, role: undefined, scopeArtistId: null, artistId: 'a1' })).toBe(false);
  });
});

describe('findRosterMatches', () => {
  const roster = [
    { id: 'a1', name: 'Dorian' },
    { id: 'a2', name: 'T3N' },
  ];

  it('returns roster artists the picked name looks like', () => {
    expect(findRosterMatches('Babyboy Dorian', roster).map((a) => a.id)).toEqual(['a1']);
  });

  it('returns nothing on an exact name, which the import already joins', () => {
    expect(findRosterMatches('dorian', roster)).toEqual([]);
  });

  it('returns nothing when no one looks alike', () => {
    expect(findRosterMatches('Wizkid', roster)).toEqual([]);
  });
});
