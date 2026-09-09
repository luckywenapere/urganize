import { describe, expect, it } from 'vitest';
import { ASSET_SIZE_LIMITS } from './asset-constants';
import type { SentPitch } from '@/types/pitching';
import {
  acceptsPitchReply,
  countWaitingPitches,
  describeSentPitchScope,
  groupPitchesByRelease,
  detectPitchPlatform,
  formatFollowerCount,
  isPitchPlatform,
  isPitchStatus,
  isValidSongUrl,
  MAX_CURATOR_PHOTO_BYTES,
  MAX_PITCH_NOTE_LENGTH,
  MAX_PLAYLIST_GENRES,
  MAX_SONG_URL_LENGTH,
  MAX_WAITING_PITCHES_PER_RELEASE,
  normalizeGenreTags,
} from './pitching';

describe('isValidSongUrl', () => {
  it.each([
    'https://open.spotify.com/track/abc',
    'http://example.com/song.mp3',
    'https://untitled.stream/library/project/xyz',
    'https://soundcloud.com/artist/private-track/s-Abc123',
    'https://drive.google.com/file/d/abc/view?usp=sharing',
  ])('accepts %s', (url) => {
    expect(isValidSongUrl(url)).toBe(true);
  });

  it('accepts a link with surrounding whitespace', () => {
    expect(isValidSongUrl('  https://audiomack.com/artist/song  ')).toBe(true);
  });

  it.each([
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['a bare hostname', 'open.spotify.com/track/abc'],
    ['a non-http scheme', 'ftp://example.com/song.mp3'],
    ['a javascript scheme', 'javascript:alert(1)'],
    ['a file scheme', 'file:///C:/song.mp3'],
    ['plain text', 'my new single'],
  ])('rejects %s', (_label, url) => {
    expect(isValidSongUrl(url)).toBe(false);
  });

  it.each([null, undefined, 42, {}, ['https://example.com']])('rejects the non-string %s', (value) => {
    expect(isValidSongUrl(value)).toBe(false);
  });

  it('rejects a url longer than the column allows', () => {
    const long = `https://example.com/${'a'.repeat(MAX_SONG_URL_LENGTH)}`;
    expect(long.length).toBeGreaterThan(MAX_SONG_URL_LENGTH);
    expect(isValidSongUrl(long)).toBe(false);
  });
});

describe('detectPitchPlatform', () => {
  it.each([
    ['https://open.spotify.com/track/abc', 'spotify'],
    ['https://spotify.com/track/abc', 'spotify'],
    ['https://www.spotify.com/track/abc', 'spotify'],
    ['https://spotify.link/abc', 'spotify'],
    ['https://music.apple.com/us/album/x/123', 'apple_music'],
    ['https://apple.co/3abcdef', 'apple_music'],
    ['https://audiomack.com/artist/song/new-single', 'audiomack'],
    ['https://www.audiomack.com/artist/song', 'audiomack'],
    ['https://www.youtube.com/watch?v=abc', 'youtube'],
    ['https://m.youtube.com/watch?v=abc', 'youtube'],
    ['https://youtu.be/abc', 'youtube'],
    ['https://music.youtube.com/watch?v=abc', 'youtube'],
  ] as const)('reads %s as %s', (url, platform) => {
    expect(detectPitchPlatform(url)).toBe(platform);
  });

  it('returns null for an unrecognized host rather than guessing', () => {
    expect(detectPitchPlatform('https://untitled.stream/library/abc')).toBeNull();
    expect(detectPitchPlatform('https://soundcloud.com/artist/track')).toBeNull();
  });

  it('does not match a lookalike host', () => {
    // notspotify.com must not suffix-match spotify.com.
    expect(detectPitchPlatform('https://notspotify.com/track/abc')).toBeNull();
    expect(detectPitchPlatform('https://spotify.com.evil.example/track')).toBeNull();
  });

  it('returns null for an invalid url', () => {
    expect(detectPitchPlatform('open.spotify.com/track/abc')).toBeNull();
    expect(detectPitchPlatform('')).toBeNull();
    expect(detectPitchPlatform(null)).toBeNull();
  });
});

