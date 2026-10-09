// Phase 1 of the shared-context build: what the assistant knows about the team
// before the user says anything (SERVER-ONLY).
//
// The snapshot used to be releases alone, so "what's overdue?" and "what is
// Tobi working on?" both needed a tool round trip before UrgAns could even
// begin. Those two facts are cheap and are wanted on nearly every request, so
// they belong in the prompt.
//
// The IO and the formatting are split on purpose: everything below
// loadSnapshotMembers is pure, so the shape of the prompt is unit-testable
// without a database — which matters, because prompt text is the kind of thing
// that silently drifts.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Release } from '@/types/releases';
import type { Task } from '@/types/tasks';
import { assistantReleaseStatus, dayToDate } from './release-status';
import type { ChappiToolContext } from './tool-families/shared';

/** How many releases survive into the prompt. Unchanged from the original
 *  snapshot — Phase 1 changes WHICH ones survive, not how many. */
export const SNAPSHOT_RELEASE_LIMIT = 25;

/** Names listed per bucket before the line switches to a count. Long member
 *  lists and long overdue lists are exactly where a snapshot stops being a
 *  summary. */
const MAX_NAMES = 8;
const MAX_OVERDUE = 8;

/** A task nobody has finished and nobody has cancelled. Matches get_dashboard's
 *  existing definition rather than inventing a second one. */
const isOpen = (task: Task): boolean => task.status !== 'done' && task.status !== 'cancelled';

export type SnapshotMember = {
  userId: string | null;
  name: string;
  /** profiles.role — what the person DOES. This is the one the model needs:
   *  knowing it is talking to an A&R rather than an admin changes the answer,
   *  where a permission level does not. */
  accountRole: string | null;
  /** workspace_members.role — permissions. Surfaced ONLY for 'guest', which is
   *  read-only (founder decision, 2026-07-23), because that is the one value
   *  that changes what UrgAns should propose. */
  workspaceRole: string;
  status: string;
  isCurrentUser: boolean;
};

type MemberRow = {
  user_id: string | null;
  email: string | null;
  role: string;
  status: string;
};

type ProfileRow = { id: string; name: string | null; email: string | null; role: string | null };

/**
 * The people on the caller's team(s).
 *
 * A dedicated read rather than `loadWorkspaceMembers`, for one reason: that
 * helper's profile lookup selects `id,name,email` and does not carry
 * `profiles.role`, which is the field Phase 1 exists to surface. Widening a
 * function used by the member list and assignee resolution to serve the prompt
 * would be the unrelated refactor the spec's working rules forbid.
 *
 * Never throws: a snapshot that loses its member list is worth strictly more
 * than no snapshot at all, and the caller already treats this section as
 * optional.
 */
