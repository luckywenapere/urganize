import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
  isMetadataFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '../credits/_shared';
import { inviteCreditedPerson, listCreditClaims, resolveReleaseWorkspace } from '@/lib/claim-owner-server';

// The rollout owner's side of the claim flow, next to the credits they
// collected. GET says which credited people have an unclaimed page and where
// each invite stands. POST makes one of them a fresh claim link, and emails it
// when asked.
//
// Gated with the credits themselves (NEXT_PUBLIC_FEATURE_METADATA): these rows
// only exist because of that surface. Team members read and write, guests are
// read-only, the shared access pair decides.

export async function GET(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  if (!isMetadataFeatureEnabled()) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const access = await ensureReleaseTeamReadAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const release = await resolveReleaseWorkspace(admin, releaseId);
  if (!release) return NextResponse.json({ credits: [] });
  return NextResponse.json({ credits: await listCreditClaims(admin, releaseId, release.workspaceId) });
}

export async function POST(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  if (!isMetadataFeatureEnabled()) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid request body.' }, { status: 400 });
  }
  const submissionId = typeof body.submissionId === 'string' ? body.submissionId : '';
  const channel = body.channel === 'email' ? 'email' : body.channel === 'link' ? 'link' : null;
  if (!submissionId || !channel) {
    return NextResponse.json({ error: 'Choose a credit and how to send it.' }, { status: 400 });
  }

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const outcome = await inviteCreditedPerson(admin, {
    releaseId,
    submissionId,
    user: { id: auth.user.id },
    channel,
  });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json(outcome);
}
