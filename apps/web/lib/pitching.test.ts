import { describe, expect, it } from 'vitest';
import {
  acceptsPitchReply,
  countWaitingPitches,
  detectPitchPlatform,
  formatFollowerCount,
  isPitchPlatform,
  isPitchStatus,
  isValidSongUrl,
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
});
