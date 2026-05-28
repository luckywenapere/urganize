import { NextRequest, NextResponse } from 'next/server';
import {
  buildTaskSchemaResponse,
  buildWorkspaceMembersResponse,
  createAdminClient,
  requireActiveAuthenticatedUser,
  isTaskSchemaMissingError,
  loadWorkspaceAccessContext,
  loadWorkspaceMembers,
} from '@/lib/tasks-server';

export async function GET(request: NextRequest) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

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
