import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import {
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
} from '@/lib/release-access-server';
import { isDistributionEnabled } from '@/lib/distribution';
import {
  checkReleaseForDistribution,
  loadDistributionPayload,
  recordDistributionHandoff,
} from '@/lib/distribution-server';

/**
 * Distribution. GET reads what the Distribute scene and the status on the
 * rollout show: the check (errors and warnings), anything the distributor sent
 * back, and when the team last went across to the partner. POST is the order
 * action: it runs the check ITSELF and only then records that someone went
 * across.
 *
 * THE ORDER REFUSES ON ERRORS EVEN IF THE UI IS BYPASSED. POST never reads what
 * the browser thinks the check said: it re-runs checkReleaseForDistribution on
 * the stored rollout and answers 409 with the list if there is any error. A
 * request that skips the screen, replays an old tap or edits the page gets the
 * same refusal. Warnings do not block, but they need an explicit
 * `acknowledgeWarnings: true` (the "Order anyway" button), so a request that
 * never saw them cannot order past them by accident.
 *
 * WHAT "ORDER" MEANS TODAY. The partner's API does not exist yet, so there is no
 * order to place: the action is the hand-off to their own sign-up, and the
 * partner's page is public. What this refuses is Urganize RECORDING that hand-off
 * for a rollout that would be sent back. The day an order endpoint exists it
 * calls the same check, which is why the check is its own function.
 *
 * Team-aware like every scene route group: any member may read and order, a
 * guest is read-only (so a guest cannot log a hand-off), a non-member gets the
 * existence-hiding 404. Flag first, so a direct call cannot reach a feature the
 * UI is dark for.
 */

const gateOff = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

const couldNotCheck = () =>
  NextResponse.json({ error: 'Could not check this rollout. Try again.' }, { status: 500 });

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

  const payload = await loadDistributionPayload(admin, releaseId);
  if (!payload) return couldNotCheck();
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

  // The body is optional: a plain order with nothing to acknowledge sends none.
  const body = (await request.json().catch(() => null)) as { acknowledgeWarnings?: unknown } | null;
  const acknowledgeWarnings = body?.acknowledgeWarnings === true;

  // The check runs here, on the stored rollout, whatever the browser showed.
  const check = await checkReleaseForDistribution(admin, releaseId);
  if (!check) return couldNotCheck();

  if (check.errors.length > 0) {
    return NextResponse.json(
      {
        error: 'Fix these before you order distribution',
        code: 'has_errors',
        errors: check.errors,
        warnings: check.warnings,
      },
      { status: 409 }
    );
  }

  if (check.warnings.length > 0 && !acknowledgeWarnings) {
    return NextResponse.json(
      {
        error: 'Worth a look',
        code: 'warnings_not_acknowledged',
        errors: [],
        warnings: check.warnings,
      },
      { status: 409 }
    );
  }

  const recorded = await recordDistributionHandoff(admin, {
    releaseId,
    // Stamped with the RELEASE owner, never the acting teammate, like every
    // child row of a scene: the team is what the founder counts.
    ownerUserId: access.release.ownerUserId,
    actorUserId: auth.user.id,
    acknowledgedWarnings: check.warnings.map((issue) => issue.code),
  });

  // 200 either way: the tap has already opened the partner's page, so a lost
  // log row is for the console, not for the person.
  return NextResponse.json({ recorded });
}
