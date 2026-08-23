import { NextRequest, NextResponse } from 'next/server';
import {
  buildTaskSchemaResponse,
  buildWorkspaceMembersResponse,
  requireAuthenticatedAdmin,
  isTaskSchemaMissingError,
  loadWorkspaceAccessContext,
  loadWorkspaceMembers,
} from '@/lib/tasks-server';
import { getWorkspaceTier } from '@/lib/team-billing-server';
import { getEntitlement } from '@/lib/entitlements';

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.primaryWorkspaceId || !access.primaryWorkspace) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    }

    const members = await loadWorkspaceMembers(adminClient, access.primaryWorkspaceId, auth.user.id);

    // Seat ceiling, so Settings can say "3 of 4" rather than letting the
    // manager discover the limit by being refused. Resolved here rather than
    // inside buildWorkspaceMembersResponse, which is a pure shaper. null means
    // no ceiling (every tier but Manager) or that the tier could not be read —
    // the client renders no badge either way, which is the honest fallback.
    const tier = await getWorkspaceTier(access.primaryWorkspaceId);
    const seatLimit = tier ? getEntitlement(tier, 'seats') : null;

    return NextResponse.json({
      ...buildWorkspaceMembersResponse(access.primaryWorkspace, members),
      seatLimit,
    });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load workspace members.' },
      { status: 500 }
    );
  }
}
