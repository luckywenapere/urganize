// Insight tools (SERVER-ONLY, 2026-09-03) — reasoning aids over data the
// product already has, closing the two genuine tool-shaped gaps found when
// auditing UrgAns against a real-world prompt list: "compare my last few
// releases" and "who should be responsible for each part" both need a
// cross-entity view no existing tool produces, even though every fact behind
// them is already visible one release or one teammate at a time.
//
// Both are `kind: 'read'` and carry no `confirm` builder on purpose — neither
// changes anything, and a read stays reachable to a team in read-only mode
// after a payment failure (resolveMcpToolAccessMethod maps a read to GET).
//
// The scoring is pure and lives here, exported, so it is proven by
// insights.test.ts against hand-built fixtures rather than by exercising the
// tool through a live database — see CLAUDE.md's "How new logic gets tested
// here" for why that split is the house pattern.

import { TaskService } from '@/lib/services/task-service';
import { listVisibleReleases } from '../release-scope';
import { apiError, callInternalApi, fail, type ChappiTool } from './shared';

const DEFAULT_COMPARE_LIMIT = 5;

// ── compare_releases ─────────────────────────────────────────────────────

export type ReleaseComparisonInput = {
  id: string;
  title: string;
  status: string;
  releaseDate: string | null;
  tasksDone: number;
  tasksTotal: number;
};

export type ReleaseComparisonRow = ReleaseComparisonInput & {
  /** Positive = still ahead, negative = already out, null = no date set. */
  daysFromToday: number | null;
  /** 0-100, rounded. 0 when there are no tasks — never a division by zero. */
  progressPercent: number;
};

/** Later release date first; a release with no date at all sorts last, never
 * dropped. Exported so a caller can pre-sort/limit before the (potentially
 * per-release) task fetch, rather than fetching tasks for every release just
 * to throw most of them away. */
export function compareByRecency(
  a: { releaseDate: string | null },
  b: { releaseDate: string | null }
): number {
  if (a.releaseDate === b.releaseDate) return 0;
  if (a.releaseDate === null) return 1;
  if (b.releaseDate === null) return -1;
  return a.releaseDate < b.releaseDate ? 1 : -1;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.UTC(
    Number(fromIso.slice(0, 4)),
    Number(fromIso.slice(5, 7)) - 1,
    Number(fromIso.slice(8, 10))
  );
  const to = Date.UTC(Number(toIso.slice(0, 4)), Number(toIso.slice(5, 7)) - 1, Number(toIso.slice(8, 10)));
  return Math.round((to - from) / 86_400_000);
}

export function compareReleases(
  releases: ReleaseComparisonInput[],
  todayIso: string,
  limit = DEFAULT_COMPARE_LIMIT
): ReleaseComparisonRow[] {
  return [...releases]
    .sort(compareByRecency)
    .slice(0, Math.max(0, limit))
    .map((release) => ({
      ...release,
      daysFromToday: release.releaseDate ? daysBetween(todayIso, release.releaseDate) : null,
      progressPercent: release.tasksTotal > 0 ? Math.round((release.tasksDone / release.tasksTotal) * 100) : 0,
    }));
}

// ── get_team_workload ────────────────────────────────────────────────────

export type WorkloadMember = { userId: string; name: string };
export type WorkloadTaskInput = { assignedToUserId: string | null; status: string; dueDate: string | null };

export type TeamWorkloadRow = { userId: string; name: string; openTasks: number; overdueTasks: number };

export type TeamWorkloadResult = {
  members: TeamWorkloadRow[];
  /** Open work with nobody assigned — this is who "should be responsible"
   * is actually asking about, so it is surfaced rather than silently folded
   * into a member's count or dropped. */
  unassignedOpenTasks: number;
};

function isOpen(status: string): boolean {
  return status !== 'done' && status !== 'cancelled';
}

