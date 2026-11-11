import { describe, expect, it } from 'vitest';
import { artistsList, describeDaysToGo, sortBySoonestDrop } from './artists-list';

// Local noon, so a date-only string and "now" never straddle a day boundary
// differently on a machine in another timezone.
const NOW = new Date(2026, 9, 29, 12, 0, 0);
const TODAY = '2026-10-29';

const rel = (id: string, artistId: string, releaseDate: string | null, status = 'draft') => ({
  id,
  artistId,
  title: id,
  releaseDate,
  status,
});
const task = (releaseId: string, dueDate: string | null, status = 'todo') => ({ releaseId, dueDate, status });

const dorian = { id: 'dorian' };
const t3n = { id: 't3n' };

describe('artistsList', () => {
  it('gives each artist their nearest planned rollout and its countdown', () => {
    const { rows } = artistsList({
      artists: [dorian],
      releases: [rel('later', 'dorian', '2026-12-01'), rel('soon', 'dorian', '2026-11-07')],
      tasks: [],
      today: TODAY,
      now: NOW,
    });
    expect(rows[0].next?.id).toBe('soon');
    expect(rows[0].status).toBe('rolling_out');
    expect(rows[0].daysToGo).toBe(9);
  });

  it('falls back to a release just out, then to quiet', () => {
    const { rows } = artistsList({
      artists: [dorian, t3n],
      releases: [rel('out', 'dorian', '2026-10-20'), rel('old', 't3n', '2025-01-01')],
      tasks: [],
      today: TODAY,
      now: NOW,
    });
    expect(rows[0].status).toBe('out_now');
    expect(rows[0].daysToGo).toBe(-9);
    expect(rows[1]).toMatchObject({ status: 'quiet', next: null, daysToGo: null });
  });

  it('counts done, due this week and late on the next rollout only', () => {
    const { rows } = artistsList({
      artists: [dorian],
      releases: [rel('soon', 'dorian', '2026-11-07'), rel('other', 'dorian', '2026-12-20')],
      tasks: [
        task('soon', '2026-10-01', 'done'),
        task('soon', '2026-10-28'), // late
        task('soon', '2026-10-29'), // due today: this week
        task('soon', '2026-11-04'), // day 6: this week
        task('soon', '2026-11-05'), // day 7: next week
        task('soon', null),
        task('other', '2026-10-01'), // another rollout: ignored
      ],
      today: TODAY,
      now: NOW,
    });
    expect(rows[0]).toMatchObject({ done: 1, total: 6, dueThisWeek: 2, late: 1 });
  });

  it('spotlights the soonest dated planned rollout across the roster', () => {
    const { spotlight } = artistsList({
      artists: [dorian, t3n],
      releases: [rel('d', 'dorian', '2026-11-20'), rel('t', 't3n', '2026-11-07')],
      tasks: [],
      today: TODAY,
      now: NOW,
    });
    expect(spotlight?.artist.id).toBe('t3n');
  });

  it('has no spotlight when nothing planned has a date', () => {
    const { spotlight } = artistsList({
      artists: [dorian, t3n],
      releases: [rel('nodate', 'dorian', null), rel('out', 't3n', '2026-10-20')],
      tasks: [],
      today: TODAY,
      now: NOW,
    });
    expect(spotlight).toBeNull();
  });
});

describe('describeDaysToGo', () => {
  it('says it in plain words', () => {
    expect(describeDaysToGo(9)).toBe('In 9 days');
    expect(describeDaysToGo(1)).toBe('Tomorrow');
    expect(describeDaysToGo(0)).toBe('Today');
    expect(describeDaysToGo(-1)).toBe('Out yesterday');
    expect(describeDaysToGo(-4)).toBe('Out 4 days ago');
  });
});

describe('sortBySoonestDrop', () => {
  const row = (id: string, status: 'rolling_out' | 'out_now' | 'quiet', daysToGo: number | null) => ({
    artist: { id },
    next: null,
    status,
    daysToGo,
    done: 0,
    total: 0,
    dueThisWeek: 0,
    late: 0,
  });

  it('puts the soonest dated drop first, then no date, then out, then quiet', () => {
    const sorted = sortBySoonestDrop([
      row('quiet', 'quiet', null),
      row('out', 'out_now', -3),
      row('nodate', 'rolling_out', null),
      row('far', 'rolling_out', 57),
      row('soon', 'rolling_out', 8),
    ]);
    expect(sorted.map((entry) => entry.artist.id)).toEqual(['soon', 'far', 'nodate', 'out', 'quiet']);
  });

  it('keeps roster order on a tie and leaves the input alone', () => {
    const rows = [row('b', 'quiet', null), row('a', 'quiet', null), row('c', 'rolling_out', 4), row('d', 'rolling_out', 4)];
    expect(sortBySoonestDrop(rows).map((entry) => entry.artist.id)).toEqual(['c', 'd', 'b', 'a']);
    expect(rows[0].artist.id).toBe('b');
  });
});
