import { describe, expect, it } from 'vitest';
import {
  MUSIC_MAX_BYTES,
  PLAY_DEDUPE_WINDOW_MS,
  artistsFromTracks,
  formatDuration,
  isOwnMusicPath,
  isTrackLive,
  matchesMusicQuery,
  musicGuidance,
  musicInitials,
  parseDurationSeconds,
  shouldCountPlay,
  trackLiveAt,
  trackStatus,
  validateMusicFile,
} from './rules';

const NOW = Date.parse('2026-11-28T10:00:00+01:00');

const track = (over: Partial<Parameters<typeof isTrackLive>[0]> = {}) => ({
  liveMode: 'release_day' as const,
  publishedAt: '2026-11-20T09:00:00Z',
  takenDownAt: null as string | null,
  ...over,
});
const release = (over: Partial<Parameters<typeof isTrackLive>[1]> = {}) => ({
  releaseDate: '2026-11-28' as string | null,
  deletedAt: null as string | null,
  ...over,
});

describe('validateMusicFile', () => {
  it('takes an MP3 and a WAV', () => {
    expect(validateMusicFile({ name: 'a.mp3', type: 'audio/mpeg', size: 5_000_000 }).ok).toBe(true);
    expect(validateMusicFile({ name: 'a.wav', type: 'audio/wav', size: 5_000_000 }).ok).toBe(true);
    expect(validateMusicFile({ name: 'a.wav', type: 'audio/x-wav', size: 5_000_000 }).ok).toBe(true);
  });

  it('refuses other formats and says what to use', () => {
    const result = validateMusicFile({ name: 'a.flac', type: 'audio/flac', size: 1000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('MP3 or WAV');
  });

  it('refuses an empty file and one over the ceiling', () => {
    expect(validateMusicFile({ name: 'a.mp3', type: 'audio/mpeg', size: 0 }).ok).toBe(false);
    expect(validateMusicFile({ name: 'a.mp3', type: 'audio/mpeg', size: MUSIC_MAX_BYTES }).ok).toBe(true);
    const big = validateMusicFile({ name: 'a.mp3', type: 'audio/mpeg', size: MUSIC_MAX_BYTES + 1 });
    expect(big.ok).toBe(false);
  });

  it('does not trust the case of a type', () => {
    expect(validateMusicFile({ name: 'a.mp3', type: 'Audio/MPEG', size: 100 }).ok).toBe(true);
  });
});

describe('parseDurationSeconds and formatDuration', () => {
  it('keeps a sensible length and drops a bad one without failing', () => {
    expect(parseDurationSeconds(188.4)).toBe(188);
    expect(parseDurationSeconds('188')).toBe(188);
    expect(parseDurationSeconds(0)).toBeNull();
    expect(parseDurationSeconds(-3)).toBeNull();
    expect(parseDurationSeconds(60 * 60 + 1)).toBeNull();
    expect(parseDurationSeconds(NaN)).toBeNull();
    expect(parseDurationSeconds(undefined)).toBeNull();
    expect(parseDurationSeconds({})).toBeNull();
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(188)).toBe('3:08');
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(-1)).toBe('');
  });
});

describe('trackLiveAt and isTrackLive', () => {
  it('goes live at the start of the release date in Lagos', () => {
    expect(trackLiveAt(track(), release())).toBe(Date.parse('2026-11-27T23:00:00Z'));
  });

  it('is not live the minute before and is live the minute of', () => {
    const atMidnight = Date.parse('2026-11-28T00:00:00+01:00');
    expect(isTrackLive(track(), release(), atMidnight - 1)).toBe(false);
    expect(isTrackLive(track(), release(), atMidnight)).toBe(true);
  });

  it('goes out the moment it is published when set to right away', () => {
    const t = track({ liveMode: 'now', publishedAt: '2026-11-20T09:00:00Z' });
    expect(isTrackLive(t, release({ releaseDate: '2027-01-01' }), Date.parse('2026-11-20T09:00:01Z'))).toBe(true);
  });

  it('waits, rather than going out early, when release day has no date', () => {
    expect(trackLiveAt(track(), release({ releaseDate: null }))).toBeNull();
    expect(isTrackLive(track(), release({ releaseDate: null }), NOW)).toBe(false);
  });

  it('follows the release date when it moves', () => {
    const t = track();
    expect(isTrackLive(t, release({ releaseDate: '2026-11-28' }), NOW)).toBe(true);
    expect(isTrackLive(t, release({ releaseDate: '2026-12-05' }), NOW)).toBe(false);
  });

  it('is never live when unpublished, taken down, or in the trash', () => {
    expect(isTrackLive(track({ publishedAt: null }), release(), NOW)).toBe(false);
    expect(isTrackLive(track({ takenDownAt: '2026-11-29T00:00:00Z' }), release(), NOW)).toBe(false);
    expect(isTrackLive(track(), release({ deletedAt: '2026-11-29T00:00:00Z' }), NOW)).toBe(false);
  });

  it('answers no to a date or timestamp it cannot read', () => {
    expect(isTrackLive(track(), release({ releaseDate: 'soon' }), NOW)).toBe(false);
    expect(isTrackLive(track({ publishedAt: 'yesterday' }), release(), NOW)).toBe(false);
  });

  it('reads an ISO timestamp as a date', () => {
    expect(trackLiveAt(track(), release({ releaseDate: '2026-11-28T00:00:00.000Z' }))).toBe(
      Date.parse('2026-11-27T23:00:00Z')
    );
  });
});

