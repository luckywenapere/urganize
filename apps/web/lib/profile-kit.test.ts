import { describe, expect, it } from 'vitest';
import {
  bioForPayload,
  isClaimedProfile,
  kitFieldNames,
  kitFactsFromPublished,
  pickArtistForMember,
  resolveProfileView,
  type KitFacts,
} from './profile-kit';

const kit = (over: Partial<KitFacts> = {}): KitFacts => ({
  artistId: 'artist-1',
  artistName: 'Dorian',
  slug: 'dorian',
  descriptor: 'Lagos alt-pop',
  homeCity: 'Lagos, Nigeria',
  genre: 'Alt-pop, R&B',
  bios: { short: 'Short bio.', medium: 'Medium bio.', long: 'Long bio.' },
  links: [{ label: 'Spotify', url: 'https://open.spotify.com/artist/1' }],
  photoUrl: 'https://signed.example/photo.jpg',
  ...over,
});

const profile = {
  bio: 'My own bio.',
  city: 'Abuja',
  country: 'Nigeria',
  links: [{ label: 'Site', url: 'https://example.com' }],
};

describe('isClaimedProfile / bioForPayload', () => {
  it('a profile with no user is unclaimed, whatever else the row says', () => {
    expect(isClaimedProfile({ userId: null })).toBe(false);
    expect(isClaimedProfile({ userId: '' })).toBe(false);
    expect(isClaimedProfile({ userId: 'u1' })).toBe(true);
  });

  it('an explicit unclaimed status wins even if a user id is somehow present', () => {
    expect(isClaimedProfile({ userId: 'u1', status: 'unclaimed' })).toBe(false);
    expect(isClaimedProfile({ userId: 'u1', status: 'claimed' })).toBe(true);
  });

  it('never returns a bio for an unclaimed profile', () => {
    expect(bioForPayload({ userId: null, bio: 'Typed by a team' })).toBeNull();
    expect(bioForPayload({ userId: 'u1', status: 'unclaimed', bio: 'x' })).toBeNull();
  });

  it('returns the bio for a claimed profile', () => {
    expect(bioForPayload({ userId: 'u1', bio: 'Hello' })).toBe('Hello');
    expect(bioForPayload({ userId: 'u1', bio: null })).toBeNull();
  });
});

describe('pickArtistForMember', () => {
  it('links a member scoped to exactly one artist', () => {
    expect(pickArtistForMember(['a1'])).toBe('a1');
    expect(pickArtistForMember(['a1', 'a1', null])).toBe('a1');
  });

  it('refuses a guess when there are several artists or none', () => {
    expect(pickArtistForMember(['a1', 'a2'])).toBeNull();
    expect(pickArtistForMember([null, null])).toBeNull();
    expect(pickArtistForMember([])).toBeNull();
  });
});

describe('resolveProfileView', () => {
  it('with no kit, shows the profile own fields and says so', () => {
    const view = resolveProfileView(profile, null);
    expect(view.source).toBe('profile');
    expect(view.bio).toBe('My own bio.');
    expect(view.location).toBe('Abuja, Nigeria');
    expect(view.links).toEqual(profile.links);
    expect(view.photoUrl).toBeNull();
    expect(view.genre).toBeNull();
    expect(view.kit).toBeNull();
  });

  it('with a published kit, the kit wins field by field', () => {
    const view = resolveProfileView(profile, kit());
    expect(view.source).toBe('kit');
    expect(view.bio).toBe('Medium bio.');
    expect(view.location).toBe('Lagos, Nigeria');
    expect(view.genre).toBe('Alt-pop, R&B');
    expect(view.photoUrl).toBe('https://signed.example/photo.jpg');
    expect(view.links).toEqual([{ label: 'Spotify', url: 'https://open.spotify.com/artist/1' }]);
    expect(view.kit).toEqual({ artistId: 'artist-1', artistName: 'Dorian', slug: 'dorian' });
  });

  it('falls back per field when the kit leaves one empty', () => {
    const view = resolveProfileView(
      profile,
      kit({ bios: { short: '', medium: '', long: '' }, homeCity: '', links: [] })
    );
    expect(view.bio).toBe('My own bio.');
    expect(view.location).toBe('Abuja, Nigeria');
    expect(view.links).toEqual(profile.links);
    // Fields the kit did fill still come from the kit.
    expect(view.genre).toBe('Alt-pop, R&B');
    expect(view.fromKit.bio).toBe(false);
    expect(view.fromKit.genre).toBe(true);
  });

  it('prefers medium, then short, then long for the bio', () => {
    expect(resolveProfileView(profile, kit({ bios: { short: 'S', medium: '', long: 'L' } })).bio).toBe('S');
    expect(resolveProfileView(profile, kit({ bios: { short: '', medium: '', long: 'L' } })).bio).toBe('L');
  });

  it('reports which fields came from the kit', () => {
    const view = resolveProfileView(profile, kit());
    expect(view.fromKit).toEqual({ bio: true, location: true, links: true, photo: true, genre: true });
  });

  it('caps links at six', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, url: `https://e.com/${i}` }));
    expect(resolveProfileView(profile, kit({ links: many })).links).toHaveLength(6);
  });
});

