/**
 * Phase 1: what the assistant is told about the team before anyone speaks.
 *
 * Prompt text is the kind of thing that drifts silently — nothing type-checks
 * a sentence — so the formatting half of the snapshot is pure and asserted
 * here. The IO half (loadSnapshotMembers) is not covered: it is two selects,
 * and stubbing PostgREST to prove a select happened would test the stub.
 */

import { describe, expect, it } from 'vitest';
import {
  SNAPSHOT_RELEASE_LIMIT,
  formatWorkspaceSummary,
  selectSnapshotReleases,
  type SnapshotMember,
} from './workspace-summary';
import type { Release } from '@/types/releases';
import type { Task } from '@/types/tasks';

const TODAY = '2026-08-24';

function release(over: Partial<Release> & { id: string }): Release {
  return {
    title: `Release ${over.id}`,
    status: 'draft',
    releaseDate: null,
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  } as Release;
}

function task(over: Partial<Task> & { id: string }): Task {
  return {
    title: `Task ${over.id}`,
    status: 'todo',
    releaseId: null,
    assignedToUserId: null,
    assignedTo: null,
    dueDate: null,
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  } as Task;
}

function member(over: Partial<SnapshotMember> & { name: string }): SnapshotMember {
  return {
    userId: `user-${over.name}`,
    accountRole: null,
    workspaceRole: 'member',
    status: 'active',
    isCurrentUser: false,
    ...over,
  };
}

const base = { releases: [release({ id: 'r1' })], tasks: [], members: [], today: TODAY };

describe('empty and near-empty states', () => {
  it('says so plainly when there are no releases', () => {
    expect(formatWorkspaceSummary({ ...base, releases: [] })).toBe('The user has no rollouts yet.');
  });

  // A header over an empty list teaches the model to invent something to put
  // under it, so every optional section is omitted entirely.
  it('omits overdue, per-person and team sections when they have nothing to say', () => {
    const out = formatWorkspaceSummary(base);
    expect(out).not.toMatch(/Overdue/);
    expect(out).not.toMatch(/Open work by person/);
    expect(out).not.toMatch(/The team/);
  });
});

describe('overdue', () => {
  const tasks = [
    task({ id: 't1', title: 'Master due', dueDate: '2026-08-01', releaseId: 'r1' }),
    task({ id: 't2', title: 'Not yet', dueDate: '2026-09-01' }),
    task({ id: 't3', title: 'Done late', dueDate: '2026-08-02', status: 'done' }),
    task({ id: 't4', title: 'Cancelled', dueDate: '2026-08-03', status: 'cancelled' }),
    task({ id: 't5', title: 'No date' }),
  ];

  it('counts only open tasks whose due date has passed', () => {
    const out = formatWorkspaceSummary({ ...base, tasks });
    expect(out).toMatch(/Overdue \(1\):/);
    expect(out).toContain('Master due');
    for (const absent of ['Not yet', 'Done late', 'Cancelled', 'No date']) {
      expect(out).not.toContain(absent);
    }
  });

  // Due TODAY is not overdue. An off-by-one here would have UrgAns open every
  // conversation by telling a manager they are already late.
  it('treats a task due today as not overdue', () => {
    const out = formatWorkspaceSummary({
      ...base,
      tasks: [task({ id: 't', title: 'Due today', dueDate: TODAY })],
    });
    expect(out).not.toMatch(/Overdue/);
  });

  it('names the release and the assignee, and resolves the id to a person', () => {
    const out = formatWorkspaceSummary({
      ...base,
      releases: [release({ id: 'r1', title: 'Midnight EP' })],
      members: [member({ name: 'Tobi', userId: 'u1' })],
      tasks: [
        task({ id: 't', title: 'Send masters', dueDate: '2026-08-01', releaseId: 'r1', assignedToUserId: 'u1' }),
      ],
    });
    expect(out).toContain('- Send masters (due 2026-08-01, Midnight EP, Tobi)');
  });

  it('says unassigned rather than leaving a gap', () => {
    const out = formatWorkspaceSummary({
      ...base,
      tasks: [task({ id: 't', title: 'Orphan', dueDate: '2026-08-01' })],
    });
    expect(out).toContain('unassigned');
  });

  it('caps the list and says how many it did not print', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      task({ id: `t${i}`, title: `Late ${i}`, dueDate: '2026-08-01' })
    );
    const out = formatWorkspaceSummary({ ...base, tasks: many });
    expect(out).toMatch(/Overdue \(12\):/);
    expect(out).toContain('...and 4 more');
  });
});

