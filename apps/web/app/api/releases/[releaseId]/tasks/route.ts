import { NextRequest, NextResponse } from 'next/server';
import {
  buildTaskSchemaResponse,
  getAuthenticatedAdmin,
  isTaskSchemaMissingError,
  loadReleaseTaskBoard,
} from '@/lib/tasks-server';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;

  const { releaseId } = await context.params;

  try {
    const payload = await loadReleaseTaskBoard(adminClient, releaseId, auth.user);
    return NextResponse.json(payload);
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load release tasks.' },
      { status: 500 }
    );
  }
}
