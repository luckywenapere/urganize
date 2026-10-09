import { NextRequest, NextResponse } from 'next/server';

import { isEditorialPitchTask } from '@/lib/editorial-pitch';
import { afterResponse } from '@/lib/after-response';
import { readTemplateOrigin, skipEditorialPitch } from '@/lib/editorial-pitch-server';
import {
  buildReadOnlyResponse,
  ensureTaskAccess,
  isReadOnlyWorkspaceMember,
  logTaskActivity,
  requireAuthenticatedAdmin,
} from '@/lib/tasks-server';

/**
 * "Release without a pitch": the team decided not to pitch Spotify editorial.
 * The task is cancelled and its metadata says it was a SKIP, so a skip can be
 * told apart from a task that was simply cancelled. There is no new status.
 *
 * Team-aware through ensureTaskAccess; a guest is read-only. Allowed at any
 * time, not only after the window closes: a team may decide early.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth && auth.error) return auth.error;
  const { adminClient } = auth;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: 'Task id is required.' }, { status: 400 });

  const access = await ensureTaskAccess(adminClient, id, auth.user);
  if ('error' in access) return access.error;
  if (isReadOnlyWorkspaceMember(access.access, access.task.workspace_id)) {
    return buildReadOnlyResponse();
  }
  if (!isEditorialPitchTask(readTemplateOrigin(access.task.metadata).taskId)) {
    return NextResponse.json({ error: 'Pitch task not found.' }, { status: 404 });
  }
  if (access.task.status === 'done') {
    return NextResponse.json({ error: 'That pitch is already done.' }, { status: 409 });
  }

  const skipped = await skipEditorialPitch(adminClient, id, auth.user.id);
  if (!skipped) return NextResponse.json({ error: 'Could not skip the pitch.' }, { status: 500 });

  afterResponse('editorial pitch skip record', () =>
    logTaskActivity(adminClient, {
      taskId: id,
      actorId: auth.user.id,
      message: 'Released without a Spotify pitch',
      metadata: { kind: 'editorial_pitch_skipped' },
    })
  );

  return NextResponse.json({ skipped: true });
}
