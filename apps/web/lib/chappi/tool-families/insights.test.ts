/**
 * Pure computation behind `compare_releases` and `get_team_workload`
 * (../insights.ts). Both tools proxy live data through these functions, so
 * this is where the actual logic — recency ordering, date math, who is
 * carrying what — gets proven, without a database.
 *
 * Written before insights.ts existed, per the "how new logic gets tested
 * here" convention in CLAUDE.md: name the assertion first.
 */

import { describe, expect, it } from 'vitest';
import {
  compareByRecency,
  compareReleases,
  computeTeamWorkload,
  type ReleaseComparisonInput,
  type WorkloadMember,
  type WorkloadTaskInput,
} from './insights';

const TODAY = '2026-09-03';

function release(over: Partial<ReleaseComparisonInput> & { id: string }): ReleaseComparisonInput {
  return {
    title: `Release ${over.id}`,
    status: 'draft',
    releaseDate: null,
    tasksDone: 0,
    tasksTotal: 0,
    ...over,
  };
}

describe('compareByRecency', () => {
  it('sorts the later date first', () => {
    const a = { releaseDate: '2026-01-01' };
    const b = { releaseDate: '2026-06-01' };
    expect(compareByRecency(a, b)).toBeGreaterThan(0);
    expect(compareByRecency(b, a)).toBeLessThan(0);
  });

  it('treats a null date as older than any real date', () => {
    const dated = { releaseDate: '2026-01-01' };
    const undated = { releaseDate: null };
    expect(compareByRecency(dated, undated)).toBeLessThan(0);
    expect(compareByRecency(undated, dated)).toBeGreaterThan(0);
  });

  it('is stable when both dates match', () => {
    expect(compareByRecency({ releaseDate: '2026-01-01' }, { releaseDate: '2026-01-01' })).toBe(0);
    expect(compareByRecency({ releaseDate: null }, { releaseDate: null })).toBe(0);
  });
});

describe('compareReleases', () => {
  it('returns nothing for an empty workspace', () => {
    expect(compareReleases([], TODAY)).toEqual([]);
  });

  it('orders most recent first and caps at the limit', () => {
    const rows = compareReleases(
      [
        release({ id: 'oldest', releaseDate: '2026-01-01' }),
        release({ id: 'newest', releaseDate: '2026-08-01' }),
        release({ id: 'middle', releaseDate: '2026-04-01' }),
      ],
      TODAY,
      2
    );
    expect(rows.map((r) => r.id)).toEqual(['newest', 'middle']);
  });

  it('sorts undated releases last, never dropping them silently', () => {
    const rows = compareReleases(
      [release({ id: 'undated', releaseDate: null }), release({ id: 'dated', releaseDate: '2026-01-01' })],
      TODAY,
      5
    );
    expect(rows.map((r) => r.id)).toEqual(['dated', 'undated']);
    expect(rows[1].daysFromToday).toBeNull();
  });

  it('computes days from today in both directions', () => {
    const [future, past] = compareReleases(
      [
        release({ id: 'future', releaseDate: '2026-09-13' }),
        release({ id: 'past', releaseDate: '2026-08-24' }),
      ],
      TODAY,
      5
    ).sort((a, b) => (a.id < b.id ? -1 : 1));
    // future = 2026-09-13, past = 2026-08-24, TODAY = 2026-09-03.
    expect(future.daysFromToday).toBe(10);
    expect(past.daysFromToday).toBe(-10);
  });

  it('reads zero days for a release dated today', () => {
    const [row] = compareReleases([release({ id: 'today', releaseDate: TODAY })], TODAY, 5);
    expect(row.daysFromToday).toBe(0);
  });

  it('computes progress as a rounded percentage, never dividing by zero', () => {
    const [noTasks, partial] = compareReleases(
      [
        release({ id: 'none', tasksDone: 0, tasksTotal: 0 }),
        release({ id: 'partial', tasksDone: 1, tasksTotal: 3 }),
      ],
      TODAY,
      5
    );
    expect(noTasks.progressPercent).toBe(0);
    expect(partial.progressPercent).toBe(33);
  });
});

