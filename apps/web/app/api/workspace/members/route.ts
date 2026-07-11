import { NextRequest, NextResponse } from 'next/server';
import {
  buildTaskSchemaResponse,
  buildWorkspaceMembersResponse,
  requireAuthenticatedAdmin,
  isTaskSchemaMissingError,
  loadWorkspaceAccessContext,
  loadWorkspaceMembers,
} from '@/lib/tasks-server';

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
    return NextResponse.json(buildWorkspaceMembersResponse(access.primaryWorkspace, members));
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
