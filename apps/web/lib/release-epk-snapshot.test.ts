import { describe, expect, it } from 'vitest';
import {
  MAX_SNAPSHOT_TEXT,
  planKitSnapshots,
  readKitSnapshot,
  type KitSnapshot,
} from './release-epk-snapshot';

const kit = (over: Partial<KitSnapshot> = {}): KitSnapshot => ({
  id: 'kit-1',
  artistId: 'artist-1',
  slug: 'dorian',
  state: 'published',
  publishedAt: '2026-09-01T10:00:00.000Z',
  descriptor: 'Afro-fusion singer',
  shortBio: 'Dorian writes songs about home.',
  contactCount: 2,
  ...over,
});

const release = (over: Partial<{ id: string; ownerUserId: string; artistId: string }> = {}) => ({
  id: 'rel-1',
  ownerUserId: 'owner-1',
  artistId: 'artist-1',
  ...over,
});

describe('planKitSnapshots', () => {
  it('freezes the artist kit onto a delivered release that has none yet', () => {
    const plan = planKitSnapshots({
      delivered: [release()],
      alreadySnapshotted: new Set(),
      kitsByArtist: new Map([['artist-1', kit()]]),
    });
    expect(plan).toEqual([{ releaseId: 'rel-1', ownerUserId: 'owner-1', snapshot: kit() }]);
  });

  it('never touches a release that is already frozen, so a later edit cannot reach it', () => {
    const plan = planKitSnapshots({
      delivered: [release()],
      alreadySnapshotted: new Set(['rel-1']),
      kitsByArtist: new Map([['artist-1', kit({ shortBio: 'Rewritten later' })]]),
    });
    expect(plan).toEqual([]);
  });

  it('skips a release whose artist has no kit, so there is nothing to freeze', () => {
    const plan = planKitSnapshots({
      delivered: [release({ artistId: 'artist-9' })],
      alreadySnapshotted: new Set(),
      kitsByArtist: new Map([['artist-1', kit()]]),
    });
    expect(plan).toEqual([]);
  });

  it('skips a release with no artist at all', () => {
    const plan = planKitSnapshots({
      delivered: [release({ artistId: '' })],
      alreadySnapshotted: new Set(),
      kitsByArtist: new Map([['artist-1', kit()]]),
    });
    expect(plan).toEqual([]);
  });

  it('freezes each release against its own artist', () => {
    const plan = planKitSnapshots({
      delivered: [release({ id: 'a', artistId: 'artist-1' }), release({ id: 'b', artistId: 'artist-2' })],
      alreadySnapshotted: new Set(),
      kitsByArtist: new Map([
        ['artist-1', kit({ slug: 'one' })],
        ['artist-2', kit({ slug: 'two', artistId: 'artist-2' })],
      ]),
    });
    expect(plan.map((p) => [p.releaseId, p.snapshot.slug])).toEqual([
      ['a', 'one'],
      ['b', 'two'],
    ]);
  });

  it('clamps text so one huge bio cannot bloat a row', () => {
    const plan = planKitSnapshots({
      delivered: [release()],
      alreadySnapshotted: new Set(),
      kitsByArtist: new Map([['artist-1', kit({ shortBio: 'x'.repeat(MAX_SNAPSHOT_TEXT + 500) })]]),
    });
    expect(plan[0].snapshot.shortBio).toHaveLength(MAX_SNAPSHOT_TEXT);
  });
});

describe('readKitSnapshot', () => {
  it('round trips what planKitSnapshots wrote', () => {
    expect(readKitSnapshot(JSON.parse(JSON.stringify(kit())))).toEqual(kit());
  });

  it('answers null for anything that is not a snapshot, so the live kit is used', () => {
    for (const raw of [null, undefined, 'x', 5, [], {}, { slug: 5 }]) {
      expect(readKitSnapshot(raw)).toBeNull();
    }
  });

  it('keeps a null publishedAt and defaults missing text to empty', () => {
    const read = readKitSnapshot({ id: 'k', artistId: 'a', slug: 's', state: 'ready', publishedAt: null });
    expect(read).toEqual({
      id: 'k',
      artistId: 'a',
      slug: 's',
      state: 'ready',
      publishedAt: null,
      descriptor: '',
      shortBio: '',
      contactCount: 0,
    });
  });

  it('never reports a negative or fractional contact count', () => {
    const base = { id: 'k', artistId: 'a', slug: 's', state: 'ready' };
    expect(readKitSnapshot({ ...base, contactCount: -3 })?.contactCount).toBe(0);
    expect(readKitSnapshot({ ...base, contactCount: 2.7 })?.contactCount).toBe(2);
  });
});
