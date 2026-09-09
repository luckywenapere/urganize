import { describe, expect, it } from 'vitest';
import { isAssignableMember, proposeTaskOwners, type AssignableMember, type PastAssignment } from './task-owners';

const OWNER = 'owner-1';

const MEMBERS: AssignableMember[] = [
  { userId: 'ada', status: 'active', role: 'member' },
  { userId: 'ben', status: 'active', role: 'member' },
  { userId: 'cee', status: 'invited', role: 'member' },
  { userId: 'dee', status: 'removed', role: 'member' },
  { userId: 'eve', status: 'active', role: 'guest' },
];

describe('isAssignableMember', () => {
  it('accepts an active, non-guest member', () => {
    expect(isAssignableMember({ userId: 'ada', status: 'active', role: 'member' }, OWNER)).toBe(
      true
    );
  });

  it('rejects an invited member', () => {
    expect(isAssignableMember({ userId: 'cee', status: 'invited', role: 'member' }, OWNER)).toBe(
      false
    );
  });

  it('rejects a removed member', () => {
    expect(isAssignableMember({ userId: 'dee', status: 'removed', role: 'member' }, OWNER)).toBe(
      false
    );
  });

  it('rejects a guest even if their status is active', () => {
    expect(isAssignableMember({ userId: 'eve', status: 'active', role: 'guest' }, OWNER)).toBe(
      false
    );
  });

  it('rejects a member with no user id', () => {
    expect(isAssignableMember({ userId: '', status: 'active', role: 'member' }, OWNER)).toBe(
      false
    );
  });

  it('the owner is always assignable, even with no membership row of their own', () => {
    expect(isAssignableMember({ userId: OWNER, status: null, role: null }, OWNER)).toBe(true);
  });
});

describe('proposeTaskOwners: ranking by exact template step', () => {
  it('picks whoever handled this exact step most often', () => {
    const history: PastAssignment[] = [
      { templateTaskId: 't1', role: null, assignedToUserId: 'ada' },
      { templateTaskId: 't1', role: null, assignedToUserId: 'ada' },
      { templateTaskId: 't1', role: null, assignedToUserId: 'ben' },
    ];

    const [proposal] = proposeTaskOwners({
      tasks: [{ id: 'task-1', templateTaskId: 't1', role: null }],
      history,
      members: MEMBERS,
      creatorUserId: OWNER,
      memberNames: { ada: 'Ada', ben: 'Ben' },
    });

    expect(proposal).toEqual({
      taskId: 'task-1',
      userId: 'ada',
      basis: 'history',
      reason: 'Ada handled this on 2 past rollouts.',
    });
  });

  it('says "1 past release" in the singular', () => {
    const [proposal] = proposeTaskOwners({
      tasks: [{ id: 'task-1', templateTaskId: 't1', role: null }],
      history: [{ templateTaskId: 't1', role: null, assignedToUserId: 'ada' }],
      members: MEMBERS,
      creatorUserId: OWNER,
      memberNames: { ada: 'Ada' },
    });
    expect(proposal.reason).toBe('Ada handled this on 1 past rollout.');
  });

  it('breaks a frequency tie toward the more recent assignment (entries are newest-first)', () => {
    const history: PastAssignment[] = [
      { templateTaskId: 't2', role: null, assignedToUserId: 'ben' }, // newest
      { templateTaskId: 't2', role: null, assignedToUserId: 'ada' }, // older
    ];

    const [proposal] = proposeTaskOwners({
      tasks: [{ id: 'task-2', templateTaskId: 't2', role: null }],
      history,
      members: MEMBERS,
      creatorUserId: OWNER,
      memberNames: { ada: 'Ada', ben: 'Ben' },
    });

    expect(proposal.userId).toBe('ben');
  });

  it('skips a top candidate who is no longer assignable, without dropping to the role rung', () => {
    // cee (invited) took this step 3 times; ben (active) took it once. cee is
    // the most frequent but cannot be assigned, so ben — still a HISTORY
    // match, just the next-ranked one — should win, not a role fallback.
    const history: PastAssignment[] = [
      { templateTaskId: 't3', role: 'marketing', assignedToUserId: 'cee' },
      { templateTaskId: 't3', role: 'marketing', assignedToUserId: 'cee' },
      { templateTaskId: 't3', role: 'marketing', assignedToUserId: 'cee' },
      { templateTaskId: 't3', role: 'marketing', assignedToUserId: 'ben' },
    ];

    const [proposal] = proposeTaskOwners({
      tasks: [{ id: 'task-3', templateTaskId: 't3', role: 'marketing' }],
      history,
      members: MEMBERS,
      creatorUserId: OWNER,
      memberNames: { ben: 'Ben' },
    });

    expect(proposal).toEqual({
      taskId: 'task-3',
      userId: 'ben',
      basis: 'history',
      reason: 'Ben handled this on 1 past rollout.',
    });
  });

  it('excludes a removed member and a guest the same way', () => {
    const history: PastAssignment[] = [
      { templateTaskId: 't4', role: null, assignedToUserId: 'dee' }, // removed
      { templateTaskId: 't4', role: null, assignedToUserId: 'eve' }, // guest
      { templateTaskId: 't4', role: null, assignedToUserId: 'ada' }, // active
    ];

    const [proposal] = proposeTaskOwners({
      tasks: [{ id: 'task-4', templateTaskId: 't4', role: null }],
      history,
      members: MEMBERS,
      creatorUserId: OWNER,
      memberNames: { ada: 'Ada' },
    });

    expect(proposal.userId).toBe('ada');
  });
});

