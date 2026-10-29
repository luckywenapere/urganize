import { NextRequest, NextResponse } from 'next/server';
import { loadWorkspaceAccessContext, requireAuthenticatedAdmin } from '@/lib/tasks-server';
import { listWorkspaceArtists } from '@/lib/artists-server';
import { forgetAccess, ownedReleaseIds } from '@/lib/team-page-server';
import { PICKABLE_ROLES, TEAM_ROLE_TO_WORKSPACE_ROLE, canManageTeam, readAccessRequest } from '@/lib/team-page';

type Body = { role?: unknown; access?: unknown };

/**
 * PATCH /api/team/members/[id] { role?, access? } (issue #853): a manager
 * changes someone's role, or what they can see (all rollouts, one artist, or
 * chosen rollouts). Never the owner's row.
 *
 * An 'artist' role needs an artist to see; one artist and chosen rollouts are
 * exclusive, so setting one clears the other.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;
  const { id } = await context.params;

  const body = (await request.json().catch(() => ({}))) as Body;
  const role = typeof body.role === 'string' && (PICKABLE_ROLES as string[]).includes(body.role)
    ? (body.role as (typeof PICKABLE_ROLES)[number])
    : null;
  const accessRequest = body.access === undefined ? undefined : readAccessRequest(body.access);
  if (body.role !== undefined && !role) return NextResponse.json({ error: 'Pick a role.' }, { status: 400 });
  if (accessRequest === null) return NextResponse.json({ error: 'Pick what they can see.' }, { status: 400 });
  if (!role && !accessRequest) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });

  const access = await loadWorkspaceAccessContext(adminClient, auth.user);
  const workspace = access.primaryWorkspace;
  const workspaceId = access.primaryWorkspaceId;
  const membership = access.memberships.find((member) => member.workspaceId === workspaceId) || null;
  if (!workspace || !workspaceId) return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
  if (workspace.ownerId !== auth.user.id && !canManageTeam(membership?.role)) {
    return NextResponse.json({ error: 'Only managers can change roles and access.' }, { status: 403 });
  }

  const target = await adminClient
    .from('workspace_members')
    .select('id,user_id,role,status,artist_scope_id')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const row = target.data as { id: string; user_id: string | null; role: string; status: string; artist_scope_id: string | null } | null;
  if (target.error) return NextResponse.json({ error: target.error.message || 'Could not load that person.' }, { status: 500 });
  if (!row || row.status === 'removed') return NextResponse.json({ error: 'That person is not on your team.' }, { status: 404 });
  if (row.role === 'owner' || row.user_id === workspace.ownerId) {
    return NextResponse.json({ error: "The owner's role and access cannot change." }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (role) update.role = TEAM_ROLE_TO_WORKSPACE_ROLE[role];

  if (accessRequest) {
    if (accessRequest.kind === 'all') {
      update.artist_scope_id = null;
      update.release_scope_ids = null;
    } else if (accessRequest.kind === 'artist') {
      const roster = await listWorkspaceArtists(adminClient, workspaceId);
      if (!roster.some((artist) => artist.id === accessRequest.artistId)) {
        return NextResponse.json({ error: 'That artist is not on your roster.' }, { status: 404 });
      }
      update.artist_scope_id = accessRequest.artistId;
      update.release_scope_ids = null;
    } else {
      const owned = await ownedReleaseIds(adminClient, workspace.ownerId, accessRequest.releaseIds);
      if (!owned.length) return NextResponse.json({ error: 'Pick at least one rollout.' }, { status: 400 });
      update.artist_scope_id = null;
      update.release_scope_ids = owned;
    }
  }

  // An artist always sees one artist. Picking the role without one is refused,
  // and limiting an artist to chosen rollouts makes them a team member.
  const endsWithArtist = accessRequest ? accessRequest.kind === 'artist' : Boolean(row.artist_scope_id);
  if (role === 'artist' && !endsWithArtist) {
    return NextResponse.json({ error: 'Pick the artist they can see.' }, { status: 400 });
  }

  const { error } = await adminClient.from('workspace_members').update(update).eq('id', id).eq('workspace_id', workspaceId);
  if (error) return NextResponse.json({ error: error.message || 'Could not save that change.' }, { status: 500 });

  forgetAccess(row.user_id);
  return NextResponse.json({ ok: true });
}
