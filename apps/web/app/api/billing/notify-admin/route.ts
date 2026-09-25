import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/releases/_shared';
import { isHardPaywallEnabled } from '@/lib/team-billing';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { resolveNotifyAdminDecision } from '@/lib/billing-events';
import {
  countBillingEventsSince,
  latestBillingEventAtForActor,
  logBillingEvent,
} from '@/lib/billing-events-server';
import { isEmailConfigured, sendEmail } from '@/lib/email';
import { resolveAppBaseUrl } from '@/lib/tasks-server';

// POST /api/billing/notify-admin — a walled teammate asking their own admin to
// activate the plan. One tap, per the spec.
//
// Rate limited through billing_events rather than any new store: once per
// person per day, and at most five per team per day so a large team cannot
// bury one owner's inbox. A blocked repeat answers 200 with alreadySent, and
// the button says "Your admin has been notified" — from the teammate's point of
// view it worked, and telling them otherwise would be both confusing and
// useless.
//
// OPEN route: every caller is walled by definition.

const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  if (!isHardPaywallEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json({ error: 'Server is not configured.' }, { status: 500 });
  }

  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
  if (!team.primaryWorkspaceId || !team.ownerUserId) {
    return NextResponse.json({ error: 'No team to notify about.' }, { status: 404 });
  }

  // An owner or admin has no one to ask; they are the person who acts.
  if (team.isOwnerOrAdmin) {
    return NextResponse.json(
      { error: 'You can activate the plan yourself.' },
      { status: 400 }
    );
  }

  const [lastSameActorSentAt, workspaceSentTodayCount] = await Promise.all([
    latestBillingEventAtForActor(
      admin,
      team.primaryWorkspaceId,
      auth.user.id,
      'notify_admin_sent'
    ),
    countBillingEventsSince(
      admin,
      team.primaryWorkspaceId,
      'notify_admin_sent',
      new Date(Date.now() - DAY_MS).toISOString()
    ),
  ]);

  const decision = resolveNotifyAdminDecision({
    lastSameActorSentAt,
    workspaceSentTodayCount,
  });

  if (!decision.allowed) {
    return NextResponse.json({ ok: true, alreadySent: true });
  }

  await logBillingEvent(admin, {
    workspaceId: team.primaryWorkspaceId,
    ownerUserId: team.ownerUserId,
    actorUserId: auth.user.id,
    type: 'notify_admin_sent',
    metadata: { teamName: team.teamName },
  });

  // The email is best-effort: the ask is recorded either way, and the founder's
  // own alerts already surface a team stuck at the wall.
  if (team.ownerEmail && isEmailConfigured()) {
    try {
      const requesterLabel =
        String(auth.user.user_metadata?.full_name || '').trim() ||
        String(auth.user.email || '').trim() ||
        'A teammate';

      await sendEmail(admin, {
        templateId: 'notify_admin',
        to: team.ownerEmail,
        props: {
          requesterLabel,
          teamName: team.teamName,
          activateUrl: `${resolveAppBaseUrl()}/locked`,
        },
        trigger: 'notify_admin_sent',
        recipientUserId: team.ownerUserId,
        actorUserId: auth.user.id,
      });
    } catch {
      // Recorded above; never fail the click.
    }
  }

  return NextResponse.json({ ok: true, alreadySent: false });
}