describe('normalizeGenreTags', () => {
  it('trims, lowercases and dedupes', () => {
    expect(normalizeGenreTags([' Afrobeats ', 'afrobeats', 'AMAPIANO'])).toEqual([
      'afrobeats',
      'amapiano',
    ]);
  });

  it('drops empty and non-string entries', () => {
    expect(normalizeGenreTags(['pop', '', '   ', 7, null, 'rnb'])).toEqual(['pop', 'rnb']);
  });

  it('caps the tag count', () => {
    const many = Array.from({ length: MAX_PLAYLIST_GENRES + 5 }, (_, i) => `genre${i}`);
    expect(normalizeGenreTags(many)).toHaveLength(MAX_PLAYLIST_GENRES);
  });

  it('truncates an over-long tag instead of dropping it', () => {
    const [tag] = normalizeGenreTags(['x'.repeat(200)]);
    expect(tag).toBe('x'.repeat(30));
  });

  it('returns an empty array for non-arrays', () => {
    expect(normalizeGenreTags('afrobeats')).toEqual([]);
    expect(normalizeGenreTags(null)).toEqual([]);
    expect(normalizeGenreTags(undefined)).toEqual([]);
  });
});

describe('formatFollowerCount', () => {
  it.each([
    [0, '0'],
    [1, '1'],
    [999, '999'],
    [1_000, '1k'],
    [1_240, '1.2k'],
    [12_400, '12k'],
    [999_999, '999k'],
    [1_000_000, '1m'],
    [1_250_000, '1.3m'],
    [24_000_000, '24m'],
  ])('formats %i as %s', (count, expected) => {
    expect(formatFollowerCount(count)).toBe(expected);
  });

  it('returns an empty string when there is no number', () => {
    expect(formatFollowerCount(null)).toBe('');
    expect(formatFollowerCount(undefined)).toBe('');
    expect(formatFollowerCount(-5)).toBe('');
    expect(formatFollowerCount(Number.NaN)).toBe('');
  });
});

describe('status and platform guards', () => {
  it('recognizes every valid status', () => {
    expect(isPitchStatus('new')).toBe(true);
    expect(isPitchStatus('listened')).toBe(true);
    expect(isPitchStatus('added')).toBe(true);
    expect(isPitchStatus('passed')).toBe(true);
  });

  it('rejects anything else as a status', () => {
    expect(isPitchStatus('New')).toBe(false);
    expect(isPitchStatus('rejected')).toBe(false);
    expect(isPitchStatus(null)).toBe(false);
  });

  it('recognizes every valid platform', () => {
    expect(isPitchPlatform('spotify')).toBe(true);
    expect(isPitchPlatform('apple_music')).toBe(true);
    expect(isPitchPlatform('audiomack')).toBe(true);
    expect(isPitchPlatform('youtube')).toBe(true);
    expect(isPitchPlatform('other')).toBe(true);
  });

  it('rejects anything else as a platform', () => {
    expect(isPitchPlatform('deezer')).toBe(false);
    expect(isPitchPlatform('Spotify')).toBe(false);
    expect(isPitchPlatform(undefined)).toBe(false);
  });

  it('allows a reply only on a decided status', () => {
    expect(acceptsPitchReply('added')).toBe(true);
    expect(acceptsPitchReply('passed')).toBe(true);
    expect(acceptsPitchReply('new')).toBe(false);
    expect(acceptsPitchReply('listened')).toBe(false);
  });
});

describe('countWaitingPitches', () => {
  it('counts only the ones still waiting', () => {
    expect(
      countWaitingPitches([
        { status: 'new' },
        { status: 'new' },
        { status: 'listened' },
        { status: 'added' },
        { status: 'passed' },
      ])
    ).toBe(2);
  });

  it('counts nothing in an empty list', () => {
    expect(countWaitingPitches([])).toBe(0);
  });
});

describe('limits', () => {
  it('keeps the documented values', () => {
    expect(MAX_WAITING_PITCHES_PER_RELEASE).toBe(10);
    expect(MAX_PITCH_NOTE_LENGTH).toBe(300);
  });

  it('caps a curator photo at 5 MiB', () => {
    expect(MAX_CURATOR_PHOTO_BYTES).toBe(5 * 1024 * 1024);
  });

  /**
   * The photo route used to read ASSET_SIZE_LIMITS.cover_art. That coupling
   * broke silently the moment cover art was raised to 25 MiB for DSP-sized
   * artwork: a 64px avatar started accepting a 25 MiB upload. This asserts the
   * two are no longer the same number, so re-coupling them fails here rather
   * than in production.
   */
  it('does not track the cover art limit', () => {
    expect(MAX_CURATOR_PHOTO_BYTES).not.toBe(ASSET_SIZE_LIMITS.cover_art);
    expect(MAX_CURATOR_PHOTO_BYTES).toBeLessThan(ASSET_SIZE_LIMITS.cover_art);
  });
});