function memberFixture(over: Partial<WorkloadMember> & { userId: string }): WorkloadMember {
  return { name: `Member ${over.userId}`, ...over };
}

function taskFixture(over: Partial<WorkloadTaskInput>): WorkloadTaskInput {
  return { assignedToUserId: null, status: 'todo', dueDate: null, ...over };
}

describe('computeTeamWorkload', () => {
  it('reads zero for a team with no tasks at all', () => {
    const result = computeTeamWorkload([memberFixture({ userId: 'u1' })], [], TODAY);
    expect(result.members).toEqual([{ userId: 'u1', name: 'Member u1', openTasks: 0, overdueTasks: 0 }]);
    expect(result.unassignedOpenTasks).toBe(0);
  });

  it('counts open tasks per assignee and ignores done/cancelled work', () => {
    const result = computeTeamWorkload(
      [memberFixture({ userId: 'u1' })],
      [
        taskFixture({ assignedToUserId: 'u1', status: 'todo' }),
        taskFixture({ assignedToUserId: 'u1', status: 'in_progress' }),
        taskFixture({ assignedToUserId: 'u1', status: 'done' }),
        taskFixture({ assignedToUserId: 'u1', status: 'cancelled' }),
      ],
      TODAY
    );
    expect(result.members[0].openTasks).toBe(2);
  });

  it('counts overdue open tasks separately from open tasks', () => {
    const result = computeTeamWorkload(
      [memberFixture({ userId: 'u1' })],
      [
        taskFixture({ assignedToUserId: 'u1', status: 'todo', dueDate: '2026-08-01' }), // overdue
        taskFixture({ assignedToUserId: 'u1', status: 'todo', dueDate: '2026-12-01' }), // not yet
        taskFixture({ assignedToUserId: 'u1', status: 'todo', dueDate: null }), // no date
      ],
      TODAY
    );
    expect(result.members[0].openTasks).toBe(3);
    expect(result.members[0].overdueTasks).toBe(1);
  });

  it('does not count a done task as overdue even with a past due date', () => {
    const result = computeTeamWorkload(
      [memberFixture({ userId: 'u1' })],
      [taskFixture({ assignedToUserId: 'u1', status: 'done', dueDate: '2026-01-01' })],
      TODAY
    );
    expect(result.members[0].overdueTasks).toBe(0);
  });

  it('tallies work assigned to nobody separately, never attributing it to a member', () => {
    const result = computeTeamWorkload(
      [memberFixture({ userId: 'u1' })],
      [taskFixture({ assignedToUserId: null, status: 'todo' })],
      TODAY
    );
    expect(result.members[0].openTasks).toBe(0);
    expect(result.unassignedOpenTasks).toBe(1);
  });

  it('never attributes a task to someone outside the member list', () => {
    const result = computeTeamWorkload(
      [memberFixture({ userId: 'u1' })],
      [taskFixture({ assignedToUserId: 'someone-who-left', status: 'todo' })],
      TODAY
    );
    expect(result.members[0].openTasks).toBe(0);
    // Not unassigned either — this is a real assignee just not in `members`,
    // and silently double-counting it under "unassigned" would misreport it.
    expect(result.unassignedOpenTasks).toBe(0);
  });

  it('sorts members busiest first', () => {
    const result = computeTeamWorkload(
      [memberFixture({ userId: 'quiet' }), memberFixture({ userId: 'busy' })],
      [
        taskFixture({ assignedToUserId: 'busy', status: 'todo' }),
        taskFixture({ assignedToUserId: 'busy', status: 'todo' }),
        taskFixture({ assignedToUserId: 'quiet', status: 'todo' }),
      ],
      TODAY
    );
    expect(result.members.map((m) => m.userId)).toEqual(['busy', 'quiet']);
  });
});
