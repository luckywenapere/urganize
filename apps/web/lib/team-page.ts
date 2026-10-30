// The Team tab (issue #853, 2026-10-29; founder approved mocks
// docs/mocks/team-tab). Everyone on the workspace sees who is on it, when each
// person was last in the app, and the tasks each person holds. Only managers
// (workspace owner or admin) see invite, remove, role and access controls.
//
// Pure and client-safe: the server builds TeamPerson rows with these rules, the
// page renders them, and tests pin them. Now is always passed in.

import { isOnline } from '@/lib/presence';
import { lagosToday } from '@/lib/next-records';
import { sortTeamPresence } from '@/lib/home/team-presence';
import { isTaskClosed } from '@/types/tasks';

export const TEAM_HREF = '/dashboard/team';

export const TEAM_COPY = {
  title: 'Team',
  people: 'People',
  workspace: 'Settings',
  invite: 'Invite',
  inviteSomeone: 'Invite someone',
  nothingAssigned: 'Nothing assigned',
  waiting: 'Waiting to join',
} as const;

/** The roles a person can hold, in the words the app uses everywhere else. */
export type TeamRole = 'owner' | 'manager' | 'team-member' | 'artist' | 'viewer';

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  'team-member': 'Team member',
  artist: 'Artist',
  viewer: 'Viewer',
};

/** The roles a manager can pick for someone (owner is never picked). */
export const PICKABLE_ROLES: Exclude<TeamRole, 'owner'>[] = ['manager', 'team-member', 'artist', 'viewer'];

/** Workspace roles in the database, from the role a manager picks. */
export const TEAM_ROLE_TO_WORKSPACE_ROLE: Record<Exclude<TeamRole, 'owner'>, 'admin' | 'member' | 'guest'> = {
  manager: 'admin',
  'team-member': 'member',
  artist: 'member',
  viewer: 'guest',
};

/**
 * The role to show, from the database role and the artist limit. An artist is
 * a member limited to their own artist; there is no 'artist' workspace role.
 */
export function teamRoleOf(workspaceRole: string, hasArtistLimit: boolean): TeamRole {
  if (workspaceRole === 'owner') return 'owner';
  if (workspaceRole === 'admin') return 'manager';
  if (workspaceRole === 'guest') return 'viewer';
  return hasArtistLimit ? 'artist' : 'team-member';
}

/** Owners and admins manage the team. Everyone else only looks. */
export const canManageTeam = (workspaceRole: string | null | undefined): boolean =>
  workspaceRole === 'owner' || workspaceRole === 'admin';

export type TeamAccess =
  | { kind: 'all' }
  | { kind: 'artist'; artistId: string; artistName: string }
  | { kind: 'rollouts'; releaseIds: string[]; releaseTitles: string[] };

/** "2 rollouts", "Zara only", or null when there is no limit. */
export function accessPill(access: TeamAccess): string | null {
  if (access.kind === 'artist') return `${access.artistName || 'One artist'} only`;
  if (access.kind === 'rollouts') {
    const n = access.releaseIds.length;
    return n === 1 ? '1 rollout' : `${n} rollouts`;
  }
  return null;
}

