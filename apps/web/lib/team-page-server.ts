// The Team tab's server side (issue #853). SERVER-ONLY.
//
// One read builds the whole page: who is on the team, when each person was last
// in the app, their tasks, and (for managers) what the access pickers offer.
// Everything is read through the viewer's own limits: a member limited to one
// artist or to chosen rollouts sees teammates' tasks only on rollouts they can
// open, and never the names of rollouts kept from them.

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { loadWorkspaceAccessContext, loadWorkspaceMembers } from '@/lib/tasks-server';
import { loadTeamPresenceMembers } from '@/lib/home/team-presence-server';
import { listWorkspaceArtists } from '@/lib/artists-server';
import { TaskService } from '@/lib/services/task-service';
import { getWorkspaceTier, invalidateTeamAccess } from '@/lib/team-billing-server';
import { getEntitlement } from '@/lib/entitlements';
import { isReleaseInScope } from '@/lib/release-access';
import {
  canManageTeam,
  sortPeople,
  summarizeTasks,
  teamRoleOf,
  type TeamAccess,
  type TeamPageResponse,
  type TeamPerson,
  type TeamTaskInput,
} from '@/lib/team-page';

type ScopeRow = { id: string; artist_scope_id: string | null; release_scope_ids: string[] | null };

export type TeamPageResult =
  | { ok: true; data: TeamPageResponse }
  | { ok: false; status: number; error: string };

export async function loadTeamPage(adminClient: SupabaseClient, user: User, now: Date = new Date()): Promise<TeamPageResult> {
  const access = await loadWorkspaceAccessContext(adminClient, user);
  const workspace = access.primaryWorkspace;
  const workspaceId = access.primaryWorkspaceId;
  if (!workspace || !workspaceId) return { ok: false, status: 404, error: 'Team not found.' };

  const viewerMembership = access.memberships.find((member) => member.workspaceId === workspaceId) || null;
  const viewerRole = workspace.ownerId === user.id ? 'owner' : viewerMembership?.role || 'guest';
  const canManage = canManageTeam(viewerRole);

  const [members, scopeResult, presence, artists, tasks, tier] = await Promise.all([
    loadWorkspaceMembers(adminClient, workspaceId, user.id, { withPhotos: true }),
    adminClient.from('workspace_members').select('id,artist_scope_id,release_scope_ids').eq('workspace_id', workspaceId),
    loadTeamPresenceMembers(adminClient, user, workspaceId, now),
    listWorkspaceArtists(adminClient, workspaceId),
    new TaskService(adminClient).getTasksForUser(user.id, {
      workspaceIds: [workspaceId],
      artistScopeByWorkspaceId: access.artistScopeByWorkspaceId,
      releaseScopeByWorkspaceId: access.releaseScopeByWorkspaceId,
    }),
    getWorkspaceTier(workspaceId).catch(() => null),
  ]);

  const scopeById = new Map<string, ScopeRow>(
    ((scopeResult.data as ScopeRow[] | null) ?? []).map((row) => [String(row.id), row])
  );
  const artistName = new Map(artists.map((artist) => [artist.id, artist.name]));

  // Titles for every rollout anyone is limited to, read once. Only titles the
  // viewer may see are kept, so an access pill never names a hidden rollout.
  const limitedIds = Array.from(
    new Set(Array.from(scopeById.values()).flatMap((row) => (Array.isArray(row.release_scope_ids) ? row.release_scope_ids : [])))
  );
  const ownerReleases = await loadOwnerReleases(adminClient, workspace.ownerId, canManage ? null : limitedIds);
  const visibleTitle = new Map<string, string>();
  for (const release of ownerReleases) {
    const visible =
      workspace.ownerId === user.id ||
      isReleaseInScope({ ownerId: workspace.ownerId, artistId: release.artistId, releaseId: release.id }, access);
    if (visible) visibleTitle.set(release.id, release.title);
  }

  const lastSeen = new Map(presence.map((entry) => [entry.userId, entry.lastSeenAt]));
  const tasksByUser = new Map<string, TeamTaskInput[]>();
  for (const task of tasks) {
    if (!task.assignedToUserId) continue;
    const list = tasksByUser.get(task.assignedToUserId) ?? [];
    list.push({
      id: task.id,
      title: task.title,
      status: task.status,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      updatedAt: task.updatedAt,
      assignedToUserId: task.assignedToUserId,
      releaseId: task.releaseId,
      releaseTitle: task.release?.title ?? null,
      artistName: task.release?.artistName ?? null,
    });
    tasksByUser.set(task.assignedToUserId, list);
  }

  const people: TeamPerson[] = [];
  const seenUsers = new Set<string>();
  for (const member of members) {
    if (member.status !== 'active' && member.status !== 'invited') continue;
    if (member.userId) {
      if (seenUsers.has(member.userId)) continue;
      seenUsers.add(member.userId);
    }
    const scope = scopeById.get(member.id);
    const isOwner = member.userId === workspace.ownerId || member.role === 'owner';
    const accessOf = isOwner ? ({ kind: 'all' } as TeamAccess) : toAccess(scope, artistName, visibleTitle);
    people.push({
      memberId: member.id,
      userId: member.userId,
      name: member.name || member.email,
      email: member.email,
      initials: member.initials,
      avatarUrl: member.avatarUrl,
      role: isOwner ? 'owner' : teamRoleOf(member.role, Boolean(scope?.artist_scope_id)),
      status: member.status === 'active' ? 'active' : 'invited',
      isCurrentUser: member.isCurrentUser,
      invitedAt: member.invitedAt,
      // The viewer is in the app right now; presence excludes them.
      lastSeenAt: member.isCurrentUser ? now.toISOString() : member.userId ? lastSeen.get(member.userId) ?? null : null,
      access: accessOf,
      summary: summarizeTasks(member.userId && member.status === 'active' ? tasksByUser.get(member.userId) ?? [] : [], now),
    });
  }

  const owner = people.find((person) => person.role === 'owner');
  const seatLimit = tier ? getEntitlement(tier, 'seats') : null;

  return {
    ok: true,
    data: {
      workspace: { id: workspaceId, name: workspace.name, ownerId: workspace.ownerId, ownerName: owner?.name || 'the owner' },
      viewer: {
        userId: user.id,
        role: workspace.ownerId === user.id ? 'owner' : teamRoleOf(viewerRole, Boolean(access.artistScopeByWorkspaceId[workspaceId])),
        canManage,
        isOwner: workspace.ownerId === user.id,
      },
      seatLimit: typeof seatLimit === 'number' ? seatLimit : null,
      seatsUsed: people.length,
      people: sortPeople(people, now),
      picker: canManage
        ? {
            artists: artists.map((artist) => ({ id: artist.id, name: artist.name })),
            rollouts: ownerReleases.map((release) => ({ id: release.id, title: release.title, artistName: release.artistName })),
          }
        : null,
    },
  };
}