describe('kitFactsFromPublished', () => {
  const published = (byKey: Record<string, Record<string, unknown>>) => ({
    kitId: 'k1',
    slug: 'dorian',
    artistName: 'Dorian',
    byKey,
    photos: [{ url: 'https://signed.example/1.jpg' }, { url: 'https://signed.example/2.jpg' }],
  });

  it('reads only what the published sections hold', () => {
    const facts = kitFactsFromPublished(
      'artist-1',
      published({
        header: { descriptor: ' One line ', homeCity: 'Lagos', genreTags: 'Afrobeats' },
        bios: { short: 'S', medium: 'M', long: 'L' },
        links: { links: [{ label: 'Spotify', url: 'https://open.spotify.com/a' }] },
      })
    );
    expect(facts.descriptor).toBe('One line');
    expect(facts.homeCity).toBe('Lagos');
    expect(facts.genre).toBe('Afrobeats');
    expect(facts.bios.medium).toBe('M');
    expect(facts.links).toEqual([{ label: 'Spotify', url: 'https://open.spotify.com/a' }]);
    expect(facts.photoUrl).toBe('https://signed.example/1.jpg');
  });

  it('a section that is hidden or unpublished is simply absent, so it falls back', () => {
    const facts = kitFactsFromPublished('artist-1', published({}));
    expect(facts.bios).toEqual({ short: '', medium: '', long: '' });
    expect(facts.links).toEqual([]);
    expect(facts.homeCity).toBe('');
  });

  it('drops a link that is not a safe web address', () => {
    const facts = kitFactsFromPublished(
      'artist-1',
      published({ links: { links: [{ label: 'x', url: 'javascript:alert(1)' }, { label: 'Ok', url: 'https://ok.example' }] } })
    );
    expect(facts.links).toEqual([{ label: 'Ok', url: 'https://ok.example/' }]);
  });

  it('has no photo when the kit has none', () => {
    const facts = kitFactsFromPublished('artist-1', { ...published({}), photos: [] });
    expect(facts.photoUrl).toBeNull();
  });
});

describe('kitFieldNames', () => {
  it('names only what the kit supplies, in a fixed order', () => {
    const view = resolveProfileView(profile, kit());
    expect(kitFieldNames(view)).toEqual(['your bio', 'your photo', 'where you are', 'your genre', 'your links']);
    const partial = resolveProfileView(profile, kit({ photoUrl: null, genre: '', links: [] }));
    expect(kitFieldNames(partial)).toEqual(['your bio', 'where you are']);
    expect(kitFieldNames(resolveProfileView(profile, null))).toEqual([]);
  });
});

describe('own photo', () => {
  it('wins over the kit photo, and the kit photo is the fallback', () => {
    const own = resolveProfileView({ ...profile, avatarUrl: 'https://signed/own.jpg' }, kit());
    expect(own.photoUrl).toBe('https://signed/own.jpg');
    expect(own.fromKit.photo).toBe(false);
    expect(kitFieldNames(own)).not.toContain('your photo');

    const fallback = resolveProfileView({ ...profile, avatarUrl: null }, kit());
    expect(fallback.fromKit.photo).toBe(true);
  });

  it('shows with no kit at all', () => {
    expect(resolveProfileView({ ...profile, avatarUrl: 'https://signed/own.jpg' }, null).photoUrl).toBe(
      'https://signed/own.jpg'
    );
  });
});