/** The sentence under "Access" in a person's panel. */
export function accessSentence(access: TeamAccess): string {
  if (access.kind === 'artist') return `Only ${access.artistName || 'one artist'}'s rollouts`;
  if (access.kind === 'rollouts') {
    if (!access.releaseTitles.length) return 'No rollouts yet';
    const quoted = access.releaseTitles.map((title) => `"${title}"`);
    if (quoted.length === 1) return `Only ${quoted[0]}`;
    return `Only ${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
  }
  return 'All rollouts';
}

export type TeamTaskInput = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  assignedToUserId: string | null;
  releaseId: string | null;
  releaseTitle: string | null;
  artistName: string | null;
};

export type TeamTask = {
  id: string;
  title: string;
  dueDate: string | null;
  releaseId: string | null;
  releaseTitle: string | null;
  artistName: string | null;
  late: boolean;
};

export type TeamTaskSummary = {
  open: number;
  late: number;
  doneThisWeek: number;
  /** Open tasks, late first, then by due date, then undated. */
  tasks: TeamTask[];
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Counts for one person. "Done 7d" uses completed_at, or updated_at for rows
 * from before completed_at was stamped (most done tasks before URG-369), the
 * same fallback lib/usage-metrics.ts uses.
 */
export function summarizeTasks(tasks: readonly TeamTaskInput[], now: Date): TeamTaskSummary {
  const today = lagosToday(now);
  const weekAgo = now.getTime() - WEEK_MS;
  let doneThisWeek = 0;
  const open: TeamTask[] = [];
  for (const task of tasks) {
    if (task.status === 'done') {
      const at = Date.parse(task.completedAt || task.updatedAt || '');
      if (Number.isFinite(at) && at >= weekAgo && at <= now.getTime() + 60_000) doneThisWeek += 1;
      continue;
    }
    if (isTaskClosed(task.status)) continue;
    open.push({
      id: task.id,
      title: task.title,
      dueDate: task.dueDate,
      releaseId: task.releaseId,
      releaseTitle: task.releaseTitle,
      artistName: task.artistName,
      late: Boolean(task.dueDate && task.dueDate.slice(0, 10) < today),
    });
  }
  open.sort((a, b) => {
    if (a.late !== b.late) return a.late ? -1 : 1;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.title.localeCompare(b.title);
  });
  return { open: open.length, late: open.filter((task) => task.late).length, doneThisWeek, tasks: open };
}

/** Groups for a person's task list: Late, This week (next 7 days), Later. */
export function groupTasks(tasks: readonly TeamTask[], now: Date): { late: TeamTask[]; week: TeamTask[]; later: TeamTask[] } {
  const today = lagosToday(now);
  const weekEnd = lagosToday(new Date(now.getTime() + WEEK_MS));
  const late: TeamTask[] = [];
  const week: TeamTask[] = [];
  const later: TeamTask[] = [];
  for (const task of tasks) {
    if (task.late) late.push(task);
    else if (task.dueDate && task.dueDate.slice(0, 10) >= today && task.dueDate.slice(0, 10) <= weekEnd) week.push(task);
    else later.push(task);
  }
  return { late, week, later };
}

export type TeamPerson = {
  memberId: string;
  userId: string | null;
  name: string;
  email: string;
  initials: string;
  avatarUrl: string | null;
  role: TeamRole;
  status: 'active' | 'invited';
  isCurrentUser: boolean;
  invitedAt: string | null;
  lastSeenAt: string | null;
  access: TeamAccess;
  summary: TeamTaskSummary;
};

export type TeamWorkspace = { id: string; name: string; ownerId: string; ownerName: string };

export type TeamPicker = {
  artists: { id: string; name: string }[];
  rollouts: { id: string; title: string; artistName: string }[];
};

export type TeamPageResponse = {
  workspace: TeamWorkspace;
  viewer: { userId: string; role: TeamRole; canManage: boolean; isOwner: boolean };
  seatLimit: number | null;
  seatsUsed: number;
  people: TeamPerson[];
  /** Managers only: what the access pickers offer. Null for everyone else. */
  picker: TeamPicker | null;
};

/**
 * Online first, then most recently active, then never seen (the same order as
 * Home's "Your team" card, so the two never disagree). Invites come last, the
 * newest first.
 */
export function sortPeople(people: readonly TeamPerson[], now: Date): TeamPerson[] {
  const active = people.filter((person) => person.status === 'active');
  const invited = people
    .filter((person) => person.status === 'invited')
    .sort((a, b) => (b.invitedAt || '').localeCompare(a.invitedAt || ''));
  const order = sortTeamPresence(
    active.map((person) => ({
      userId: person.memberId,
      name: person.name,
      initials: person.initials,
      lastSeenAt: person.lastSeenAt,
    })),
    now
  ).map((entry) => entry.userId);
  const byId = new Map(active.map((person) => [person.memberId, person]));
  return [...order.map((id) => byId.get(id)!).filter(Boolean), ...invited];
}

export const onlineCount = (people: readonly TeamPerson[], now: Date): number =>
  people.filter((person) => person.status === 'active' && isOnline(person.lastSeenAt, now)).length;

/** "Northline Music · 5 of 6 seats · 2 online now" */
export function teamHeaderLine(input: {
  name: string;
  seatsUsed: number;
  seatLimit: number | null;
  online: number;
}): string {
  const parts = [input.name];
  parts.push(input.seatLimit === null ? `${input.seatsUsed} on the team` : `${input.seatsUsed} of ${input.seatLimit} seats`);
  if (input.online > 0) parts.push(`${input.online} online now`);
  return parts.join(' · ');
}

/** "Mon", "Tue" for this week; "12 Nov" beyond it. Lagos dates. */
export function dueLabel(dueDate: string | null, now: Date): string {
  if (!dueDate) return 'No date';
  const day = dueDate.slice(0, 10);
  const at = Date.parse(`${day}T12:00:00Z`);
  if (!Number.isFinite(at)) return 'No date';
  const gapDays = Math.round((at - Date.parse(`${lagosToday(now)}T12:00:00Z`)) / (24 * 60 * 60 * 1000));
  if (gapDays === 0) return 'Today';
  if (gapDays === 1) return 'Tomorrow';
  if (gapDays === -1) return 'Yesterday';
  const date = new Date(at);
  if (Math.abs(gapDays) < 7) return date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Validate the access a manager asked for. Returns null when it is not valid. */
export function readAccessRequest(
  value: unknown
): { kind: 'all' } | { kind: 'artist'; artistId: string } | { kind: 'rollouts'; releaseIds: string[] } | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as { kind?: unknown; artistId?: unknown; releaseIds?: unknown };
  if (body.kind === 'all') return { kind: 'all' };
  if (body.kind === 'artist') {
    const artistId = typeof body.artistId === 'string' ? body.artistId.trim() : '';
    return artistId && UUID.test(artistId) ? { kind: 'artist', artistId } : null;
  }
  if (body.kind === 'rollouts') {
    if (!Array.isArray(body.releaseIds)) return null;
    const ids = Array.from(
      new Set(body.releaseIds.filter((id): id is string => typeof id === 'string' && UUID.test(id.trim())).map((id) => id.trim()))
    );
    // At least one rollout: "no rollouts" is not something a manager picks.
    return ids.length ? { kind: 'rollouts', releaseIds: ids.slice(0, 200) } : null;
  }
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
