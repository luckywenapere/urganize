import { describe, expect, it } from 'vitest';
import {
  HOME_TASK_LIMIT,
  countDelegatedPeople,
  countRollouts,
  focusMyTasks,
  homeDueLabel,
  homeTaskSubline,
  selectDelegated,
  selectMyTasks,
  type HomeFocusTask,
  type HomeTaskInput,
} from './tasks';

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

describe('focusMyTasks', () => {
  // A plan gives its owner every task it makes, so "assigned to me" alone is
  // the whole plan. These hold My tasks to what is worth a person's eye.
  function plan(over: Partial<HomeFocusTask> & { id: string }): HomeFocusTask {
    return {
      ...task({ id: over.id }),
      status: 'todo',
      priority: 'medium',
      position: 0,
      autoGenerated: true,
      planKey: false,
      taskType: 'task',
      ...over,
    };
  }
  const ids = (tasks: HomeFocusTask[]) => tasks.map((entry) => entry.id).sort();

  it('keeps a rollout to its short main list, not every task the plan made', () => {
    const tasks = [
      ...Array.from({ length: 6 }, (_, index) => plan({ id: `key${index}`, planKey: true, dueDate: '2026-11-20' })),
      ...Array.from({ length: 40 }, (_, index) => plan({ id: `rest${index}`, dueDate: '2026-11-25' })),
    ];
    const kept = focusMyTasks(tasks, ME, new Map([['rel-1', '2026-12-01']]), TODAY);
    expect(ids(kept)).toEqual(['key0', 'key1', 'key2', 'key3', 'key4', 'key5']);
  });

  it('always keeps a task a person wrote by hand', () => {
    const tasks = [
      ...Array.from({ length: 6 }, (_, index) => plan({ id: `key${index}`, planKey: true })),
      plan({ id: 'by-hand', autoGenerated: false, planKey: null }),
    ];
    expect(ids(focusMyTasks(tasks, ME, new Map(), TODAY))).toContain('by-hand');
  });

  it('drops work left over from before a song that is already out', () => {
    const tasks = [
      plan({ id: 'before-release', planKey: true, dueDate: '2026-09-01' }),
      plan({ id: 'after-release', planKey: true, dueDate: '2026-10-30' }),
      plan({ id: 'release-day', planKey: true, dueDate: '2026-10-23' }),
    ];
    const kept = focusMyTasks(tasks, ME, new Map([['rel-1', '2026-10-23']]), TODAY);
    expect(ids(kept)).toEqual(['after-release', 'release-day']);
  });

  it('keeps late work on a rollout that has not dropped yet', () => {
    const tasks = [plan({ id: 'late', planKey: true, dueDate: '2026-10-01' })];
    expect(ids(focusMyTasks(tasks, ME, new Map([['rel-1', '2026-11-18']]), TODAY))).toEqual(['late']);
    expect(ids(focusMyTasks(tasks, ME, new Map([['rel-1', null]]), TODAY))).toEqual(['late']);
  });

  it('picks the main list from the whole rollout, then keeps only the viewer’s', () => {
    const tasks = [
      ...Array.from({ length: 5 }, (_, index) => plan({ id: `theirs${index}`, planKey: true, assignedToUserId: CHI })),
      plan({ id: 'mine-tucked', dueDate: '2026-11-12' }),
    ];
    // Five key tasks fill the list, so the tucked one is not topped up.
    expect(focusMyTasks(tasks, ME, new Map(), TODAY)).toEqual([]);
  });

  it('leaves done and cancelled work out', () => {
    const tasks = [plan({ id: 'done', planKey: true, status: 'done' }), plan({ id: 'open', planKey: true })];
    expect(ids(focusMyTasks(tasks, ME, new Map(), TODAY))).toEqual(['open']);
  });
});

describe('the line under a task heading', () => {
  it('counts the rollouts my open tasks sit on', () => {
    expect(countRollouts([{ releaseId: 'a' }, { releaseId: 'a' }, { releaseId: 'b' }, { releaseId: null }])).toBe(2);
    expect(homeTaskSubline('mine', 2)).toBe('open across 2 rollouts');
    expect(homeTaskSubline('mine', 1)).toBe('open on 1 rollout');
    expect(homeTaskSubline('mine', 0)).toBe('open');
  });

  it('counts the people holding what I handed out, open tasks only', () => {
    const owned = new Set(['r1']);
    const tasks = [
      task({ id: 'a', assignedToUserId: 'u2', releaseId: 'r1', createdBy: 'planner' }),
      task({ id: 'b', assignedToUserId: 'u2', createdBy: ME }),
      task({ id: 'c', assignedToUserId: 'u3', createdBy: ME }),
      task({ id: 'd', assignedToUserId: 'u4', createdBy: ME, status: 'done' }),
      task({ id: 'e', assignedToUserId: ME, createdBy: ME }),
      task({ id: 'f', assignedToUserId: 'u5', createdBy: 'someone' }),
    ];
    expect(countDelegatedPeople(tasks, ME, owned)).toBe(2);
    expect(homeTaskSubline('delegated', 3)).toBe('with 3 people');
    expect(homeTaskSubline('delegated', 1)).toBe('with 1 person');
    expect(homeTaskSubline('delegated', 0)).toBeNull();
  });
});
