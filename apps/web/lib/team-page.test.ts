import { describe, expect, it } from 'vitest';
import {
  accessPill,
  accessSentence,
  canManageTeam,
  groupTasks,
  readAccessRequest,
  sortPeople,
  summarizeTasks,
  teamHeaderLine,
  teamRoleOf,
  type TeamPerson,
  type TeamTaskInput,
} from './team-page';

// Wed 29 Oct 2026, 10:00 Lagos.
const NOW = new Date('2026-10-29T09:00:00Z');
const R1 = '11111111-1111-4111-8111-111111111111';
const A1 = '22222222-2222-4222-8222-222222222222';

function task(over: Partial<TeamTaskInput> & { id: string }): TeamTaskInput {
  return {
    title: over.id,
    status: 'todo',
    dueDate: null,
    completedAt: null,
    updatedAt: null,
    assignedToUserId: 'u1',
    releaseId: R1,
    releaseTitle: 'Lagos Nights',
    artistName: 'Zara',
    ...over,
  };
}

function person(over: Partial<TeamPerson> & { memberId: string }): TeamPerson {
  return {
    userId: over.memberId,
    name: over.memberId,
    email: `${over.memberId}@x.co`,
    initials: 'XX',
    avatarUrl: null,
    role: 'team-member',
    status: 'active',
    isCurrentUser: false,
    invitedAt: null,
    lastSeenAt: null,
    access: { kind: 'all' },
    summary: { open: 0, late: 0, doneThisWeek: 0, tasks: [] },
    ...over,
  };
}

describe('teamRoleOf', () => {
  it('maps database roles to the words the app uses', () => {
    expect(teamRoleOf('owner', false)).toBe('owner');
    expect(teamRoleOf('admin', false)).toBe('manager');
    expect(teamRoleOf('guest', false)).toBe('viewer');
    expect(teamRoleOf('member', false)).toBe('team-member');
    expect(teamRoleOf('member', true)).toBe('artist');
  });

  it('only owners and admins manage the team', () => {
    expect(canManageTeam('owner')).toBe(true);
    expect(canManageTeam('admin')).toBe(true);
    expect(canManageTeam('member')).toBe(false);
    expect(canManageTeam('guest')).toBe(false);
    expect(canManageTeam(null)).toBe(false);
  });
});

describe('summarizeTasks', () => {
  it('counts open, late (before today in Lagos) and done in the last 7 days', () => {
    const summary = summarizeTasks(
      [
        task({ id: 'late', dueDate: '2026-10-27' }),
        task({ id: 'today', dueDate: '2026-10-29' }),
        task({ id: 'undated' }),
        task({ id: 'done-recent', status: 'done', completedAt: '2026-10-25T10:00:00Z' }),
        task({ id: 'done-old', status: 'done', completedAt: '2026-10-10T10:00:00Z' }),
        // No completed_at: falls back to updated_at, like the usage metrics.
        task({ id: 'done-legacy', status: 'done', updatedAt: '2026-10-28T10:00:00Z' }),
        task({ id: 'cancelled', status: 'cancelled', dueDate: '2026-10-01' }),
      ],
      NOW
    );
    expect(summary.open).toBe(3);
    expect(summary.late).toBe(1);
    expect(summary.doneThisWeek).toBe(2);
    expect(summary.tasks.map((t) => t.id)).toEqual(['late', 'today', 'undated']);
  });

  it('a task due today is not late', () => {
    expect(summarizeTasks([task({ id: 't', dueDate: '2026-10-29' })], NOW).late).toBe(0);
  });
});

describe('groupTasks', () => {
  it('splits into late, the next 7 days, and later', () => {
    const { tasks } = summarizeTasks(
      [
        task({ id: 'late', dueDate: '2026-10-20' }),
        task({ id: 'fri', dueDate: '2026-10-31' }),
        task({ id: 'next-month', dueDate: '2026-11-20' }),
        task({ id: 'undated' }),
      ],
      NOW
    );
    const groups = groupTasks(tasks, NOW);
    expect(groups.late.map((t) => t.id)).toEqual(['late']);
    expect(groups.week.map((t) => t.id)).toEqual(['fri']);
    expect(groups.later.map((t) => t.id)).toEqual(['next-month', 'undated']);
  });
});

describe('sortPeople', () => {
  it('online first, then most recent, then never seen, and invites last', () => {
    const sorted = sortPeople(
      [
        person({ memberId: 'never' }),
        person({ memberId: 'invite-old', status: 'invited', invitedAt: '2026-10-01T00:00:00Z' }),
        person({ memberId: 'days', lastSeenAt: '2026-10-27T09:00:00Z' }),
        person({ memberId: 'online', lastSeenAt: '2026-10-29T08:55:00Z' }),
        person({ memberId: 'invite-new', status: 'invited', invitedAt: '2026-10-20T00:00:00Z' }),
      ],
      NOW
    );
    expect(sorted.map((p) => p.memberId)).toEqual(['online', 'days', 'never', 'invite-new', 'invite-old']);
  });
});

describe('access', () => {
  it('pill and sentence', () => {
    expect(accessPill({ kind: 'all' })).toBeNull();
    expect(accessPill({ kind: 'artist', artistId: A1, artistName: 'Zara' })).toBe('Zara only');
    expect(accessPill({ kind: 'rollouts', releaseIds: [R1], releaseTitles: ['A'] })).toBe('1 rollout');
    expect(accessPill({ kind: 'rollouts', releaseIds: [R1, A1], releaseTitles: ['A', 'B'] })).toBe('2 rollouts');
    expect(accessSentence({ kind: 'rollouts', releaseIds: [R1, A1], releaseTitles: ['A', 'B'] })).toBe('Only "A" and "B"');
    expect(accessSentence({ kind: 'all' })).toBe('All rollouts');
  });

  it('reads a manager request and refuses anything malformed', () => {
    expect(readAccessRequest({ kind: 'all' })).toEqual({ kind: 'all' });
    expect(readAccessRequest({ kind: 'artist', artistId: A1 })).toEqual({ kind: 'artist', artistId: A1 });
    expect(readAccessRequest({ kind: 'artist', artistId: 'nope' })).toBeNull();
    expect(readAccessRequest({ kind: 'rollouts', releaseIds: [R1, R1, 'bad'] })).toEqual({ kind: 'rollouts', releaseIds: [R1] });
    // An empty pick is not a choice a manager can make.
    expect(readAccessRequest({ kind: 'rollouts', releaseIds: [] })).toBeNull();
    expect(readAccessRequest(null)).toBeNull();
  });
});

describe('teamHeaderLine', () => {
  it('names the team, the seats and who is online', () => {
    expect(teamHeaderLine({ name: 'Northline', seatsUsed: 5, seatLimit: 6, online: 2 })).toBe('Northline · 5 of 6 seats · 2 online now');
    expect(teamHeaderLine({ name: 'Northline', seatsUsed: 1, seatLimit: null, online: 0 })).toBe('Northline · 1 on the team');
  });
});
