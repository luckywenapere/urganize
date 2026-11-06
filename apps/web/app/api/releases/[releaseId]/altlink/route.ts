import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamReadAccess, ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { isAltlinkEnabled, isReleasedOn } from '@/lib/altlink/rules';
import { findCodes } from '@/lib/code-finder/server';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { loadSmartLinkView, syncSmartLink } from '@/lib/altlink/server';
import { emailTeamOutNowQuietly } from '@/lib/release-out-now/server';
import { afterResponse } from '@/lib/after-response';
import { isOutNowEmailDay } from '@/lib/code-finder/rules';

// The rollout's Altlink pre-save / smart link (Oct 2026 pilot).
//
// GET: the link, its stores and its cached numbers. Opening the view is also a
// trigger: a ready rollout with no link gets one here (only for someone who may
// write; a read-only guest just sees the state).
// POST: Try again. Reads the release, its details and the TRM codes on the
// server; nothing about the link comes from the browser.
//
// Team-aware like every scene route group: members read and write, a guest
// reads only, a non-member gets the existence-hiding 404.

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

export async function GET(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  if (!isAltlinkEnabled()) return notFound();
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const { releaseId } = await context.params;
  const admin = createAdminClient(auth.supabaseUrl);
  const access = await ensureReleaseTeamReadAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const canWrite = !('error' in (await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user)));
  try {
    let view = await loadSmartLinkView(admin, releaseId, { actorUserId: canWrite ? auth.user.id : null, readOnly: !canWrite });
    // Out, but no code yet (#1097): look the song up here too, so the link
    // appears wherever the team opens it (the rollout, the artist page), not
    // only on Home. At most every 15 minutes (findCodes holds that). A linked
    // artist's match makes the link straight away; read the view again then.
    const noCode = view.notReady === 'no_code' || view.notReady === 'missing_identifier';
    if (canWrite && !view.link && noCode && isReleasedOn(view.facts.releaseDate, Date.now())) {
      try {
        const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
        const found = await findCodes(admin, releaseId, {
          actorUserId: auth.user.id,
          workspaceId: team.primaryWorkspaceId ?? null,
          ownerUserId: team.ownerUserId ?? null,
        });
        if (found.status === 'confirmed') view = await loadSmartLinkView(admin, releaseId, { readOnly: true });
      } catch (error) {
        console.error('[altlink] lookup on open failed', { releaseId, message: error instanceof Error ? error.message : 'error' });
      }
    }
    // Release day (#1090): the link exists, so the team hears the song is out.
    // Once only, and only on release day or the day after; checked server-side.
    if (view.link?.url && isOutNowEmailDay(view.facts.releaseDate, Date.now())) afterResponse('out now email', () => emailTeamOutNowQuietly(admin, releaseId));
    return NextResponse.json({ view, canWrite });
  } catch (error) {
    console.error('[altlink] view failed', { releaseId, message: error instanceof Error ? error.message : 'error' });
    return NextResponse.json({ error: 'Could not load the link.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  if (!isAltlinkEnabled()) return notFound();
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const { releaseId } = await context.params;
  const admin = createAdminClient(auth.supabaseUrl);
  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  try {
    const outcome = await syncSmartLink(admin, releaseId, { actorUserId: auth.user.id, retry: true });
    const view = await loadSmartLinkView(admin, releaseId, { readOnly: true });
    return NextResponse.json({ outcome: outcome.kind, view, canWrite: true });
  } catch (error) {
    console.error('[altlink] retry failed', { releaseId, message: error instanceof Error ? error.message : 'error' });
    return NextResponse.json({ error: 'Could not make the link.' }, { status: 500 });
  }
}