export function computeTeamWorkload(
  members: WorkloadMember[],
  tasks: WorkloadTaskInput[],
  todayIso: string
): TeamWorkloadResult {
  const memberIds = new Set(members.map((m) => m.userId));
  const rows = new Map<string, TeamWorkloadRow>(
    members.map((m) => [m.userId, { userId: m.userId, name: m.name, openTasks: 0, overdueTasks: 0 }])
  );
  let unassignedOpenTasks = 0;

  for (const task of tasks) {
    if (!isOpen(task.status)) continue;
    const assigneeId = task.assignedToUserId;
    if (!assigneeId) {
      unassignedOpenTasks += 1;
      continue;
    }
    // A task assigned to someone outside `members` (left the team, or a scope
    // mismatch) is neither a member's load nor unassigned work anyone here
    // can pick up — counting it either way would misreport whose it is.
    if (!memberIds.has(assigneeId)) continue;
    const row = rows.get(assigneeId);
    if (!row) continue;
    row.openTasks += 1;
    if (task.dueDate && task.dueDate < todayIso) row.overdueTasks += 1;
  }

  return {
    members: [...rows.values()].sort((a, b) => b.openTasks - a.openTasks),
    unassignedOpenTasks,
  };
}

// ── tool registrations ───────────────────────────────────────────────────

export const INSIGHTS_TOOLS: ChappiTool[] = [
  {
    name: 'compare_releases',
    kind: 'read',
    description:
      "Compare the user's most recent releases side by side: date, status, task completion, and how far off (or how long ago) each one is. Use this for questions about trends, what worked before, or what to change based on past releases.",
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'How many releases, most recent first. Defaults to 5.' },
      },
    },
    execute: async (ctx, args) => {
      const rawLimit = args.limit;
      const limit =
        typeof rawLimit === 'number' && Number.isFinite(rawLimit) && rawLimit > 0
          ? Math.floor(rawLimit)
          : DEFAULT_COMPARE_LIMIT;

      const releases = await listVisibleReleases(ctx);
      // Sort/limit BEFORE fetching tasks so a large catalogue does not pay for
      // a task query per release it is about to discard.
      const recent = [...releases].sort(compareByRecency).slice(0, limit);
      const taskService = new TaskService(ctx.adminClient);
      const rows = await Promise.all(
        recent.map(async (release) => {
          const tasks = await taskService.getTasksForUser(ctx.user.id, ctx.workspaceIds, {
            releaseId: release.id,
          });
          return {
            id: release.id,
            title: release.title,
            status: release.status,
            releaseDate: release.releaseDate,
            tasksDone: tasks.filter((t) => t.status === 'done').length,
            tasksTotal: tasks.length,
          };
        })
      );

      const today = new Date().toISOString().slice(0, 10);
      const compared = compareReleases(rows, today, limit);
      return {
        ok: true,
        summary: compared.length ? `Compared ${compared.length} release(s).` : 'No releases to compare yet.',
        data: compared,
      };
    },
  },
  {
    name: 'get_team_workload',
    kind: 'read',
    description:
      "See how open work is spread across the team right now: each teammate's open and overdue task count, plus how much is unassigned. Use this before suggesting who should take on a piece of work, or to explain why a release is stalled.",
    inputSchema: { type: 'object', properties: {} },
    execute: async (ctx) => {
      const membersRes = await callInternalApi(ctx, '/api/workspace/members', { method: 'GET' });
      if (!membersRes.ok) return fail(apiError(membersRes, 'Could not load your teammates.'));
      const members = (Array.isArray(membersRes.body.members)
        ? (membersRes.body.members as Record<string, unknown>[])
        : []
      )
        .map((m) => ({
          userId: (m.userId ?? null) as string | null,
          name: String(m.name ?? m.email ?? 'Teammate'),
        }))
        .filter((m): m is WorkloadMember => Boolean(m.userId));

      const tasks = ctx.workspaceIds.length
        ? await new TaskService(ctx.adminClient).getTasksForUser(ctx.user.id, ctx.workspaceIds)
        : [];
      const today = new Date().toISOString().slice(0, 10);
      const result = computeTeamWorkload(
        members,
        tasks.map((t) => ({ assignedToUserId: t.assignedToUserId, status: t.status, dueDate: t.dueDate })),
        today
      );

      const parts = [`${result.members.length} teammate(s) with visible work.`];
      if (result.unassignedOpenTasks > 0) parts.push(`${result.unassignedOpenTasks} task(s) unassigned.`);
      return { ok: true, summary: parts.join(' '), data: result };
    },
  },
];
