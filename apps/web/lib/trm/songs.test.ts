import { describe, expect, it } from 'vitest';
import { distributionAccess } from '@urganize/pricing';
import {
  DEFAULT_TRM_SETTINGS,
  buildTrmReleaseInput,
  kindForCount,
  releaseKindOf,
  songsOf,
  trmChecklist,
  type TrmFacts,
  type TrmTrackRow,
} from './release';
import { mastersFor } from './server';
import { cleanCredits, normaliseIsrc } from './tracks-server';

// EPs and albums (#1115): a rollout holds songs, the count sets the kind, and
// TRM gets every song in order with its own facts.

const TODAY = new Date('2026-10-19T10:00:00Z');
const base: TrmFacts = {
  releaseId: 'r1',
  title: 'Night Shift',
  primaryArtist: 'Ada',
  releaseType: 'single',
  releaseDate: '2026-11-20',
  genre: 'Afrobeats',
  language: 'English',
  explicit: null,
  isrc: 'NGA1B2600001',
  upc: null,
  labelName: null,
  featuredArtists: null,
  lyrics: null,
  artwork: { mimeType: 'image/jpeg', width: 3000, height: 3000, sizeBytes: 4_000_000 },
  credits: [
    { name: 'Ada', roles: ['songwriter'], songwriterSplit: 100, masterSplit: null },
    { name: 'DJ K', roles: ['producer'], songwriterSplit: null, masterSplit: null },
  ],
  tracks: [],
};

const track = (n: number, over: Partial<TrmTrackRow> = {}): TrmTrackRow => ({
  id: `t${n}`,
  position: n,
  title: `Song ${n}`,
  version: null,
  featuredArtists: null,
  explicit: false,
  isrc: null,
  lyrics: null,
  creditsMode: 'rollout',
  credits: [],
  ...over,
});

const withTracks = (count: number, over: (n: number) => Partial<TrmTrackRow> = () => ({})): TrmFacts => ({
  ...base,
  tracks: Array.from({ length: count }, (_, i) => track(i + 1, over(i + 1))),
});

describe('songs and kind', () => {
  it('a rollout with no rows is a single whose song is the rollout', () => {
    const songs = songsOf(base);
    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({ id: null, sequence: 1, title: 'Night Shift', isrc: 'NGA1B2600001' });
    expect(releaseKindOf(base)).toBe('single');
  });
  it('the count sets the kind: 2 to 6 an EP, 7 or more an album', () => {
    expect(releaseKindOf(withTracks(2))).toBe('ep');
    expect(releaseKindOf(withTracks(6))).toBe('ep');
    expect(releaseKindOf(withTracks(7))).toBe('album');
    expect(releaseKindOf({ ...withTracks(3), releaseType: 'album' })).toBe('ep');
    expect(kindForCount(1)).toBe('single');
    expect(kindForCount(0)).toBe('single');
  });
  it('songs come out in position order, numbered from 1', () => {
    const facts = { ...base, tracks: [track(1, { position: 3, title: 'C' }), track(2, { position: 1, title: 'A' }), track(3, { position: 2, title: 'B' })] };
    expect(songsOf(facts).map((s) => [s.sequence, s.title])).toEqual([
      [1, 'A'],
      [2, 'B'],
      [3, 'C'],
    ]);
  });
});

describe('the checklist with songs', () => {
  it('names each song that still needs something', () => {
    const facts = withTracks(3, (n) => (n === 2 ? { explicit: null } : n === 3 ? { title: '' } : {}));
    const c = trmChecklist(facts, DEFAULT_TRM_SETTINGS, TODAY);
    expect(c.kind).toBe('ep');
    expect(c.blocking.map((r) => [r.key, r.title, r.detail, r.trackId])).toEqual([
      ['song:t2', 'Song 2', 'Explicit not answered', 't2'],
      ['song:t3', 'Song 3', 'No title yet', 't3'],
    ]);
    // Explicit is asked per song, not on the rollout.
    expect(c.blocking.some((r) => r.key === 'explicit')).toBe(false);
    expect(c.songs.map((s) => s.problem)).toEqual([null, 'Explicit not answered', 'No title yet']);
  });
  it('a song with its own credits is checked on its own credits', () => {
    const facts = withTracks(2, (n) => (n === 2 ? { creditsMode: 'own', credits: [{ name: 'Kemi', roles: ['songwriter'], songwriterSplit: null, masterSplit: null }] } : {}));
    const c = trmChecklist(facts, DEFAULT_TRM_SETTINGS, TODAY);
    expect(c.blocking.map((r) => r.detail)).toEqual(['No producer yet']);
  });
  it('rollout credits stop mattering once every song has its own', () => {
    const own = { creditsMode: 'own' as const, credits: base.credits };
    const c = trmChecklist({ ...withTracks(2, () => own), credits: [] }, DEFAULT_TRM_SETTINGS, TODAY);
    expect(c.blocking).toEqual([]);
    expect(c.ready.find((r) => r.key === 'credits')?.detail).toBe('Every song has its own');
  });
});

