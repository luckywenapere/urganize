import { describe, expect, it } from 'vitest';
import { buildWaitingOnOthers, buildYourTasks } from './tasks';
import { buildTask } from './test-fixtures';

const NOW = new Date('2026-09-29T12:00:00.000Z');
const RELEASE_LOOKUP = new Map([['r1', { title: 'Midnight EP', artistName: 'Dorian' }]]);

describe('buildYourTasks', () => {
  it('buckets the viewer\'s tasks into late/today/week and matches the catalog\'s own section rule', () => {
    const tasks = [
      buildTask({ id: '1', assignedToUserId: 'viewer', status: 'todo', dueDate: '2026-09-20', releaseId: 'r1' }),
      buildTask({ id: '2', assignedToUserId: 'viewer', status: 'todo', dueDate: '2026-09-29', releaseId: 'r1' }),
      buildTask({ id: '3', assignedToUserId: 'viewer', status: 'todo', dueDate: '2026-10-02', releaseId: 'r1' }),
      buildTask({ id: '4', assignedToUserId: 'viewer', status: 'todo', dueDate: '2027-01-01', releaseId: 'r1' }),
    ];
    const result = buildYourTasks(tasks, 'viewer', RELEASE_LOOKUP, NOW);
    expect(result.late.map((t) => t.id)).toEqual(['1']);
    expect(result.today.map((t) => t.id)).toEqual(['2']);
    expect(result.week.map((t) => t.id)).toEqual(['3']);
  });

  it('ignores tasks assigned to someone else', () => {
    const tasks = [buildTask({ assignedToUserId: 'someone-else', status: 'todo', dueDate: '2026-09-20' })];
    const result = buildYourTasks(tasks, 'viewer', RELEASE_LOOKUP, NOW);
    expect(result.late).toHaveLength(0);
    expect(result.today).toHaveLength(0);
    expect(result.week).toHaveLength(0);
  });

  it('excludes done, in_progress and no-due-date tasks from all three buckets', () => {
    const tasks = [
      buildTask({ id: '1', assignedToUserId: 'viewer', status: 'done', dueDate: '2026-09-20' }),
      buildTask({ id: '2', assignedToUserId: 'viewer', status: 'in_progress', dueDate: '2026-09-20' }),
      buildTask({ id: '3', assignedToUserId: 'viewer', status: 'todo', dueDate: null }),
    ];
    const result = buildYourTasks(tasks, 'viewer', RELEASE_LOOKUP, NOW);
    expect(result.late).toHaveLength(0);
    expect(result.today).toHaveLength(0);
    expect(result.week).toHaveLength(0);
  });

  it('respects a pendingCompletionIds override, keeping a just-ticked task in its pre-tick bucket for the in-place beat', () => {
    const tasks = [
      buildTask({ id: '1', assignedToUserId: 'viewer', status: 'done', dueDate: '2026-09-20' }),
    ];
    // No override: a done task appears in none of the three buckets.
    expect(buildYourTasks(tasks, 'viewer', RELEASE_LOOKUP, NOW).late).toHaveLength(0);
    // With the pre-tick status recorded as pending, it reads as still overdue
    // for the beat — matching getTaskSectionKey's own documented contract.
    const withPending = buildYourTasks(tasks, 'viewer', RELEASE_LOOKUP, NOW, { '1': 'todo' });
    expect(withPending.late.map((t) => t.id)).toEqual(['1']);
  });

  it('resolves releaseTitle and artistName from the lookup, and leaves them null when unresolved', () => {
    const tasks = [
      buildTask({
        id: '1',
        assignedToUserId: 'viewer',
        status: 'todo',
        dueDate: '2026-09-20',
        releaseId: 'r1',
      }),
      buildTask({
        id: '2',
        assignedToUserId: 'viewer',
        status: 'todo',
        dueDate: '2026-09-20',
        releaseId: 'unknown-release',
      }),
    ];
    const result = buildYourTasks(tasks, 'viewer', RELEASE_LOOKUP, NOW);
    expect(result.late[0].releaseTitle).toBe('Midnight EP');
    expect(result.late[0].artistName).toBe('Dorian');
    expect(result.late[1].releaseTitle).toBeNull();
  });
});

describe('buildWaitingOnOthers', () => {
  const releaseIdsYouRun = new Set(['r1']);

  it('lists late tasks assigned to someone else on a release you run, with daysLate', () => {
    const tasks = [
      buildTask({
        id: '1',
        releaseId: 'r1',
        assignedToUserId: 'teammate',
        status: 'todo',
        dueDate: '2026-09-25',
      }),
    ];
    const result = buildWaitingOnOthers(tasks, 'viewer', releaseIdsYouRun, RELEASE_LOOKUP, NOW);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].daysLate).toBe(4);
    expect(result.onTimeCount).toBe(0);
  });

  it('counts open, on-time, someone-else tasks toward onTimeCount instead of the late list', () => {
    const tasks = [
      buildTask({ id: '1', releaseId: 'r1', assignedToUserId: 'teammate', status: 'todo', dueDate: '2026-10-05' }),
    ];
    const result = buildWaitingOnOthers(tasks, 'viewer', releaseIdsYouRun, RELEASE_LOOKUP, NOW);
    expect(result.tasks).toHaveLength(0);
    expect(result.onTimeCount).toBe(1);
  });

  it('never counts the viewer\'s own tasks, even if late', () => {
    const tasks = [
      buildTask({ id: '1', releaseId: 'r1', assignedToUserId: 'viewer', status: 'todo', dueDate: '2026-09-20' }),
    ];
    const result = buildWaitingOnOthers(tasks, 'viewer', releaseIdsYouRun, RELEASE_LOOKUP, NOW);
    expect(result.tasks).toHaveLength(0);
    expect(result.onTimeCount).toBe(0);
  });

  it('never counts unassigned tasks', () => {
    const tasks = [
      buildTask({ id: '1', releaseId: 'r1', assignedToUserId: null, status: 'todo', dueDate: '2026-09-20' }),
    ];
    const result = buildWaitingOnOthers(tasks, 'viewer', releaseIdsYouRun, RELEASE_LOOKUP, NOW);
    expect(result.tasks).toHaveLength(0);
    expect(result.onTimeCount).toBe(0);
  });

  it('ignores a release the viewer does not run, even if late and assigned to someone else', () => {
    const tasks = [
      buildTask({
        id: '1',
        releaseId: 'a-release-you-do-not-run',
        assignedToUserId: 'teammate',
        status: 'todo',
        dueDate: '2026-09-20',
      }),
    ];
    const result = buildWaitingOnOthers(tasks, 'viewer', releaseIdsYouRun, RELEASE_LOOKUP, NOW);
    expect(result.tasks).toHaveLength(0);
    expect(result.onTimeCount).toBe(0);
  });

  it('excludes done and cancelled tasks', () => {
    const tasks = [
      buildTask({ id: '1', releaseId: 'r1', assignedToUserId: 'teammate', status: 'done', dueDate: '2026-09-20' }),
      buildTask({ id: '2', releaseId: 'r1', assignedToUserId: 'teammate', status: 'cancelled', dueDate: '2026-09-20' }),
    ];
    const result = buildWaitingOnOthers(tasks, 'viewer', releaseIdsYouRun, RELEASE_LOOKUP, NOW);
    expect(result.tasks).toHaveLength(0);
    expect(result.onTimeCount).toBe(0);
  });
});