describe('open work by person', () => {
  it('groups by assignee, busiest first, and separates the unassigned pile', () => {
    const out = formatWorkspaceSummary({
      ...base,
      members: [member({ name: 'Tobi', userId: 'u1' }), member({ name: 'Ada', userId: 'u2' })],
      tasks: [
        task({ id: 'a', assignedToUserId: 'u1' }),
        task({ id: 'b', assignedToUserId: 'u1' }),
        task({ id: 'c', assignedToUserId: 'u2' }),
        task({ id: 'd' }),
        task({ id: 'e', assignedToUserId: 'u1', status: 'done' }),
      ],
    });
    expect(out).toContain('- Tobi: 2 open tasks');
    expect(out).toContain('- Ada: 1 open task');
    expect(out).toContain('- Unassigned: 1 open task');
    expect(out.indexOf('- Tobi')).toBeLessThan(out.indexOf('- Ada'));
  });

  it('falls back to the denormalized name when the id resolves to nobody', () => {
    const out = formatWorkspaceSummary({
      ...base,
      tasks: [task({ id: 'a', assignedToUserId: 'gone', assignedTo: 'Former teammate' })],
    });
    expect(out).toContain('- Former teammate: 1 open task');
  });
});

describe('the team', () => {
  it('leads with what the person does, not their permission level', () => {
    const out = formatWorkspaceSummary({
      ...base,
      members: [member({ name: 'Ada', accountRole: 'manager', workspaceRole: 'admin' })],
    });
    expect(out).toContain('- Ada (manager)');
    expect(out).not.toContain('admin');
  });

  // Guest is the ONE permission level worth telling the model: it is read-only,
  // so proposing an edit to a guest is proposing something that will fail.
  it('flags a guest as read-only', () => {
    const out = formatWorkspaceSummary({
      ...base,
      members: [member({ name: 'Sam', workspaceRole: 'guest' })],
    });
    expect(out).toContain('read-only guest');
  });

  it('says an invited member cannot be assigned work yet', () => {
    const out = formatWorkspaceSummary({
      ...base,
      members: [member({ name: 'Pending', status: 'invited' })],
    });
    expect(out).toContain('cannot be assigned work yet');
  });

  it('marks who is being spoken to', () => {
    const out = formatWorkspaceSummary({
      ...base,
      members: [member({ name: 'Ada', isCurrentUser: true })],
    });
    expect(out).toContain('this is who you are talking to');
  });
});

describe('degrading a large catalog', () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    release({ id: `r${i}`, updatedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` })
  );

  it('keeps everything when the catalog fits', () => {
    const few = many.slice(0, 5);
    expect(selectSnapshotReleases(few, [])).toHaveLength(5);
  });

  it('drops the most dormant releases first', () => {
    const kept = selectSnapshotReleases(many, []);
    expect(kept).toHaveLength(SNAPSHOT_RELEASE_LIMIT);
    // r0..r4 are the oldest of the thirty.
    expect(kept.map((r) => r.id)).not.toContain('r0');
    expect(kept.map((r) => r.id)).toContain('r29');
  });

  // A rollout in full swing is one whose ACTIVITIES keep changing while the
  // release row itself sits still. Ranking on the release row alone would drop
  // exactly the release the user is working on today.
  it('counts activity on a release as touching it', () => {
    const kept = selectSnapshotReleases(many, [
      task({ id: 't', releaseId: 'r0', updatedAt: '2026-12-01T00:00:00Z' }),
    ]);
    expect(kept.map((r) => r.id)).toContain('r0');
  });

  it('keeps the printed order chronological rather than by recency', () => {
    const kept = selectSnapshotReleases(many, []);
    const order = kept.map((r) => r.id);
    expect(order).toEqual(many.filter((r) => order.includes(r.id)).map((r) => r.id));
  });

  it('says it is showing a subset, and how big the catalog really is', () => {
    const out = formatWorkspaceSummary({ ...base, releases: many });
    expect(out).toContain('Current rollouts (30, showing the 25 most recently worked on)');
  });

  it('does not claim a subset when it is showing everything', () => {
    const out = formatWorkspaceSummary({ ...base, releases: many.slice(0, 4) });
    expect(out).toContain('Current rollouts (4):');
    expect(out).not.toContain('most recently worked on');
  });
});

describe('smart links (#858)', () => {
  const link = {
    title: 'Release r1',
    releaseDate: '2026-09-10',
    hasCode: true,
    isTest: false,
    isArchived: false,
    link: { url: 'https://altlink.co/r1', status: 'scheduled', presaves: 2 },
    shareTask: 'open' as const,
  };

  it('lists a rollout that has a smart link, with its web address', () => {
    const text = formatWorkspaceSummary({ ...base, smartLinks: [link] });
    expect(text).toContain('Smart links');
    expect(text).toContain('https://altlink.co/r1');
  });

  it('carries no smart link section while no rollout has a code', () => {
    const text = formatWorkspaceSummary({ ...base, smartLinks: [{ ...link, hasCode: false, link: null }] });
    expect(text).not.toContain('Smart link');
  });
});
