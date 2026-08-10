import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeDaysOfWork,
  probePitchStats,
  selectRecapStats,
  type RecapRawStats,
} from './recap-stats';

const baseRaw: RecapRawStats = {
  tasksCompleted: 0,
  daysOfWork: null,
  teamSize: 0,
  pitchesSent: null,
  pitchAdds: null,
  totalTasks: 0,
  allTasksDone: false,
};

const noInputs = { firstWeekStreams: null };

describe('selectRecapStats', () => {
  it('returns nothing for a release with no achievements', () => {
    expect(selectRecapStats(baseRaw, noInputs)).toEqual([]);
  });

  it('omits a zero task count rather than printing it', () => {
    const lines = selectRecapStats({ ...baseRaw, tasksCompleted: 0, daysOfWork: 12 }, noInputs);
    expect(lines.map((line) => line.key)).toEqual(['daysOfWork']);
  });

  it('suppresses a team of one', () => {
    const lines = selectRecapStats({ ...baseRaw, teamSize: 1 }, noInputs);
    expect(lines).toEqual([]);
  });

  it('includes a team of two or more', () => {
    const lines = selectRecapStats({ ...baseRaw, teamSize: 4 }, noInputs);
    expect(lines).toHaveLength(1);
    expect(lines[0].value).toBe('4');
    expect(lines[0].label).toBe('people on the team');
  });

  it('pluralizes task and day labels', () => {
    const single = selectRecapStats({ ...baseRaw, tasksCompleted: 1, daysOfWork: 1 }, noInputs);
    expect(single.map((line) => line.label)).toEqual(['task completed', 'day of work']);

    const many = selectRecapStats({ ...baseRaw, tasksCompleted: 2, daysOfWork: 9 }, noInputs);
    expect(many.map((line) => line.label)).toEqual(['tasks completed', 'days of work']);
  });

  it('omits streams when the user left the field blank or entered zero', () => {
    expect(selectRecapStats(baseRaw, { firstWeekStreams: null })).toEqual([]);
    expect(selectRecapStats(baseRaw, { firstWeekStreams: 0 })).toEqual([]);
  });

  it('includes streams when entered, formatted with separators', () => {
    const lines = selectRecapStats(baseRaw, { firstWeekStreams: 12400 });
    expect(lines).toHaveLength(1);
    expect(lines[0].value).toBe('12,400');
    expect(lines[0].label).toBe('first week streams');
  });

  it('omits pitch stats entirely when the table is absent', () => {
    const lines = selectRecapStats(
      { ...baseRaw, tasksCompleted: 5, pitchesSent: null, pitchAdds: null },
      noInputs
    );
    expect(lines.map((line) => line.key)).toEqual(['tasksCompleted']);
  });

  it('omits pitch stats when the table exists but is empty', () => {
    const lines = selectRecapStats(
      { ...baseRaw, tasksCompleted: 5, pitchesSent: 0, pitchAdds: 0 },
      noInputs
    );
    expect(lines.map((line) => line.key)).toEqual(['tasksCompleted']);
  });

  it('includes pitch stats when the table has data', () => {
    const lines = selectRecapStats(
      { ...baseRaw, pitchesSent: 18, pitchAdds: 3 },
      noInputs
    );
    expect(lines.map((line) => line.key)).toEqual(['pitchesSent', 'pitchAdds']);
  });

  it('keeps the priority order and caps at five lines', () => {
    const lines = selectRecapStats(
      {
        ...baseRaw,
        tasksCompleted: 64,
        daysOfWork: 77,
        teamSize: 3,
        pitchesSent: 18,
        pitchAdds: 3,
      },
      { firstWeekStreams: 12400 }
    );
    expect(lines).toHaveLength(5);
    expect(lines.map((line) => line.key)).toEqual([
      'tasksCompleted',
      'daysOfWork',
      'teamSize',
      'firstWeekStreams',
      'pitchesSent',
    ]);
  });
});

describe('computeDaysOfWork', () => {
  const tasks = [
    { created_at: '2026-06-01T10:00:00Z' },
    { created_at: '2026-06-10T10:00:00Z' },
  ];

  it('measures the first task to release day', () => {
    expect(computeDaysOfWork(tasks, '2026-08-09')).toBeGreaterThan(60);
  });

  it('returns null when the release has no tasks', () => {
    expect(computeDaysOfWork([], '2026-08-09')).toBeNull();
  });

  it('measures to today when the release has no date', () => {
    const now = new Date('2026-06-21T10:00:00Z');
    expect(computeDaysOfWork(tasks, null, now)).toBe(20);
  });

  it('never returns zero for a same-day release', () => {
    expect(computeDaysOfWork([{ created_at: '2026-08-09T10:00:00Z' }], '2026-08-09')).toBe(1);
  });

  it('never returns a negative span when tasks postdate the release', () => {
    expect(computeDaysOfWork([{ created_at: '2026-09-01T10:00:00Z' }], '2026-08-09')).toBe(1);
  });

  it('ignores unparseable timestamps', () => {
    expect(computeDaysOfWork([{ created_at: 'nonsense' }], '2026-08-09')).toBeNull();
  });
});

function clientReturning(result: unknown): SupabaseClient {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve(result)),
      })),
    })),
  } as unknown as SupabaseClient;
}

describe('probePitchStats', () => {
  it('reports absence when the playlist_pitches table does not exist', async () => {
    const client = clientReturning({
      data: null,
      error: { code: '42P01', message: 'relation "playlist_pitches" does not exist' },
    });
    await expect(probePitchStats(client, 'release-1')).resolves.toEqual({
      pitchesSent: null,
      pitchAdds: null,
    });
  });

  it('reports absence when PostgREST cannot find the table in its schema cache', async () => {
    const client = clientReturning({
      data: null,
      error: { code: 'PGRST205', message: "Could not find the table 'public.playlist_pitches'" },
    });
    await expect(probePitchStats(client, 'release-1')).resolves.toEqual({
      pitchesSent: null,
      pitchAdds: null,
    });
  });

  it('counts every pitch, and counts only added ones as adds', async () => {
    const client = clientReturning({
      data: [
        { status: 'new' },
        { status: 'listened' },
        { status: 'added' },
        { status: 'added' },
        { status: 'passed' },
      ],
      error: null,
    });
    await expect(probePitchStats(client, 'release-1')).resolves.toEqual({
      pitchesSent: 5,
      pitchAdds: 2,
    });
  });

  it('reports zero counts when the table exists but the release has none', async () => {
    const client = clientReturning({ data: [], error: null });
    await expect(probePitchStats(client, 'release-1')).resolves.toEqual({
      pitchesSent: 0,
      pitchAdds: 0,
    });
  });

  it('degrades to absence rather than throwing on an unexpected error', async () => {
    const client = clientReturning({
      data: null,
      error: { code: '08006', message: 'connection failure' },
    });
    await expect(probePitchStats(client, 'release-1')).resolves.toEqual({
      pitchesSent: null,
      pitchAdds: null,
    });
  });
});
