import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/_shared/auth';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { forgetAccess, returnOpenTasksToOwner } from '@/lib/team-page-server';

/**
 * POST /api/team/leave { workspaceId } (issue #853): leave a team you joined.
 * The owner cannot leave their own workspace. Open tasks go back to the owner.
 *
 * Open route (no paywall gate): someone on a team whose plan lapsed must still
 * be able to walk away from it.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown };
  const access = await loadWorkspaceAccessContext(adminClient, auth.user);
  const workspaceId = typeof body.workspaceId === 'string' && body.workspaceId ? body.workspaceId : access.primaryWorkspaceId;
  if (!workspaceId) return NextResponse.json({ error: 'Team not found.' }, { status: 404 });

  const workspace = await adminClient.from('workspaces').select('id,owner_id').eq('id', workspaceId).maybeSingle();
  const ownerId = String((workspace.data as { owner_id?: unknown } | null)?.owner_id || '');
  if (!ownerId) return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
  if (ownerId === auth.user.id) {
    return NextResponse.json({ error: 'You own this team, so you cannot leave it.' }, { status: 400 });
  }

  const membership = access.memberships.find((member) => member.workspaceId === workspaceId && member.userId === auth.user.id);
  if (!membership) return NextResponse.json({ error: 'You are not on that team.' }, { status: 404 });

  const { error } = await adminClient
    .from('workspace_members')
    .update({ status: 'removed', updated_at: new Date().toISOString() })
    .eq('id', membership.id)
    .eq('workspace_id', workspaceId);
  if (error) return NextResponse.json({ error: error.message || 'Could not leave the team.' }, { status: 500 });

  const tasksReturned = await returnOpenTasksToOwner(adminClient, { workspaceId, fromUserId: auth.user.id, ownerUserId: ownerId });
  forgetAccess(auth.user.id);
  return NextResponse.json({ ok: true, tasksReturned });
}
