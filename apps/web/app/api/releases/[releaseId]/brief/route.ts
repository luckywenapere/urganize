import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import {
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
} from '@/lib/release-access-server';
import { parseIdea } from '@/lib/release-brief';
import { loadBriefPayload, saveBriefIdea } from '@/lib/release-brief-server';
import { badRequest, briefDisabled, briefFailure, missingReleaseId, notConfigured } from './_shared';

/**
 * A rollout's brief (URG-281).
 *
 * GET answers the whole page in one payload: the stored blocks (idea,
 * references, decisions, history, view link) plus the derived ones (dates and
 * who's on what from tasks, and the rollout's existing notes). Any member of
 * the rollout's team, guests included, may read it.
 *
 * PATCH saves the Idea (the scene autosaves it, debounced). Any member who may
 * write may edit it; a guest gets the view-only 403. Last write wins: there is
 * no co-editing in v1.
 *
 * Before the migration is applied both answer 503 and the scene shows its
 * error state.
 */

export async function GET(
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

  const access = await ensureReleaseTeamReadAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const loaded = await loadBriefPayload(admin, {
    releaseId,
    releaseOwnerId: access.release.ownerUserId,
    releaseDate: access.release.releaseDate,
    user: auth.user,
  });
  if (!loaded.ok) return briefFailure(loaded);
  return NextResponse.json({ brief: loaded.value });
}

export async function PATCH(
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

  const parsed = parseIdea(await request.json().catch(() => null));
  if (!parsed.ok) return badRequest(parsed.error);

  const saved = await saveBriefIdea(admin, { releaseId, idea: parsed.value, actorId: auth.user.id });
  if (!saved.ok) return briefFailure(saved);
  return NextResponse.json(saved.value);
}
