// Who should a draft plan's task go to, before anyone has said? A per-task
// guess seeded from what the TEAM has actually done on past releases, used to
// give a one-tap "Draft the plan" a sensible starting assignee instead of
// leaving every task on the release owner (buildDraftFromTemplate's own
// unconditional default) or waiting on a model call that may not be
// configured.
//
// Pure module — lib/task-owners-server.ts loads the history this ranks.
//
// RANKING, PER TASK, IN THIS ORDER:
//   1. Whoever most often took THIS EXACT template step on a past release.
//   2. Whoever most often takes this step's ROLE archetype on past releases.
//   3. The release creator — "nobody on the team has done this before, so it
//      stays with you" is a true, honest default rather than an invented
//      preference, and it is exactly buildDraftFromTemplate's existing
//      behaviour, so nothing regresses when history is empty.
//
// A history candidate has to still be ASSIGNABLE today (active, has a real
// user id, not a guest) or the proposal falls through to the next-ranked
// candidate at the SAME rung before dropping to the next rung — a name pulled
// from history that no longer holds a seat is worse than no name at all, but
// it should not throw away a more specific match just because the top pick
// left the team.

export type PastAssignment = {
  /** Null entries are filtered out by the caller before this ever sees them;
   *  kept nullable here so the server loader's raw row shape can be passed
   *  through without a cast. */
  templateTaskId: string | null;
  role: string | null;
  assignedToUserId: string;
};

export type AssignableMember = {
  userId: string;
  /** Membership status, e.g. 'active' | 'invited' | 'removed'. Anything other
   *  than 'active' is excluded — fail-closed on an unrecognised value rather
   *  than an explicit blocklist that a new status could slip past. */
  status: string | null;
  /** Membership role, e.g. 'owner' | 'admin' | 'member' | 'guest'. */
  role: string | null;
};

export type TaskToAssign = {
  id: string;
  templateTaskId: string | null;
  role: string | null;
};

export type OwnerProposalBasis = 'history' | 'role' | 'creator';

export type ProposedOwner = {
  taskId: string;
  userId: string;
  basis: OwnerProposalBasis;
  reason: string;
};

/** Is this member someone a task can actually be handed to right now? The
 *  release owner is always assignable regardless of their own membership row
 *  (some accounts have none at all) — every other candidate needs an active,
 *  non-guest seat. */
export function isAssignableMember(member: AssignableMember, ownerUserId: string): boolean {
  if (!member.userId) return false;
  if (member.userId === ownerUserId) return true;
  const status = (member.status ?? '').trim().toLowerCase();
  if (status !== 'active') return false;
  const role = (member.role ?? '').trim().toLowerCase();
  if (role === 'guest') return false;
  return true;
}

const pluralize = (count: number, singular: string, plural: string): string =>
  count === 1 ? singular : plural;

/** Rank candidates by frequency (most first), ties broken by recency.
 *  `entries` is assumed NEWEST FIRST (lib/task-owners-server.ts orders its
 *  query that way) — a tie is broken toward whichever candidate's first
 *  appearance in the list comes earliest, i.e. whose most recent assignment
 *  is the most recent of the two. */
function rankCandidates(entries: PastAssignment[]): string[] {
  const counts = new Map<string, number>();
  const firstSeenIndex = new Map<string, number>();

  entries.forEach((entry, index) => {
    counts.set(entry.assignedToUserId, (counts.get(entry.assignedToUserId) ?? 0) + 1);
    if (!firstSeenIndex.has(entry.assignedToUserId)) {
      firstSeenIndex.set(entry.assignedToUserId, index);
    }
  });

  return [...counts.entries()]
    .sort((a, b) => {
      const countDiff = b[1] - a[1];
      if (countDiff !== 0) return countDiff;
      return (firstSeenIndex.get(a[0]) ?? 0) - (firstSeenIndex.get(b[0]) ?? 0);
    })
    .map(([userId]) => userId);
}

/** Propose an owner for every task, in the order described at the top of this
 *  file. Total over `tasks`: every task gets a proposal, even when it can only
 *  ever be the creator fallback. */
export function proposeTaskOwners(input: {
  tasks: TaskToAssign[];
  history: PastAssignment[];
  members: AssignableMember[];
  creatorUserId: string;
  /** Display names for the reason strings. A missing entry falls back to a
   *  neutral phrase rather than printing a bare user id. */
  memberNames: Record<string, string>;
}): ProposedOwner[] {
  const { tasks, history, members, creatorUserId, memberNames } = input;

  const nameFor = (userId: string): string => memberNames[userId]?.trim() || 'Someone on the team';

  const byTemplateTaskId = new Map<string, PastAssignment[]>();
  const byRole = new Map<string, PastAssignment[]>();
  for (const entry of history) {
    if (entry.templateTaskId) {
      const list = byTemplateTaskId.get(entry.templateTaskId);
      if (list) list.push(entry);
      else byTemplateTaskId.set(entry.templateTaskId, [entry]);
    }
    if (entry.role) {
      const list = byRole.get(entry.role);
      if (list) list.push(entry);
      else byRole.set(entry.role, [entry]);
    }
  }

  const pickAssignable = (candidates: string[]): string | null => {
    for (const userId of candidates) {
      const member = members.find((m) => m.userId === userId);
      if (member && isAssignableMember(member, creatorUserId)) return userId;
    }
    return null;
  };

  return tasks.map((task): ProposedOwner => {
    if (task.templateTaskId) {
      const entries = byTemplateTaskId.get(task.templateTaskId) ?? [];
      const candidate = pickAssignable(rankCandidates(entries));
      if (candidate) {
        const count = entries.filter((entry) => entry.assignedToUserId === candidate).length;
        return {
          taskId: task.id,
          userId: candidate,
          basis: 'history',
          reason: `${nameFor(candidate)} handled this on ${count} past ${pluralize(count, 'rollout', 'rollouts')}.`,
        };
      }
    }

    if (task.role) {
      const entries = byRole.get(task.role) ?? [];
      const candidate = pickAssignable(rankCandidates(entries));
      if (candidate) {
        return {
          taskId: task.id,
          userId: candidate,
          basis: 'role',
          reason: `${nameFor(candidate)} usually takes ${task.role} work on your rollouts.`,
        };
      }
    }

    return {
      taskId: task.id,
      userId: creatorUserId,
      basis: 'creator',
      reason: 'Nobody on the team has done this before, so it stays with you.',
    };
  });
}
