import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { parseDecision } from '@/lib/release-brief';
import { addBriefDecision } from '@/lib/release-brief-server';
import { badRequest, briefDisabled, briefFailure, missingReleaseId, notConfigured } from '../_shared';

/** POST a decision: one line, stamped with who and when. */
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

  const parsed = parseDecision(await request.json().catch(() => null));
  if (!parsed.ok) return badRequest(parsed.error);

  const created = await addBriefDecision(admin, { releaseId, body: parsed.value, actorId: auth.user.id });
  if (!created.ok) return briefFailure(created);
  return NextResponse.json({ decision: created.value }, { status: 201 });
}
