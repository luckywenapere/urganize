import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { parsePaybackAnswer } from '@/lib/release-spend';
import { canViewReleaseSpend, savePaybackAnswer } from '@/lib/release-spend-server';
import { couldNotCheckSpend, missingReleaseId, noSpendAccess, notConfigured } from '../_shared';

/**
 * The answer to "what did this rollout pay back?". Saving again replaces the
 * answer, and it can be saved before the question was ever sent: the row is
 * created then, so the question is never sent to somebody who has answered.
 * Same visibility rule as the lines themselves.
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return missingReleaseId();

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return notConfigured();

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const allowed = await canViewReleaseSpend(admin, releaseId, auth.user.id);
  if (allowed === null) return couldNotCheckSpend();
  if (!allowed) return noSpendAccess();

  const body = await request.json().catch(() => null);
  const parsed = parsePaybackAnswer(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const saved = await savePaybackAnswer(admin, {
    releaseId,
    userId: auth.user.id,
    answer: parsed.value,
  });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });

  return NextResponse.json({ payback: saved.value });
}
