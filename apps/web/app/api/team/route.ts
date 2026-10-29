import { NextRequest, NextResponse } from 'next/server';
import { loadWorkspaceAccessContext, requireAuthenticatedAdmin } from '@/lib/tasks-server';
import { loadTeamPage } from '@/lib/team-page-server';
import { canManageTeam } from '@/lib/team-page';

const MAX_NAME = 80;

/** GET /api/team: the whole Team tab for the caller's team (issue #853). Any member may read it. */
export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  try {
    const result = await loadTeamPage(auth.adminClient, auth.user);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load your team.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/team { name }: rename the workspace. Owners and admins (the people
 * the Team tab calls managers); the older PATCH /api/workspace stays owner-only
 * and flag-gated for the identity panel.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
  if (!name) return NextResponse.json({ error: 'Give your team a name.' }, { status: 400 });
  if (name.length > MAX_NAME) {
    return NextResponse.json({ error: `Keep the name under ${MAX_NAME} characters.` }, { status: 400 });
  }

  const access = await loadWorkspaceAccessContext(adminClient, auth.user);
  const workspaceId = access.primaryWorkspaceId;
  const membership = access.memberships.find((member) => member.workspaceId === workspaceId) || null;
  const isOwner = access.primaryWorkspace?.ownerId === auth.user.id;
  if (!workspaceId) return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
  if (!isOwner && !canManageTeam(membership?.role)) {
    return NextResponse.json({ error: 'Only managers can rename the team.' }, { status: 403 });
  }

  const { error } = await adminClient
    .from('workspaces')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', workspaceId);
  if (error) return NextResponse.json({ error: error.message || 'Could not rename the team.' }, { status: 500 });
  return NextResponse.json({ ok: true, name });
}
