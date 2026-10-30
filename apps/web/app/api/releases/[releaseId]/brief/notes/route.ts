import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { parseNoteText } from '@/lib/brief-media';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { addBriefSticky } from '@/lib/release-brief-server';
import { badRequest, briefDisabled, briefFailure, missingReleaseId, notConfigured } from '../_shared';

/**
 * POST { text } adds a sticky note to the brief board (#897 phase 2). Anyone on
 * the team who can edit. Notes are not locked by approving the brief: the
 * team keeps talking on the board after the brief is settled.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  const disabled = briefDisabled();
  if (disabled) return disabled;

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return missingReleaseId();

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return notConfigured();

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const parsed = parseNoteText(await request.json().catch(() => null));
  if (!parsed.ok) return badRequest(parsed.error);

  const created = await addBriefSticky(admin, { releaseId, text: parsed.value, actorId: auth.user.id });
  if (!created.ok) return briefFailure(created);
  return NextResponse.json({ sticky: created.value }, { status: 201 });
}
