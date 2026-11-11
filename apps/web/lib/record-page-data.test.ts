import { describe, expect, it } from 'vitest';
import { isTaskLate, recordStageSteps, taskCountsLine } from './record-page-data';

describe('recordStageSteps', () => {
  const states = (status: Parameters<typeof recordStageSteps>[0]) => recordStageSteps(status).map((step) => step.state);

  it('names the three stops in order: Idea and Making are one Song stop (#1143)', () => {
    expect(recordStageSteps('idea').map((step) => step.label)).toEqual(['Song', 'Release', 'Out']);
  });

  it('an idea and a project in the making both sit at Song', () => {
    expect(states('idea')).toEqual(['now', 'next', 'later']);
    expect(states('making')).toEqual(['now', 'next', 'later']);
  });

  it('once planned, Release is now and Song is done', () => {
    expect(states('planned')).toEqual(['done', 'now', 'next']);
  });

  it('a dropped record is at no stop', () => {
    expect(states('dropped')).not.toContain('now');
    expect(states('dropped')).not.toContain('done');
  });
});

describe('taskCountsLine', () => {
  it('leaves done out when nothing is done', () => {
    expect(taskCountsLine(4, 0)).toBe('4 open');
    expect(taskCountsLine(0, 0)).toBe('0 open');
  });

  it('gives both counts', () => {
    expect(taskCountsLine(4, 1)).toBe('4 open, 1 done');
    expect(taskCountsLine(0, 2)).toBe('0 open, 2 done');
  });
});

describe('isTaskLate', () => {
  const today = '2026-11-11';

  it('is late only when the day is before today', () => {
    expect(isTaskLate('2026-11-10', today, false)).toBe(true);
    expect(isTaskLate('2026-11-11', today, false)).toBe(false);
    expect(isTaskLate('2026-11-12', today, false)).toBe(false);
  });

  it('reads the day out of a timestamp', () => {
    expect(isTaskLate('2026-11-08T00:00:00.000Z', today, false)).toBe(true);
  });

  it('is never late with no day, a bad day, or when finished', () => {
    expect(isTaskLate(null, today, false)).toBe(false);
    expect(isTaskLate(undefined, today, false)).toBe(false);
    expect(isTaskLate('soon', today, false)).toBe(false);
    expect(isTaskLate('2026-11-01', today, true)).toBe(false);
  });
});
