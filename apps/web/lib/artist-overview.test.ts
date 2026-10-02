import { describe, expect, it } from 'vitest';
import {
  LIVE_WINDOW_DAYS,
  artistSummary,
  bucketReleases,
  bucketShows,
  splitTeamByArtistScope,
} from './artist-overview';

// Local noon, so a date-only string and "now" never straddle a day boundary
// differently on a machine in another timezone.
const NOW = new Date(2026, 9, 2, 12, 0, 0);

const rel = (id: string, releaseDate: string | null, status = 'draft', artistId = 'a1') => ({
  id,
  artistId,
  title: id,
  releaseDate,
  status,
});

describe('bucketReleases', () => {
  it('puts a future date in planned and an undated rollout in planned', () => {
    const { planned, live, past } = bucketReleases([rel('soon', '2026-11-01'), rel('nodate', null)], NOW);
    expect(planned.map((r) => r.id)).toEqual(['soon', 'nodate']);
    expect(live).toEqual([]);
    expect(past).toEqual([]);
  });

  it('calls a release live for a month after its date, release day included', () => {
    const { live } = bucketReleases([rel('today', '2026-10-02'), rel('recent', '2026-09-20')], NOW);
    expect(live.map((r) => r.id)).toEqual(['today', 'recent']);
  });

  it('moves it to past once the window is over', () => {
    const edge = new Date(2026, 9, 2 - LIVE_WINDOW_DAYS, 12);
    const iso = `${edge.getFullYear()}-${String(edge.getMonth() + 1).padStart(2, '0')}-${String(edge.getDate()).padStart(2, '0')}`;
    const justInside = bucketReleases([rel('r', iso)], NOW);
    expect(justInside.live.map((r) => r.id)).toEqual(['r']);
    const outside = bucketReleases([rel('r', '2026-08-01')], NOW);
    expect(outside.past.map((r) => r.id)).toEqual(['r']);
  });

  it('treats an archived release as past even when its date is ahead', () => {
    const { past, planned } = bucketReleases([rel('x', '2027-01-01', 'archived')], NOW);
    expect(past.map((r) => r.id)).toEqual(['x']);
    expect(planned).toEqual([]);
  });

  it('treats a released status with no date as past, not planned', () => {
    expect(bucketReleases([rel('x', null, 'released')], NOW).past.map((r) => r.id)).toEqual(['x']);
  });

  it('orders planned soonest first with undated last, and the others newest first', () => {
    const result = bucketReleases(
      [
        rel('p-late', '2027-03-01'),
        rel('p-undated', null),
        rel('p-soon', '2026-11-01'),
        rel('old-1', '2025-01-01'),
        rel('old-2', '2026-01-01'),
      ],
      NOW
    );
    expect(result.planned.map((r) => r.id)).toEqual(['p-soon', 'p-late', 'p-undated']);
    expect(result.past.map((r) => r.id)).toEqual(['old-2', 'old-1']);
  });

  it('puts every release in exactly one bucket', () => {
    const input = [
      rel('a', '2027-01-01'),
      rel('b', '2026-09-25'),
      rel('c', '2024-01-01'),
      rel('d', null),
      rel('e', '2030-01-01', 'archived'),
    ];
    const { planned, live, past } = bucketReleases(input, NOW);
    expect(planned.length + live.length + past.length).toBe(input.length);
  });
});

const show = (id: string, setStartAt: string | null, status = 'confirmed', artistId = 'a1') => ({
  id,
  artistId,
  title: id,
  setStartAt,
  status,
});

describe('bucketShows', () => {
  it('splits upcoming from past by set time', () => {
    const { upcoming, past } = bucketShows(
      [show('next', '2026-10-10T20:00:00Z'), show('last', '2026-09-01T20:00:00Z')],
      NOW
    );
    expect(upcoming.map((s) => s.id)).toEqual(['next']);
    expect(past.map((s) => s.id)).toEqual(['last']);
  });

  it('keeps a show with no time yet in upcoming, last', () => {
    const { upcoming } = bucketShows([show('tbc', null), show('dated', '2026-10-10T20:00:00Z')], NOW);
    expect(upcoming.map((s) => s.id)).toEqual(['dated', 'tbc']);
  });

  it('drops a cancelled show from both lists', () => {
    const { upcoming, past } = bucketShows([show('x', '2026-10-10T20:00:00Z', 'cancelled')], NOW);
    expect(upcoming).toEqual([]);
    expect(past).toEqual([]);
  });

  it('counts a show marked done as past even if its time is ahead', () => {
    expect(bucketShows([show('x', '2026-10-10T20:00:00Z', 'done')], NOW).past.map((s) => s.id)).toEqual(['x']);
  });
});

describe('artistSummary', () => {
  it('counts only the artist asked about', () => {
    const summary = artistSummary(
      'a1',
      [rel('mine', '2027-01-01'), rel('theirs', '2027-01-01', 'draft', 'a2'), rel('old', '2020-01-01')],
      [show('s1', '2026-10-10T20:00:00Z'), show('s2', '2026-10-10T20:00:00Z', 'confirmed', 'a2')],
      NOW
    );
    expect(summary).toEqual({ releases: 2, planned: 1, live: 0, upcomingShows: 1 });
  });
});

describe('splitTeamByArtistScope', () => {
  const members = [
    { id: 'm1', name: 'Owner' },
    { id: 'm2', name: 'Scoped here' },
    { id: 'm3', name: 'Scoped elsewhere' },
    { id: 'm4', name: 'Unscoped' },
  ];
  const scopeById = new Map<string, string | null>([
    ['m1', null],
    ['m2', 'a1'],
    ['m3', 'a2'],
    ['m4', null],
  ]);

  it('separates people limited to this artist from people who see every artist', () => {
    const { scoped, everyone } = splitTeamByArtistScope(members, scopeById, 'a1');
    expect(scoped.map((m) => m.id)).toEqual(['m2']);
    expect(everyone.map((m) => m.id)).toEqual(['m1', 'm4']);
  });

  it('leaves out a person limited to a different artist', () => {
    const { scoped, everyone } = splitTeamByArtistScope(members, scopeById, 'a1');
    expect([...scoped, ...everyone].some((m) => m.id === 'm3')).toBe(false);
  });

  it('treats a member with no scope row as seeing everything', () => {
    const { everyone } = splitTeamByArtistScope([{ id: 'zz', name: 'New' }], new Map(), 'a1');
    expect(everyone.map((m) => m.id)).toEqual(['zz']);
  });
});
