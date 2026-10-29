import { describe, expect, it } from 'vitest';
import {
  LIVE_WINDOW_DAYS,
  artistSummary,
  artistUpNext,
  bucketReleases,
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

describe('artistSummary', () => {
  it('counts only the artist asked about', () => {
    const summary = artistSummary(
      'a1',
      [rel('mine', '2027-01-01'), rel('theirs', '2027-01-01', 'draft', 'a2'), rel('old', '2020-01-01')],
      NOW
    );
    expect(summary).toEqual({ releases: 2, planned: 1, live: 0 });
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

describe('artistUpNext', () => {
  const TODAY = '2026-10-29';
  const empty = { planned: [], live: [], past: [] };
  const release = (id: string, releaseDate: string | null) => ({ id, artistId: 'a1', title: id, releaseDate, status: 'draft' });
  const record = (id: string, songCount: number, doneCount: number) => ({ id, title: id, songCount, doneCount });
  const task = (releaseId: string, dueDate: string | null, status = 'todo') => ({ releaseId, dueDate, status });

  it('puts the nearest planned rollout first, with days to go, tasks due this week and late ones', () => {
    const gidi = release('gidi', '2026-11-14');
    const next = artistUpNext({
      buckets: { ...empty, planned: [gidi, release('later', '2026-12-20')] },
      records: [record('kunu', 1, 0)],
      tasks: [
        task('gidi', '2026-10-27'),
        task('gidi', '2026-10-28', 'done'),
        task('gidi', '2026-10-29'),
        task('gidi', '2026-11-04'),
        task('gidi', '2026-11-05'),
        task('later', '2026-10-01'),
      ],
      today: TODAY,
    });
    expect(next).toEqual({ kind: 'rollout', release: gidi, daysToGo: 16, dueThisWeek: 2, late: 1 });
  });

  it('gives a rollout with no date no countdown', () => {
    const next = artistUpNext({ buckets: { ...empty, planned: [release('x', null)] }, records: [], tasks: [], today: TODAY });
    expect(next).toMatchObject({ kind: 'rollout', daysToGo: null });
  });

  it('falls back to a release that is just out while it still has open tasks', () => {
    const out = release('out', '2026-10-20');
    const next = artistUpNext({
      buckets: { ...empty, live: [out] },
      records: [],
      tasks: [task('out', '2026-10-25'), task('out', '2026-11-02'), task('out', '2026-10-21', 'done')],
      today: TODAY,
    });
    expect(next).toEqual({ kind: 'out', release: out, openTasks: 2, late: 1 });
  });

  it('skips a just-out release with nothing left to do and points at the record being made', () => {
    const next = artistUpNext({
      buckets: { ...empty, live: [release('out', '2026-10-20')] },
      records: [record('empty', 0, 0), record('kunu', 3, 1)],
      tasks: [task('out', '2026-10-21', 'done')],
      today: TODAY,
    });
    expect(next).toEqual({ kind: 'record', record: record('kunu', 3, 1), step: 'finish' });
  });

  it('says to plan the rollout once every song on a record is done', () => {
    const next = artistUpNext({ buckets: empty, records: [record('kunu', 2, 2)], tasks: [], today: TODAY });
    expect(next).toMatchObject({ kind: 'record', step: 'plan' });
  });

  it('asks for the first song when the only records are empty', () => {
    const next = artistUpNext({ buckets: empty, records: [record('untitled', 0, 0)], tasks: [], today: TODAY });
    expect(next).toMatchObject({ kind: 'record', step: 'add_songs' });
  });

  it('asks to start a record when there is nothing at all', () => {
    expect(artistUpNext({ buckets: empty, records: [], tasks: [], today: TODAY })).toEqual({ kind: 'start' });
  });
});
