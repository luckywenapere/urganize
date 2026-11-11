import { describe, expect, it } from 'vitest';
import { HOME_TASK_LIMIT, homeDueLabel, selectDelegated, selectMyTasks, type HomeTaskInput } from './tasks';

const TODAY = '2026-11-10';
const ME = 'user-me';
const CHI = 'user-chi';

function task(over: Partial<HomeTaskInput> & { id: string }): HomeTaskInput {
  return {
    title: over.id,
    status: 'todo',
    dueDate: null,
    completedAt: null,
    createdBy: ME,
    assignedToUserId: ME,
    releaseId: 'rel-1',
    ...over,
  };
}

describe('selectMyTasks', () => {
  it('keeps only open tasks assigned to the viewer', () => {
    const picked = selectMyTasks(
      [
        task({ id: 'mine' }),
        task({ id: 'done', status: 'done' }),
        task({ id: 'cancelled', status: 'cancelled' }),
        task({ id: 'theirs', assignedToUserId: CHI }),
        task({ id: 'nobody', assignedToUserId: null }),
      ],
      ME,
      TODAY
    );
    expect(picked.rows.map((row) => row.id)).toEqual(['mine']);
    expect(picked.open).toBe(1);
  });

  it('puts late first (oldest first), then soonest, then no date', () => {
    const picked = selectMyTasks(
      [
        task({ id: 'undated' }),
        task({ id: 'next-week', dueDate: '2026-11-16' }),
        task({ id: 'late-2', dueDate: '2026-11-08' }),
        task({ id: 'today', dueDate: '2026-11-10' }),
        task({ id: 'late-6', dueDate: '2026-11-04T09:00:00Z' }),
      ],
      ME,
      TODAY
    );
    expect(picked.rows.map((row) => row.id)).toEqual(['late-6', 'late-2', 'today', 'next-week', 'undated']);
    expect(picked.rows.map((row) => row.late)).toEqual([true, true, false, false, false]);
  });

  it('shows the top five and still counts them all', () => {
    const many = Array.from({ length: 8 }, (_, index) => task({ id: `t${index}`, dueDate: `2026-11-1${index}` }));
    const picked = selectMyTasks(many, ME, TODAY);
    expect(picked.rows).toHaveLength(HOME_TASK_LIMIT);
    expect(picked.open).toBe(8);
  });

  it('is empty for a signed-out viewer, never everyone’s tasks', () => {
    expect(selectMyTasks([task({ id: 'a' })], '', TODAY)).toEqual({ open: 0, rows: [] });
  });
});

describe('selectDelegated', () => {
  const owned = new Set(['rel-own']);

  it('keeps open tasks the viewer created or owns that someone else holds', () => {
    const picked = selectDelegated(
      [
        task({ id: 'created', assignedToUserId: CHI }),
        task({ id: 'owned', assignedToUserId: CHI, createdBy: 'planner', releaseId: 'rel-own' }),
        task({ id: 'not-mine', assignedToUserId: CHI, createdBy: CHI, releaseId: 'rel-other' }),
        task({ id: 'my-own', assignedToUserId: ME }),
        task({ id: 'unassigned', assignedToUserId: null }),
      ],
      ME,
      owned,
      TODAY
    );
    expect(picked.rows.map((row) => row.id).sort()).toEqual(['created', 'owned']);
    expect(picked.open).toBe(2);
  });

  it('orders like My tasks: late, soonest, no date', () => {
    const picked = selectDelegated(
      [
        task({ id: 'later', assignedToUserId: CHI, dueDate: '2026-11-16' }),
        task({ id: 'late', assignedToUserId: CHI, dueDate: '2026-11-07' }),
        task({ id: 'undated', assignedToUserId: CHI }),
      ],
      ME,
      owned,
      TODAY
    );
    expect(picked.rows.map((row) => row.id)).toEqual(['late', 'later', 'undated']);
  });

  it('fills spare rows with what was finished today, after the open ones', () => {
    const picked = selectDelegated(
      [
        task({ id: 'open', assignedToUserId: CHI, dueDate: '2026-11-12' }),
        // 23:30 UTC on the 9th is already the 10th in Lagos.
        task({ id: 'done-today', assignedToUserId: CHI, status: 'done', completedAt: '2026-11-09T23:30:00Z' }),
        task({ id: 'done-before', assignedToUserId: CHI, status: 'done', completedAt: '2026-11-08T12:00:00Z' }),
      ],
      ME,
      owned,
      TODAY
    );
    expect(picked.rows.map((row) => [row.id, row.doneToday])).toEqual([
      ['open', false],
      ['done-today', true],
    ]);
    expect(picked.open).toBe(1);
  });

  it('never lets finished work push out open work', () => {
    const open = Array.from({ length: 5 }, (_, index) => task({ id: `o${index}`, assignedToUserId: CHI }));
    const picked = selectDelegated(
      [...open, task({ id: 'done', assignedToUserId: CHI, status: 'done', completedAt: '2026-11-10T08:00:00Z' })],
      ME,
      owned,
      TODAY
    );
    expect(picked.rows.every((row) => !row.doneToday)).toBe(true);
  });
});

describe('homeDueLabel', () => {
  it('says how late, today, tomorrow, then the day', () => {
    expect(homeDueLabel('2026-11-04', TODAY)).toEqual({ text: '6 days late', late: true });
    expect(homeDueLabel('2026-11-09', TODAY)).toEqual({ text: '1 day late', late: true });
    expect(homeDueLabel('2026-11-10', TODAY)).toEqual({ text: 'Today', late: false });
    expect(homeDueLabel('2026-11-11', TODAY)).toEqual({ text: 'Tomorrow', late: false });
    expect(homeDueLabel('2026-11-12', TODAY)).toEqual({ text: 'Thu 12 Nov', late: false });
  });

  it('says "No date" for a missing or unreadable date', () => {
    expect(homeDueLabel(null, TODAY)).toEqual({ text: 'No date', late: false });
    expect(homeDueLabel('soon', TODAY)).toEqual({ text: 'No date', late: false });
  });
});
