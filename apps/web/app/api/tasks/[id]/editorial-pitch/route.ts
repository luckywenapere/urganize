import { NextRequest, NextResponse } from 'next/server';

import { allPitchFieldsFilled, isEditorialPitchTask, validatePitchFieldsInput } from '@/lib/editorial-pitch';
import {
  loadPitchBlocker,
  readPitchTaskMeta,
  readTemplateOrigin,
  savePitchFields,
} from '@/lib/editorial-pitch-server';
import {
  buildReadOnlyResponse,
  ensureTaskAccess,
  isReadOnlyWorkspaceMember,
  requireAuthenticatedAdmin,
} from '@/lib/tasks-server';
import { canRunEmbeddedAction } from '@/lib/urgans-actions/server';

/**
 * The Spotify editorial pitch's four fields, saved on the task so a manager can
 * come back to them.
 *
 * GET returns what the pitch panel needs in one read: the fields, whether the
 * distribution order is still in the way, whether this caller may use "Draft my
 * pitch" (a plan question the server answers, because no client knows the
 * owner's tier), and whether it was skipped.
 * PUT saves what a person typed. The task PATCH cannot write metadata, so this
 * is its own route.
 *
 * Team-aware through ensureTaskAccess; a guest is read-only. Not behind a
 * feature flag: the pitch step is part of the plan.
 */

const DRAFT_ACTION = 'release.draft_spotify_pitch';

const notAPitch = () => NextResponse.json({ error: 'Pitch task not found.' }, { status: 404 });

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth && auth.error) return auth.error;
  const { adminClient } = auth;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: 'Task id is required.' }, { status: 400 });

  const access = await ensureTaskAccess(adminClient, id, auth.user);
  if ('error' in access) return access.error;
  const { task } = access;
  if (!isEditorialPitchTask(readTemplateOrigin(task.metadata).taskId)) return notAPitch();

  const meta = readPitchTaskMeta(task.metadata);
  const blocked = await loadPitchBlocker(adminClient, task);
  // The draft button only makes sense while there is something to fill.
  const canDraft =
    Boolean(task.release_id) &&
    !allPitchFieldsFilled(meta.fields) &&
    (await canRunEmbeddedAction(adminClient, DRAFT_ACTION, String(task.release_id), auth.user));

  return NextResponse.json({
    pitch: {
      taskId: id,
      fields: meta.fields,
      skippedAt: meta.skippedAt,
      blocked,
      canDraft,
    },
  });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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
  if (!isEditorialPitchTask(readTemplateOrigin(access.task.metadata).taskId)) return notAPitch();

  const body = (await request.json().catch(() => null)) as { fields?: unknown } | null;
  const parsed = validatePitchFieldsInput(body?.fields);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const saved = await savePitchFields(adminClient, id, parsed.fields);
  if (!saved) return NextResponse.json({ error: 'Could not save the pitch.' }, { status: 500 });
  return NextResponse.json({ fields: parsed.fields });
}
