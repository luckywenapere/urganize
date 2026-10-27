import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { briefLockedFailure } from '@/lib/idea-round-server';
import { parseReference } from '@/lib/release-brief';
import { addBriefReference } from '@/lib/release-brief-server';
import { badRequest, briefDisabled, briefFailure, missingReleaseId, notConfigured } from '../_shared';

/** POST a reference: a link, with an optional one-line caption. A link straight
 *  to an image file is stored as an image and shows as a thumbnail. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
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

  // An approved brief is locked until someone makes a new version (2026-10-27).
  const locked = await briefLockedFailure(admin, releaseId);
  if (locked) return briefFailure(locked);

  const parsed = parseReference(await request.json().catch(() => null));
  if (!parsed.ok) return badRequest(parsed.error);

  const created = await addBriefReference(admin, { releaseId, draft: parsed.value, actorId: auth.user.id });
  if (!created.ok) return briefFailure(created);
  return NextResponse.json({ reference: created.value }, { status: 201 });
}
