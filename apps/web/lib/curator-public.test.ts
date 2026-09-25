import { describe, expect, it } from 'vitest';
import {
  buildPublicCuratorPayload,
  curatorPageDescription,
  curatorPagePath,
  isCuratorPageLive,
  isValidCuratorSlug,
  PUBLIC_CURATOR_PAGE_KEYS,
  PUBLIC_CURATOR_PLAYLIST_KEYS,
  suggestCuratorSlug,
} from './curator-public';

/**
 * The payload builder is the whole privacy boundary for /pitch/{slug}: the
 * loader reads through a service-role client, so nothing in the database is
 * stopping a leak. These tests are what stops one.
 */

const profileRow = (over: Record<string, unknown> = {}) => ({
  slug: 'soundrise',
  display_name: 'SoundRise',
  bio: 'Afrobeats and alte. Refreshed every Friday.',
  // Columns the query legitimately reads and the page must never show.
  user_id: '11111111-1111-1111-1111-111111111111',
  photo_path: 'curator/11111111/photo/a.jpg',
  invite_id: '22222222-2222-2222-2222-222222222222',
  published_at: '2026-09-15T10:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

const playlistRow = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'SoundRise Uncovered',
  platform: 'spotify',
  genres: ['afrobeats', 'alte'],
  follower_count: 12000,
  url: 'https://open.spotify.com/playlist/abc',
  curator_user_id: '11111111-1111-1111-1111-111111111111',
  ...over,
});

describe('buildPublicCuratorPayload', () => {
  it('exposes exactly the allowed keys and nothing else', () => {
    const page = buildPublicCuratorPayload(profileRow(), [playlistRow()], 'https://signed');
    expect(page).not.toBeNull();
    expect(Object.keys(page!).sort()).toEqual([...PUBLIC_CURATOR_PAGE_KEYS].sort());
    expect(Object.keys(page!.playlists[0]).sort()).toEqual([...PUBLIC_CURATOR_PLAYLIST_KEYS].sort());
  });

  it('never leaks the columns the query has to read', () => {
    const page = buildPublicCuratorPayload(profileRow(), [playlistRow()], 'https://signed');
    const serialized = JSON.stringify(page);
    for (const secret of [
      '11111111-1111-1111-1111-111111111111',
      'curator/11111111/photo/a.jpg',
      '22222222-2222-2222-2222-222222222222',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('does not carry a column added to the table later', () => {
    const page = buildPublicCuratorPayload(
      profileRow({ payout_email: 'her@example.com', internal_note: 'do not show' }),
      [playlistRow({ submission_count: 91 })],
      null
    );
    const serialized = JSON.stringify(page);
    expect(serialized).not.toContain('her@example.com');
    expect(serialized).not.toContain('do not show');
    expect(serialized).not.toContain('91');
  });

  it('refuses a row with no slug or no display name', () => {
    expect(buildPublicCuratorPayload(profileRow({ slug: '' }), [], null)).toBeNull();
    expect(buildPublicCuratorPayload(profileRow({ slug: null }), [], null)).toBeNull();
    expect(buildPublicCuratorPayload(profileRow({ display_name: '   ' }), [], null)).toBeNull();
  });

  it('drops a playlist with no id or no name rather than the page', () => {
    const page = buildPublicCuratorPayload(
      profileRow(),
      [playlistRow(), playlistRow({ id: 'p2', name: '' }), playlistRow({ id: '', name: 'Nameless' })],
      null
    );
    expect(page!.playlists).toHaveLength(1);
  });

  it('keeps a zero follower count and nulls a missing one', () => {
    const page = buildPublicCuratorPayload(
      profileRow(),
      [playlistRow({ follower_count: 0 }), playlistRow({ id: 'p2', follower_count: null })],
      null
    );
    expect(page!.playlists[0].followerCount).toBe(0);
    expect(page!.playlists[1].followerCount).toBeNull();
  });

  it('carries no photo when none signed', () => {
    const page = buildPublicCuratorPayload(profileRow(), [], null);
    expect(page!.photoUrl).toBeNull();
  });
});

describe('isCuratorPageLive', () => {
  it('is the only gate, and an absent timestamp closes it', () => {
    expect(isCuratorPageLive('2026-09-15T10:00:00.000Z')).toBe(true);
    expect(isCuratorPageLive(null)).toBe(false);
    expect(isCuratorPageLive(undefined)).toBe(false);
    expect(isCuratorPageLive('')).toBe(false);
  });
});

describe('slugs', () => {
  it('accepts what the database accepts', () => {
    for (const slug of ['ab', 'soundrise', 'sound-rise-uncovered', 'a1', 'x9-7', 'a'.repeat(60)]) {
      expect(isValidCuratorSlug(slug)).toBe(true);
    }
  });

  it('refuses what the database refuses', () => {
    for (const slug of ['A', 'Sound', '-lead', 'trail-', 'dou--ble', 'a', 'a'.repeat(61), 'has space', 'under_score', 'dot.dot', '']) {
      expect(isValidCuratorSlug(slug)).toBe(false);
    }
  });

  it('suggests a handle a person would recognise as their name', () => {
    expect(suggestCuratorSlug('SoundRise Uncovered')).toBe('soundrise-uncovered');
    expect(suggestCuratorSlug("D'Prince")).toBe('dprince');
    expect(suggestCuratorSlug('Béla Radio')).toBe('bela-radio');
  });

  it('suggests nothing when a name has nothing usable in it', () => {
    expect(suggestCuratorSlug('!!!')).toBeNull();
    expect(suggestCuratorSlug('x')).toBeNull();
  });

  it('never suggests something the database would refuse', () => {
    for (const name of ['SoundRise Uncovered', "D'Prince", 'Béla Radio', 'A'.repeat(90), 'Afro -- Beats']) {
      const slug = suggestCuratorSlug(name);
      if (slug) expect(isValidCuratorSlug(slug)).toBe(true);
    }
  });
});

describe('curatorPagePath', () => {
  it('is the path a curator posts', () => {
    expect(curatorPagePath('soundrise')).toBe('/pitch/soundrise');
  });
});

describe('curatorPageDescription', () => {
  const page = { slug: 's', displayName: 'SoundRise', bio: '', photoUrl: null, playlists: [] };

  it('uses her own words when she wrote some', () => {
    expect(curatorPageDescription({ ...page, bio: 'Afrobeats and alte.' })).toBe('Afrobeats and alte.');
  });

  it('trims a long bio rather than inventing a short one', () => {
    const out = curatorPageDescription({ ...page, bio: 'x'.repeat(400) });
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out.endsWith('...')).toBe(true);
  });

  it('falls back to a plain sentence, never an invented claim', () => {
    expect(curatorPageDescription(page)).toBe('Pitch your music to SoundRise on Urganize.');
  });
});