/**
 * The team-wide list's grouping, added with the Pitching page (2026-09-09).
 *
 * The page shows every pitch the team has sent, across releases, so it needs a
 * grouping the release scene never did — and the grouping is the one place a
 * deleted release has to be handled rather than dropped.
 */
describe('groupPitchesByRelease', () => {
  // `in` rather than `??` for the two nullable fields, because null is a REAL
  // value here (a deleted release, an unresolved title) and `??` would quietly
  // swap it for the default — a fixture that cannot express the case the test
  // is named after.
  const pitch = (over: Partial<SentPitch> & { id: string }): SentPitch => ({
    id: over.id,
    releaseId: 'releaseId' in over ? (over.releaseId ?? null) : 'r1',
    releaseTitle: 'releaseTitle' in over ? (over.releaseTitle ?? null) : 'Midnight EP',
    playlistId: 'p1',
    playlistName: 'Night Drive',
    curatorName: 'Ada',
    songTitle: 'Lagos Nights',
    songUrl: 'https://example.com/song',
    songPlatform: null,
    note: '',
    status: over.status ?? 'new',
    reply: null,
    pitcherName: 'Lucky',
    createdAt: over.createdAt ?? '2026-09-01T10:00:00.000Z',
    updatedAt: over.createdAt ?? '2026-09-01T10:00:00.000Z',
  });

  it('returns nothing for an empty list', () => {
    expect(groupPitchesByRelease([])).toEqual([]);
  });

  it('puts every pitch for one release in one group', () => {
    const groups = groupPitchesByRelease([
      pitch({ id: 'a' }),
      pitch({ id: 'b' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].releaseId).toBe('r1');
    expect(groups[0].releaseTitle).toBe('Midnight EP');
    expect(groups[0].pitches.map((p) => p.id)).toEqual(['a', 'b']);
  });

  // Keyed on the release ID, never the title: two releases can share a name,
  // and merging them would credit one release with the other's answers.
  it('keeps two releases apart even when they share a title', () => {
    const groups = groupPitchesByRelease([
      pitch({ id: 'a', releaseId: 'r1', releaseTitle: 'Single' }),
      pitch({ id: 'b', releaseId: 'r2', releaseTitle: 'Single' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.releaseId).sort()).toEqual(['r1', 'r2']);
  });

  // Newest activity first, so the release being worked on is at the top.
  it('orders groups by their newest pitch', () => {
    const groups = groupPitchesByRelease([
      pitch({ id: 'old', releaseId: 'r1', createdAt: '2026-08-01T10:00:00.000Z' }),
      pitch({ id: 'new', releaseId: 'r2', createdAt: '2026-09-05T10:00:00.000Z' }),
    ]);
    expect(groups.map((group) => group.releaseId)).toEqual(['r2', 'r1']);
  });

  // A deleted release leaves release_id null (on delete set null), so these
  // pitches are real and still awaiting an answer. They go LAST rather than
  // being dropped: the curator may still reply, and losing the row would lose
  // the answer.
  it('collects pitches whose release is gone into one last group', () => {
    const groups = groupPitchesByRelease([
      pitch({ id: 'gone', releaseId: null, releaseTitle: null, createdAt: '2026-09-09T10:00:00.000Z' }),
      pitch({ id: 'live', releaseId: 'r1', createdAt: '2026-08-01T10:00:00.000Z' }),
    ]);
    expect(groups.map((group) => group.releaseId)).toEqual(['r1', null]);
    expect(groups[1].pitches.map((p) => p.id)).toEqual(['gone']);
  });

  it('names a group whose title never resolved without inventing one', () => {
    const groups = groupPitchesByRelease([
      pitch({ id: 'a', releaseId: 'r9', releaseTitle: null }),
    ]);
    expect(groups[0].releaseTitle).toBeNull();
  });
});

describe('describeSentPitchScope', () => {
  it('says nothing when there is nothing to describe', () => {
    expect(describeSentPitchScope(0, false)).toBe('');
  });

  it('counts one pitch in the singular', () => {
    expect(describeSentPitchScope(1, false)).toBe('1 pitch sent');
  });

  it('counts several', () => {
    expect(describeSentPitchScope(4, false)).toBe('4 pitches sent');
  });

  // The list is capped server-side, so a full page has to say so rather than
  // implying it is showing everything.
  it('says when the list was cut short', () => {
    expect(describeSentPitchScope(200, true)).toBe('Showing the newest 200 pitches');
  });
});
