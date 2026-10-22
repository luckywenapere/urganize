import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamReadAccess, ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { isAltlinkEnabled } from '@/lib/altlink/rules';
import { loadSmartLinkView, syncSmartLink } from '@/lib/altlink/server';

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
export const maxDuration = 30;

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
    const view = await loadSmartLinkView(admin, releaseId, { actorUserId: canWrite ? auth.user.id : null, readOnly: !canWrite });
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
