import { describe, expect, it } from 'vitest';
import { artistsList, describeDaysToGo } from './artists-list';

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
