import { describe, expect, it } from 'vitest';

import {
  computeShiftedTaskDueDates,
  daysBetweenReleaseDates,
  type ReschedulableTask,
} from './release-reschedule';

describe('daysBetweenReleaseDates', () => {
  it('counts whole days forward', () => {
    expect(daysBetweenReleaseDates('2026-11-13', '2026-11-27')).toBe(14);
  });

  it('counts whole days backward as negative', () => {
    expect(daysBetweenReleaseDates('2026-11-27', '2026-11-13')).toBe(-14);
  });

  it('is zero for the same date', () => {
    expect(daysBetweenReleaseDates('2026-11-13', '2026-11-13')).toBe(0);
  });

  it('tolerates a full ISO timestamp on either side (only the date part matters)', () => {
    expect(
      daysBetweenReleaseDates('2026-11-13T00:00:00.000Z', '2026-11-20T00:00:00.000Z')
    ).toBe(7);
  });

  it('returns null rather than NaN when a date fails to parse', () => {
    expect(daysBetweenReleaseDates('not-a-date', '2026-11-13')).toBeNull();
    expect(daysBetweenReleaseDates('2026-11-13', 'not-a-date')).toBeNull();
  });
});

describe('computeShiftedTaskDueDates', () => {
  const task = (over: Partial<ReschedulableTask> & { id: string }): ReschedulableTask => ({
    status: 'todo',
    dueDate: '2026-11-06T00:00:00.000Z',
    ...over,
  });

  it('shifts every open, dated task by the same number of days', () => {
    const tasks = [task({ id: 'a' }), task({ id: 'b', dueDate: '2026-11-20T00:00:00.000Z' })];
    const shifts = computeShiftedTaskDueDates(tasks, 14);
    expect(shifts).toEqual([
      { id: 'a', dueDate: '2026-11-20T00:00:00.000Z' },
      { id: 'b', dueDate: '2026-12-04T00:00:00.000Z' },
    ]);
  });

  it('shifts backward for a negative move', () => {
    const shifts = computeShiftedTaskDueDates([task({ id: 'a' })], -7);
    expect(shifts).toEqual([{ id: 'a', dueDate: '2026-10-30T00:00:00.000Z' }]);
  });

  it('never moves a done task', () => {
    const shifts = computeShiftedTaskDueDates([task({ id: 'a', status: 'done' })], 14);
    expect(shifts).toEqual([]);
  });

  it('never moves a cancelled task', () => {
    const shifts = computeShiftedTaskDueDates([task({ id: 'a', status: 'cancelled' })], 14);
    expect(shifts).toEqual([]);
  });

  it('moves every other status — locked, backlog, in_progress, blocked, in_review — same as todo', () => {
    const statuses = ['locked', 'backlog', 'todo', 'in_progress', 'blocked', 'in_review'];
    const tasks = statuses.map((status, i) => task({ id: `t${i}`, status }));
    const shifts = computeShiftedTaskDueDates(tasks, 3);
    expect(shifts).toHaveLength(statuses.length);
  });

  it('skips a task with no due date to shift', () => {
    const shifts = computeShiftedTaskDueDates([task({ id: 'a', dueDate: null })], 14);
    expect(shifts).toEqual([]);
  });

  it('skips a task whose due date fails to parse, rather than writing an Invalid Date', () => {
    const shifts = computeShiftedTaskDueDates([task({ id: 'a', dueDate: 'not-a-date' })], 14);
    expect(shifts).toEqual([]);
  });

  it('is a no-op when the release date did not actually move', () => {
    const shifts = computeShiftedTaskDueDates([task({ id: 'a' })], 0);
    expect(shifts).toEqual([]);
  });

  it('preserves the time of day, not just the date, on the shifted due date', () => {
    const shifts = computeShiftedTaskDueDates(
      [task({ id: 'a', dueDate: '2026-11-06T15:30:00.000Z' })],
      1
    );
    expect(shifts).toEqual([{ id: 'a', dueDate: '2026-11-07T15:30:00.000Z' }]);
  });
});