function toAccess(scope: ScopeRow | undefined, artistName: Map<string, string>, visibleTitle: Map<string, string>): TeamAccess {
  if (scope && Array.isArray(scope.release_scope_ids)) {
    const ids = scope.release_scope_ids.map(String);
    return {
      kind: 'rollouts',
      releaseIds: ids,
      releaseTitles: ids.map((id) => visibleTitle.get(id)).filter((title): title is string => Boolean(title)),
    };
  }
  if (scope?.artist_scope_id) {
    return { kind: 'artist', artistId: scope.artist_scope_id, artistName: artistName.get(scope.artist_scope_id) || 'One artist' };
  }
  return { kind: 'all' };
}

type OwnerRelease = { id: string; title: string; artistId: string; artistName: string };

/** The owner's live rollouts, newest release date first. `onlyIds` narrows the read. */
async function loadOwnerReleases(
  adminClient: SupabaseClient,
  ownerId: string,
  onlyIds: string[] | null
): Promise<OwnerRelease[]> {
  if (onlyIds && onlyIds.length === 0) return [];
  let query = adminClient
    .from('releases')
    .select('id,title,artist_id,artist_name,release_date')
    .eq('owner_user_id', ownerId)
    .is('deleted_at', null)
    .order('release_date', { ascending: false, nullsFirst: false })
    .limit(300);
  if (onlyIds) query = query.in('id', onlyIds);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    title: String(row.title || 'Untitled rollout'),
    artistId: String(row.artist_id || ''),
    artistName: String(row.artist_name || ''),
  }));
}

/** Release ids among `ids` that the workspace owner actually owns and has not deleted. */
export async function ownedReleaseIds(adminClient: SupabaseClient, ownerId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const releases = await loadOwnerReleases(adminClient, ownerId, ids);
  return releases.map((release) => release.id);
}

/**
 * When someone leaves or is removed, their open tasks go back to the owner so
 * nothing is left with no one (founder approved, mocks round 1). Done and
 * cancelled tasks keep their history. Returns how many moved; never throws.
 */
export async function returnOpenTasksToOwner(
  adminClient: SupabaseClient,
  input: { workspaceId: string; fromUserId: string | null; ownerUserId: string }
): Promise<number> {
  if (!input.fromUserId || input.fromUserId === input.ownerUserId) return 0;
  try {
    const ownerMember = await adminClient
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', input.workspaceId)
      .eq('user_id', input.ownerUserId)
      .maybeSingle();
    const { data, error } = await adminClient
      .from('tasks')
      .update({
        assigned_to_user_id: input.ownerUserId,
        assigned_to: (ownerMember.data as { id?: string } | null)?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', input.workspaceId)
      .eq('assigned_to_user_id', input.fromUserId)
      .not('status', 'in', '(done,cancelled)')
      .select('id');
    if (error) {
      console.warn('[team] could not return open tasks to the owner', error.message);
      return 0;
    }
    return (data ?? []).length;
  } catch (error) {
    console.warn('[team] could not return open tasks to the owner', error);
    return 0;
  }
}

/** Drop cached access answers for someone whose role or membership changed. */
export function forgetAccess(userId: string | null | undefined): void {
  if (userId) invalidateTeamAccess(userId);
}
