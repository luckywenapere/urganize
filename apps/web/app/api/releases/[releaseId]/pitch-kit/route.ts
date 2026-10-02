import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import {
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
} from '@/lib/release-access-server';
import { isPitchKitEnabled, loadPitchKit, savePitchKitFields } from '@/lib/release-epk-server';
import { parseFieldsPatch } from '@/lib/release-epk';

/**
 * The release pitch kit: what a rollout adds to the artist's standing press
 * kit for its pitch. GET reads it (with the kit summary, the collected
 * credits and the cover), PUT saves the story and/or the credits list.
 *
 * Team-aware like every scene route group: any member may read and write,
 * a guest is read-only, a non-member gets the existence-hiding 404.
 */

const gateOff = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isPitchKitEnabled()) return gateOff();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  }

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensureReleaseTeamReadAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const result = await loadPitchKit(admin, releaseId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ pitchKit: result.pitchKit });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isPitchKitEnabled()) return gateOff();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const parsed = parseFieldsPatch(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const saved = await savePitchKitFields(admin, {
    releaseId,
    ownerUserId: access.release.ownerUserId,
    actorUserId: auth.user.id,
    patch: parsed.patch,
  });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 });

  const result = await loadPitchKit(admin, releaseId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ pitchKit: result.pitchKit });
}