describe('trackStatus', () => {
  it('names each of the four states', () => {
    expect(trackStatus(track({ publishedAt: null }), release(), NOW)).toBe('draft');
    expect(trackStatus(track(), release({ releaseDate: '2026-12-05' }), NOW)).toBe('scheduled');
    expect(trackStatus(track(), release(), NOW)).toBe('live');
    expect(trackStatus(track({ takenDownAt: '2026-11-29T00:00:00Z' }), release(), NOW)).toBe('taken_down');
  });

  it('reads a trashed rollout as taken down, even for a draft', () => {
    expect(trackStatus(track({ publishedAt: null }), release({ deletedAt: '2026-11-29T00:00:00Z' }), NOW)).toBe(
      'taken_down'
    );
  });
});

describe('matchesMusicQuery', () => {
  const lagos = { title: 'Lagos Nights', artistName: 'Dorian' };

  it('matches everything when nothing is typed', () => {
    expect(matchesMusicQuery(lagos, '')).toBe(true);
    expect(matchesMusicQuery(lagos, '   ')).toBe(true);
  });

  it('matches title or artist, in any order, ignoring case and accents', () => {
    expect(matchesMusicQuery(lagos, 'lagos')).toBe(true);
    expect(matchesMusicQuery(lagos, 'DORIAN')).toBe(true);
    expect(matchesMusicQuery(lagos, 'nights dorian')).toBe(true);
    expect(matchesMusicQuery({ title: 'Ọlá', artistName: 'Sade' }, 'ola')).toBe(true);
    expect(matchesMusicQuery({ title: 'Café', artistName: 'Sade' }, 'cafe')).toBe(true);
  });

  it('needs every word, not just one', () => {
    expect(matchesMusicQuery(lagos, 'lagos tems')).toBe(false);
  });
});

describe('artistsFromTracks', () => {
  it('lists each artist once, most songs first, then by name', () => {
    const hits = artistsFromTracks([
      { artistName: 'Tems' },
      { artistName: 'Dorian' },
      { artistName: 'dorian' },
      { artistName: 'Ayra' },
      { artistName: '   ' },
    ]);
    expect(hits).toEqual([
      { name: 'Dorian', songs: 2 },
      { name: 'Ayra', songs: 1 },
      { name: 'Tems', songs: 1 },
    ]);
  });
});

describe('shouldCountPlay', () => {
  it('counts a first play and a play after the window', () => {
    expect(shouldCountPlay(null, NOW)).toBe(true);
    expect(shouldCountPlay(NOW - PLAY_DEDUPE_WINDOW_MS, NOW)).toBe(true);
  });

  it('does not count a repeat inside the window', () => {
    expect(shouldCountPlay(NOW - PLAY_DEDUPE_WINDOW_MS + 1, NOW)).toBe(false);
    expect(shouldCountPlay(NOW - 1000, NOW)).toBe(false);
  });

  it('counts when the last time cannot be read', () => {
    expect(shouldCountPlay(Number.NaN, NOW)).toBe(true);
  });
});

describe('musicInitials', () => {
  it('uses two words or two letters', () => {
    expect(musicInitials('Lagos Nights')).toBe('LN');
    expect(musicInitials('Ohema')).toBe('OH');
    expect(musicInitials('  ')).toBe('·');
  });
});

describe('musicGuidance', () => {
  const base = { isAuthenticated: true, role: 'manager', hasCuratorProfile: false, dismissed: false };

  it('shows nothing to someone signed out or who closed the card', () => {
    expect(musicGuidance({ ...base, isAuthenticated: false })).toBeNull();
    expect(musicGuidance({ ...base, dismissed: true })).toBeNull();
  });

  it('points a team account at its rollouts', () => {
    expect(musicGuidance(base)).toBe('team');
  });

  it('points a playlist owner at their pitches', () => {
    expect(musicGuidance({ ...base, role: 'curator', hasCuratorProfile: true })).toBe('curator');
    expect(musicGuidance({ ...base, role: 'curator', hasCuratorProfile: null })).toBe('curator');
  });

  it('points a dual account at both', () => {
    expect(musicGuidance({ ...base, hasCuratorProfile: true })).toBe('both');
  });

  it('treats a profile still loading as no pitches, not an error', () => {
    expect(musicGuidance({ ...base, hasCuratorProfile: null })).toBe('team');
  });
});

describe('isOwnMusicPath', () => {
  const id = 'rel-1';

  it('takes a file directly inside the rollout music folder', () => {
    expect(isOwnMusicPath(id, 'music/rel-1/abc-lagos.mp3')).toBe(true);
  });

  it('refuses another rollout, a nested path, a walk out of the folder and an empty name', () => {
    expect(isOwnMusicPath(id, 'music/rel-2/abc.mp3')).toBe(false);
    expect(isOwnMusicPath(id, 'music/rel-1/sub/abc.mp3')).toBe(false);
    expect(isOwnMusicPath(id, 'music/rel-1/../rel-2/abc.mp3')).toBe(false);
    expect(isOwnMusicPath(id, 'music/rel-1/')).toBe(false);
    expect(isOwnMusicPath(id, 'rel-1/cover_art/abc.png')).toBe(false);
  });

  it('does not let a rollout id that is a prefix of another match', () => {
    expect(isOwnMusicPath('rel-1', 'music/rel-10/abc.mp3')).toBe(false);
  });
});