describe('proposeTaskOwners: falling through the ladder', () => {
  it('an unknown template id (no history for it) falls to the role match', () => {
    const history: PastAssignment[] = [
      { templateTaskId: 'some-other-step', role: 'editorial', assignedToUserId: 'ada' },
    ];

    const [proposal] = proposeTaskOwners({
      tasks: [{ id: 'task-5', templateTaskId: 'never-seen-before', role: 'editorial' }],
      history,
      members: MEMBERS,
      creatorUserId: OWNER,
      memberNames: { ada: 'Ada' },
    });

    expect(proposal).toEqual({
      taskId: 'task-5',
      userId: 'ada',
      basis: 'role',
      reason: 'Ada usually takes editorial work on your rollouts.',
    });
  });

  it('no role and no template history falls to the creator', () => {
    const [proposal] = proposeTaskOwners({
      tasks: [{ id: 'task-6', templateTaskId: null, role: null }],
      history: [],
      members: MEMBERS,
      creatorUserId: OWNER,
      memberNames: {},
    });

    expect(proposal).toEqual({
      taskId: 'task-6',
      userId: OWNER,
      basis: 'creator',
      reason: 'Nobody on the team has done this before, so it stays with you.',
    });
  });

  it('a role match also skips an inactive candidate before falling to the creator', () => {
    const history: PastAssignment[] = [
      { templateTaskId: null, role: 'marketing', assignedToUserId: 'dee' }, // removed
    ];

    const [proposal] = proposeTaskOwners({
      tasks: [{ id: 'task-7', templateTaskId: null, role: 'marketing' }],
      history,
      members: MEMBERS,
      creatorUserId: OWNER,
      memberNames: {},
    });

    expect(proposal.basis).toBe('creator');
    expect(proposal.userId).toBe(OWNER);
  });

  it('a missing display name falls back to a neutral phrase rather than a bare id', () => {
    const [proposal] = proposeTaskOwners({
      tasks: [{ id: 'task-8', templateTaskId: 't8', role: null }],
      history: [{ templateTaskId: 't8', role: null, assignedToUserId: 'ada' }],
      members: MEMBERS,
      creatorUserId: OWNER,
      memberNames: {},
    });
    expect(proposal.reason).toBe('Someone on the team handled this on 1 past rollout.');
  });
});

describe('proposeTaskOwners: totality', () => {
  it('returns exactly one proposal per task, in the same order', () => {
    const tasks = [
      { id: 'a', templateTaskId: 't1', role: null },
      { id: 'b', templateTaskId: null, role: 'marketing' },
      { id: 'c', templateTaskId: null, role: null },
    ];
    const proposals = proposeTaskOwners({
      tasks,
      history: [{ templateTaskId: 't1', role: null, assignedToUserId: 'ada' }],
      members: MEMBERS,
      creatorUserId: OWNER,
      memberNames: { ada: 'Ada' },
    });
    expect(proposals.map((p) => p.taskId)).toEqual(['a', 'b', 'c']);
  });
});