export async function loadSnapshotMembers(
  adminClient: SupabaseClient,
  workspaceIds: string[],
  currentUserId: string
): Promise<SnapshotMember[]> {
  if (!workspaceIds.length) return [];
  try {
    const { data, error } = await adminClient
      .from('workspace_members')
      .select('user_id,email,role,status')
      .in('workspace_id', workspaceIds)
      .neq('status', 'removed');
    if (error) throw error;

    const rows = (Array.isArray(data) ? data : []) as MemberRow[];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];

    let profiles = new Map<string, ProfileRow>();
    if (userIds.length) {
      const result = await adminClient
        .from('profiles')
        .select('id,name,email,role')
        .in('id', userIds);
      if (!result.error && Array.isArray(result.data)) {
        profiles = new Map((result.data as ProfileRow[]).map((p) => [p.id, p]));
      }
    }

    // A person can hold a membership in more than one of the caller's
    // workspaces; they are one teammate, not two.
    const seen = new Set<string>();
    const members: SnapshotMember[] = [];
    for (const row of rows) {
      const profile = row.user_id ? profiles.get(row.user_id) || null : null;
      const name = profile?.name?.trim() || row.email?.trim() || 'Invited member';
      const key = row.user_id || `email:${row.email || name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      members.push({
        userId: row.user_id,
        name,
        accountRole: profile?.role?.trim() || null,
        workspaceRole: row.role,
        status: row.status,
        isCurrentUser: Boolean(row.user_id) && row.user_id === currentUserId,
      });
    }
    return members;
  } catch (error) {
    console.error('[chappi] snapshot members failed:', error);
    return [];
  }
}

/**
 * Which releases survive into the prompt, and in what order.
 *
 * Two separate decisions, deliberately:
 *   - SELECTION is by recency and activity, so a dormant release drops out
 *     before a live one does. A release's own `updatedAt` understates this —
 *     a rollout in full swing is one whose ACTIVITIES keep changing while the
 *     release row sits still — so the rank is the later of the two.
 *   - ORDER stays chronological. Ranking the printed list by recency would
 *     make "what is coming up" harder for the model to read off, and the
 *     ordering is not what the cap is for.
 *
 * Undated releases sort last, matching the query this replaces.
 */
export function selectSnapshotReleases(
  releases: Release[],
  tasks: Task[],
  limit: number = SNAPSHOT_RELEASE_LIMIT
): Release[] {
  if (releases.length <= limit) return releases;

  const latestTaskTouch = new Map<string, string>();
  for (const task of tasks) {
    if (!task.releaseId || !task.updatedAt) continue;
    const current = latestTaskTouch.get(task.releaseId);
    if (!current || task.updatedAt > current) latestTaskTouch.set(task.releaseId, task.updatedAt);
  }

  const touchedAt = (release: Release): string => {
    const own = release.updatedAt || '';
    const viaTasks = latestTaskTouch.get(release.id) || '';
    return own > viaTasks ? own : viaTasks;
  };

  const kept = new Set(
    [...releases]
      .sort((a, b) => touchedAt(b).localeCompare(touchedAt(a)))
      .slice(0, limit)
      .map((r) => r.id)
  );
  return releases.filter((r) => kept.has(r.id));
}

/** "3 people" / "1 person" — a naive `+ 's'` reads as unfinished. */
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * The whole workspace section of the system prompt.
 *
 * Pure. `today` is passed rather than read from the clock so overdue maths is
 * testable, and every section is omitted entirely when it has nothing to say —
 * a header over an empty list teaches the model to invent something to put
 * under it.
 */
export function formatWorkspaceSummary(input: {
  releases: Release[];
  tasks: Task[];
  members: SnapshotMember[];
  today: string;
}): string {
  const { tasks, members, today } = input;
  if (input.releases.length === 0) return 'The user has no rollouts yet.';

  const shown = selectSnapshotReleases(input.releases, tasks);
  const sections: string[] = [];

  const heading =
    shown.length < input.releases.length
      ? `Current rollouts (${input.releases.length}, showing the ${shown.length} most recently worked on):`
      : `Current rollouts (${input.releases.length}):`;

  sections.push(
    `${heading}\n${shown
      .map((r) => {
        const forRelease = tasks.filter((t) => t.releaseId === r.id);
        const done = forRelease.filter((t) => t.status === 'done').length;
        return `- ${r.title} (id: ${r.id}, status: ${assistantReleaseStatus(r, { done, total: forRelease.length }, dayToDate(today))}, ${done}/${forRelease.length} tasks done, date: ${r.releaseDate ?? 'unset'})`;
      })
      .join('\n')}`
  );

  // ── Overdue ───────────────────────────────────────────────────────────────
  const titleById = new Map(input.releases.map((r) => [r.id, r.title]));
  const nameByUserId = new Map(
    members.filter((m) => m.userId).map((m) => [m.userId as string, m.name])
  );
  const overdue = tasks
    .filter((t) => isOpen(t) && t.dueDate && t.dueDate < today)
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

  if (overdue.length) {
    const lines = overdue.slice(0, MAX_OVERDUE).map((t) => {
      const who = t.assignedToUserId ? nameByUserId.get(t.assignedToUserId) : null;
      const release = t.releaseId ? titleById.get(t.releaseId) : null;
      const parts = [`due ${t.dueDate}`];
      if (release) parts.push(release);
      parts.push(who || t.assignedTo || 'unassigned');
      return `- ${t.title} (${parts.join(', ')})`;
    });
    const more =
      overdue.length > MAX_OVERDUE ? `\n- ...and ${overdue.length - MAX_OVERDUE} more` : '';
    sections.push(`Overdue (${overdue.length}):\n${lines.join('\n')}${more}`);
  }

  // ── Open work per person ──────────────────────────────────────────────────
  const openTasks = tasks.filter(isOpen);
  const counts = new Map<string, number>();
  let unassigned = 0;
  for (const task of openTasks) {
    const who = task.assignedToUserId
      ? nameByUserId.get(task.assignedToUserId) || task.assignedTo
      : task.assignedTo;
    if (!who) {
      unassigned += 1;
      continue;
    }
    counts.set(who, (counts.get(who) || 0) + 1);
  }
  if (counts.size || unassigned) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const lines = ranked.map(([name, n]) => `- ${name}: ${plural(n, 'open task', 'open tasks')}`);
    if (unassigned) lines.push(`- Unassigned: ${plural(unassigned, 'open task', 'open tasks')}`);
    sections.push(`Open work by person:\n${lines.join('\n')}`);
  }

  // ── The team ──────────────────────────────────────────────────────────────
  if (members.length) {
    const lines = members.slice(0, MAX_NAMES).map((m) => {
      const notes: string[] = [];
      if (m.accountRole) notes.push(m.accountRole);
      // Permission level is noise EXCEPT for guest, which is read-only — so
      // proposing an edit to one would be proposing something that fails.
      if (m.workspaceRole === 'guest') notes.push('read-only guest');
      if (m.status !== 'active') notes.push(`${m.status}, cannot be assigned work yet`);
      if (m.isCurrentUser) notes.push('this is who you are talking to');
      return `- ${m.name}${notes.length ? ` (${notes.join('; ')})` : ''}`;
    });
    const more =
      members.length > MAX_NAMES ? `\n- ...and ${members.length - MAX_NAMES} more` : '';
    sections.push(`The team (${members.length}):\n${lines.join('\n')}${more}`);
  }

  return sections.join('\n\n');
}

/** Convenience for the prompt builder: load the people, then format. */
export async function buildWorkspaceSummary(
  ctx: ChappiToolContext,
  releases: Release[],
  tasks: Task[],
  today: string
): Promise<string> {
  const members = await loadSnapshotMembers(ctx.adminClient, ctx.workspaceIds, ctx.user.id);
  return formatWorkspaceSummary({ releases, tasks, members, today });
}