describe('the TRM package with songs', () => {
  it('sends every song in order with its own facts', () => {
    const facts = withTracks(3, (n) => ({
      title: ['Night Shift', 'Lagos Rain', 'Owambe'][n - 1],
      explicit: n === 3,
      isrc: n === 1 ? 'NGA1B2600012' : null,
      featuredArtists: n === 2 ? 'Kemi' : null,
    }));
    const input = buildTrmReleaseInput(facts, DEFAULT_TRM_SETTINGS, 'ada@example.com', ['Spotify']);
    expect(input.release_type).toBe('EP');
    expect(input.title).toBe('Night Shift');
    expect(input.explicit).toBe(true);
    expect(input.tracks.map((t) => [t.sequence, t.title, t.explicit, t.isrc, t.featured_artists])).toEqual([
      [1, 'Night Shift', false, 'NGA1B2600012', []],
      [2, 'Lagos Rain', false, null, ['Kemi']],
      [3, 'Owambe', true, null, []],
    ]);
    expect(input.tracks[0].writers).toEqual([{ name: 'Ada', role: 'Songwriter' }]);
    expect(input.tracks[2].genre).toBe('Afrobeats');
  });
  it('a song with its own credits gets its own writers and splits', () => {
    const facts = withTracks(2, (n) =>
      n === 2
        ? {
            creditsMode: 'own',
            credits: [
              { name: 'Kemi', roles: ['songwriter'], songwriterSplit: null, masterSplit: 40 },
              { name: 'Tobi', roles: ['producer'], songwriterSplit: null, masterSplit: 60 },
            ],
          }
        : {}
    );
    const input = buildTrmReleaseInput(facts, DEFAULT_TRM_SETTINGS, 'ada@example.com', ['Spotify']);
    expect(input.tracks[1].writers).toEqual([{ name: 'Kemi', role: 'Songwriter' }]);
    expect(input.tracks[1].royalty_splits).toEqual([
      { name: 'Kemi', percentage: 40 },
      { name: 'Tobi', percentage: 60 },
    ]);
    expect(input.tracks[0].royalty_splits).toEqual([{ name: 'Ada', percentage: 100 }]);
  });
  it('seven songs go as an album', () => {
    expect(buildTrmReleaseInput(withTracks(7), DEFAULT_TRM_SETTINGS, 'a@b.co', ['Spotify']).release_type).toBe('Album');
  });
});

describe('masters per song', () => {
  it('a single keeps its master in audio_asset_id', () => {
    expect(mastersFor(base, { track_audio: [], audio_asset_id: 'a1', audio_file_name: 'm.wav' })).toEqual([
      { trackId: null, sequence: 1, assetId: 'a1', fileName: 'm.wav' },
    ]);
  });
  it('a master counts only for the song it was uploaded for, at that place', () => {
    const facts = withTracks(2);
    const row = {
      track_audio: [
        { trackId: 't1', sequence: 1, assetId: 'a1', fileName: 'one.wav' },
        { trackId: 't1', sequence: 2, assetId: 'a2', fileName: 'moved.wav' },
      ],
      audio_asset_id: 'a1',
      audio_file_name: 'one.wav',
    };
    expect(mastersFor(facts, row).map((m) => m?.assetId ?? null)).toEqual(['a1', null]);
  });
});

describe('plan rules (packages/pricing) on the kind the songs make', () => {
  it('an EP needs a plan, an album a yearly one', () => {
    expect(distributionAccess({ releaseType: releaseKindOf(withTracks(4)), teamPlan: 'none' })).toBe('needs_monthly_plan');
    expect(distributionAccess({ releaseType: releaseKindOf(withTracks(4)), teamPlan: 'monthly' })).toBe('allowed');
    expect(distributionAccess({ releaseType: releaseKindOf(withTracks(9)), teamPlan: 'monthly' })).toBe('needs_yearly_plan');
    expect(distributionAccess({ releaseType: releaseKindOf(withTracks(9)), teamPlan: 'yearly' })).toBe('allowed');
  });
});

describe('song input', () => {
  it('ISRC is cleaned to 12 characters or refused', () => {
    expect(normaliseIsrc('ng-a1b-26-00012')).toEqual({ ok: true, isrc: 'NGA1B2600012' });
    expect(normaliseIsrc('')).toEqual({ ok: true, isrc: null });
    expect(normaliseIsrc('NG123')).toEqual({ ok: false });
  });
  it('own credits keep names, known roles and splits from 0 to 100', () => {
    expect(
      cleanCredits([
        { name: ' Kemi ', roles: ['songwriter', 'boss'], masterSplit: 140 },
        { name: '', roles: ['producer'] },
        { name: 'Tobi', roles: ['producer'], masterSplit: '' },
      ])
    ).toEqual([
      { name: 'Kemi', roles: ['songwriter'], masterSplit: 100 },
      { name: 'Tobi', roles: ['producer'], masterSplit: null },
    ]);
  });
});
