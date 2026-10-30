import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamReadAccess } from '@/lib/release-access-server';
import { loadBriefSummary } from '@/lib/release-brief-server';
import { briefDisabled, briefFailure, missingReleaseId, notConfigured } from '../_shared';

/**
 * GET the line the plan's Brief button shows (#902): the one-line idea, else
 * the story's first sentence, and whether anything is written. One small read,
 * so the plan does not load the whole brief to draw a button.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  const disabled = briefDisabled();
  if (disabled) return disabled;

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return missingReleaseId();

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return notConfigured();

  const access = await ensureReleaseTeamReadAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const summary = await loadBriefSummary(admin, releaseId);
  if (!summary.ok) return briefFailure(summary);
  return NextResponse.json(summary.value);
}
