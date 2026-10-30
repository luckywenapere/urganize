import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import {
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
} from '@/lib/release-access-server';
import { parseIdea } from '@/lib/release-brief';
import { parseBriefFeel } from '@/lib/brief-board';
import { loadBriefPayload, saveBriefFeel, saveBriefIdea } from '@/lib/release-brief-server';
import { briefLockedFailure, loadBriefRoundExtras } from '@/lib/idea-round-server';
import { badRequest, briefDisabled, briefFailure, missingReleaseId, notConfigured } from './_shared';

/**
 * A rollout's brief (URG-281).
 *
 * GET answers the whole page in one payload: the stored blocks (idea,
 * references, decisions, history, view link) plus the derived ones (dates and
 * who's on what from tasks, and the rollout's existing notes). Any member of
 * the rollout's team, guests included, may read it.
 *
 * PATCH saves the Idea (the scene autosaves it, debounced), or, without an
 * `idea` key, the board's look and feel (headline, feelsLike, notThis,
 * palette; #897). Any member who may
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
    title: access.release.title,
    artistName: access.release.artistName,
    artworkAssetId: access.release.artworkAssetId,
    user: auth.user,
  });
  if (!loaded.ok) return briefFailure(loaded);
  const extras = await loadBriefRoundExtras(admin, {
    releaseId,
    releaseOwnerId: access.release.ownerUserId,
    user: auth.user,
  });
  return NextResponse.json({ brief: { ...loaded.value, ...extras } });
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

  const body: unknown = await request.json().catch(() => null);
  const isIdea = Boolean(body && typeof body === 'object' && 'idea' in body);
  const parsed = isIdea ? parseIdea(body) : null;
  if (parsed && !parsed.ok) return badRequest(parsed.error);
  const feel = isIdea ? null : parseBriefFeel(body);
  if (feel && !feel.ok) return badRequest(feel.error);

  const locked = await briefLockedFailure(admin, releaseId);
  if (locked) return briefFailure(locked);

  if (feel?.ok) {
    const savedFeel = await saveBriefFeel(admin, { releaseId, patch: feel.value, actorId: auth.user.id });
    if (!savedFeel.ok) return briefFailure(savedFeel);
    return NextResponse.json({ feel: savedFeel.value });
  }
  if (!parsed?.ok) return badRequest('Nothing to save.');

  const saved = await saveBriefIdea(admin, { releaseId, idea: parsed.value, actorId: auth.user.id });
  if (!saved.ok) return briefFailure(saved);
  return NextResponse.json(saved.value);
}
