import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import {
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
} from '@/lib/release-access-server';
import { isDistributionEnabled } from '@/lib/distribution';
import { loadDistributionFacts, recordDistributionHandoff } from '@/lib/distribution-server';

/**
 * Distribution, step one. GET reads what the Distribute step needs to show: the
 * facts behind the readiness checklist, and when the team last went across to
 * the partner. POST records that someone just did.
 *
 * Team-aware like every scene route group: any member may read and record, a
 * guest is read-only (so a guest cannot log a handoff), a non-member gets the
 * existence-hiding 404. Flag first, so a direct call cannot reach a feature the
 * UI is dark for.
 */

const gateOff = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isDistributionEnabled()) return gateOff();

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

  const payload = await loadDistributionFacts(admin, access.release);
  return NextResponse.json({ distribution: payload });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isDistributionEnabled()) return gateOff();

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

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const recorded = await recordDistributionHandoff(admin, {
    releaseId,
    // Stamped with the RELEASE owner, never the acting teammate, like every
    // child row of a scene: the team is what the founder counts.
    ownerUserId: access.release.ownerUserId,
    actorUserId: auth.user.id,
  });

  // 200 either way: the tap has already opened the partner's page, so a lost
  // log row is for the console, not for the person.
  return NextResponse.json({ recorded });
}
