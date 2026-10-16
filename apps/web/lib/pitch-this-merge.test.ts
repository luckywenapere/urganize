import { describe, expect, it } from 'vitest';
import { isReleaseIdShape, kitLinkPath, successorPathForKit } from './press-kit-public';
import { longestKitUrl, noteRoom, noteWithKit } from './pitch-kit-link';
import { groupPlaylistsByCurator } from './curator-groups';
import { promoListHead, promoListRest } from './promo-list';
import { hasEmailableContact } from './release-kit-publish-server';
import type { BrowsablePlaylist } from '@/types/pitching';
import type { PromoChannel } from './promo-channels';

// Pitch this! as one place (URG-321, 2026-10-16): one kit link, the old EPK
// link handing over to it, the kit riding on a pitch, curators as people, and
// promo as a short list.

const RELEASE = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';

describe('the one kit link', () => {
  it('is the artist kit with the rollout on top', () => {
    expect(kitLinkPath('victory', RELEASE)).toBe(`/k/victory?r=${RELEASE}`);
  });

  it('stays the plain artist kit without a release, so every old /k link still works', () => {
    expect(kitLinkPath('victory')).toBe('/k/victory');
    expect(kitLinkPath('victory', null)).toBe('/k/victory');
  });

  it('never puts anything but a uuid in ?r=', () => {
    expect(kitLinkPath('victory', 'drop table')).toBe('/k/victory');
    expect(isReleaseIdShape(`${RELEASE}x`)).toBe(false);
    expect(isReleaseIdShape(RELEASE.toUpperCase())).toBe(true);
  });

  it('hands an old /epk link to the merged kit for that release, once the kit is live', () => {
    const live = { slug: 'victory', publishedAt: '2026-10-16T08:00:00Z' };
    expect(successorPathForKit(live, RELEASE)).toBe(`/k/victory?r=${RELEASE}`);
    expect(successorPathForKit({ slug: 'victory', publishedAt: null }, RELEASE)).toBeNull();
  });
});

describe('the kit goes with a pitch', () => {
  const url = `https://app.urganize.app/k/victory?r=${RELEASE}`;

  it('ends the note with the kit link on its own line', () => {
    expect(noteWithKit('Made in one night.', url, 300)).toBe(`Made in one night.\n\nKit: ${url}`);
    expect(noteWithKit('', url, 300)).toBe(`Kit: ${url}`);
  });

  it('keeps the words and drops the link when both will not fit', () => {
    const words = 'a'.repeat(290);
    expect(noteWithKit(words, url, 300)).toBe(words);
  });

  it('leaves room for the link, even one not minted yet', () => {
    const room = noteRoom(longestKitUrl('https://app.urganize.app'), 300);
    const words = 'a'.repeat(room);
    expect(noteWithKit(words, url, 300).endsWith(url)).toBe(true);
    expect(noteRoom(null, 300)).toBe(300);
  });
});

describe('curators as people', () => {
  const playlist = (id: string, curatorName: string, photo: string | null = null): BrowsablePlaylist => ({
    id,
    name: `List ${id}`,
    curatorName,
    curatorPhotoUrl: photo,
    platform: 'spotify',
    genres: [],
    followerCount: null,
    url: '',
  });

  it('shows one face per curator, holding each of their playlists, in order', () => {
    const groups = groupPlaylistsByCurator([
      playlist('1', 'SoundRise Uncovered'),
      playlist('2', 'BLVK RADIODAILY', 'p.jpg'),
      playlist('3', 'SoundRise Uncovered', 's.jpg'),
    ]);
    expect(groups.map((group) => group.curatorName)).toEqual(['SoundRise Uncovered', 'BLVK RADIODAILY']);
    expect(groups[0].playlists.map((entry) => entry.id)).toEqual(['1', '3']);
    expect(groups[0].photoUrl).toBe('s.jpg');
  });
});

describe('promo as a list', () => {
  const channel = (id: string, over: Partial<PromoChannel> = {}): PromoChannel =>
    ({
      id,
      name: `Channel ${id}`,
      kind: 'radio',
      country: 'NG',
      city: null,
      genres: [],
      howToSubmit: null,
      contact: null,
      url: null,
      cost: 'free',
      leadTime: null,
      leadTimeDays: null,
      ...over,
    }) as PromoChannel;

  it('shows five first and the rest behind "All channels"', () => {
    const channels = Array.from({ length: 15 }, (_, index) => channel(String(index)));
    const head = promoListHead(channels, null);
    expect(head).toHaveLength(5);
    expect(promoListRest(channels, head)).toHaveLength(10);
    expect(new Set([...head, ...promoListRest(channels, head)].map((entry) => entry.id)).size).toBe(15);
  });
});

describe('publishing on Copy kit link', () => {
  it('needs a contact a reader can email, and nothing made up', () => {
    expect(hasEmailableContact({ contacts: [{ name: 'Oyin', role: '', email: 'oyin@example.com' }] })).toBe(true);
    expect(hasEmailableContact({ contacts: [{ name: 'Oyin', role: 'Manager', email: '' }] })).toBe(false);
    expect(hasEmailableContact({})).toBe(false);
  });
});
