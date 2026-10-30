import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { parseNoteText } from '@/lib/brief-media';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { deleteBriefSticky, setBriefStickyText } from '@/lib/release-brief-server';
import { badRequest, briefDisabled, briefFailure, missingReleaseId, notConfigured } from '../../_shared';

// A sticky note (#897 phase 2): whoever wrote it, or the rollout's owner or a
// team admin, may change or remove it.

type Context = { params: Promise<{ releaseId: string; noteId: string }> };

async function ready(request: NextRequest, context: Context) {
  const disabled = briefDisabled();
  if (disabled) return { error: disabled };

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return { error: auth.error };

  const { releaseId, noteId } = await context.params;
  if (!releaseId) return { error: missingReleaseId() };

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return { error: notConfigured() };

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return { error: access.error };

  return { admin, releaseId, noteId, user: auth.user, releaseOwnerId: access.release.ownerUserId };
}

/** PATCH { text } rewrites the note. */
export async function PATCH(request: NextRequest, context: Context) {
  const ok = await ready(request, context);
  if ('error' in ok) return ok.error;

  const parsed = parseNoteText(await request.json().catch(() => null));
  if (!parsed.ok) return badRequest(parsed.error);

  const saved = await setBriefStickyText(ok.admin, { ...ok, text: parsed.value });
  if (!saved.ok) return briefFailure(saved);
  return NextResponse.json(saved.value);
}

export async function DELETE(request: NextRequest, context: Context) {
  const ok = await ready(request, context);
  if ('error' in ok) return ok.error;

  const deleted = await deleteBriefSticky(ok.admin, ok);
  if (!deleted.ok) return briefFailure(deleted);
  return NextResponse.json(deleted.value);
}
