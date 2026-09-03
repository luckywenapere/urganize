import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/releases/_shared';
import { isHardPaywallEnabled } from '@/lib/team-billing';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { isBillingTrackRequest, resolveTrackOutcome } from '@/lib/billing-events';
import { latestBillingEventAt, hasBillingEvent, logBillingEvent } from '@/lib/billing-events-server';
import { notifyFounder } from '@/lib/billing-alerts-server';

// POST /api/billing/track — the wall reporting that a human interacted with it.
//
// WHY HERE AND NOT IN THE GATE: requireActiveAccount fires many times per page
// (every request a walled session makes returns 402), and it cannot tell a
// person looking at the wall from a background poll being refused. Recording
// there would mean burst-dedupe machinery on the hottest path in the app for a
// worse signal. The wall renders once, so it reports once.
//
// The CLIENT says what happened in neutral terms ('paywall_view' or
// 'talk_to_us'); the SERVER decides which event that is. That split is
// deliberate: a client cannot forge a first-hit, a return visit, or anything
// from the paid side of the ledger.
//
// OPEN route (getAuthenticatedUser, not the gate): by definition every caller
// is walled, so gating it would make it unreachable.

const OPEN_RESPONSE = NextResponse.json({ ok: true });

export async function POST(request: NextRequest) {
  if (!isHardPaywallEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  let body: { event?: unknown; planViewed?: unknown; actionType?: unknown } = {};
  try {
    body = (await request.json()) as { event?: unknown; planViewed?: unknown; actionType?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!isBillingTrackRequest(body.event)) {
    return NextResponse.json(
      { error: 'event must be "paywall_view", "talk_to_us" or "upgrade_clicked".' },
      { status: 400 }
    );
  }

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return OPEN_RESPONSE;

  // Which team is this about? The resolver already knows, and using it means a
  // caller cannot report an event against a team they do not belong to.
  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
  if (!team.primaryWorkspaceId) return OPEN_RESPONSE;

  const [hasPriorPaywallHit, lastReturnVisitAt] = await Promise.all([
    hasBillingEvent(admin, team.primaryWorkspaceId, 'paywall_hit'),
    latestBillingEventAt(admin, team.primaryWorkspaceId, 'paywall_return_visit'),
  ]);

  const outcome = resolveTrackOutcome({
    requested: body.event,
    hasPriorPaywallHit,
    lastReturnVisitAt,
  });

  // Null means a same-day repeat view: nothing to record, and nothing wrong.
  if (!outcome) return OPEN_RESPONSE;

  // A softer signal than a real purchase decision (plan_change_requested):
  // ledger-only, never a founder interrupt. Also the one outcome that is not a
  // FounderAlertKind, so it must never reach notifyFounder.
  if (outcome === 'upgrade_clicked') {
    const actionType = typeof body.actionType === 'string' ? body.actionType : null;
    await logBillingEvent(admin, {
      workspaceId: team.primaryWorkspaceId,
      ownerUserId: team.ownerUserId,
      actorUserId: auth.user.id,
      type: 'upgrade_clicked',
      metadata: { actionType },
    });
    return OPEN_RESPONSE;
  }

  const planViewed = typeof body.planViewed === 'string' ? body.planViewed : null;

  await notifyFounder(admin, {
    kind: outcome,
    workspaceId: team.primaryWorkspaceId,
    ownerUserId: team.ownerUserId,
    actorUserId: auth.user.id,
    planViewed,
    metadata: { state: team.state, reason: team.reason },
  });

  return OPEN_RESPONSE;
}
