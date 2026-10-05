import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/releases/_shared';
import { isHardPaywallEnabled } from '@/lib/team-billing';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { latestBillingEventAtForActor, logBillingEvent } from '@/lib/billing-events-server';
import { isEmailConfigured, sendEmail } from '@/lib/email';
import { resolveAppBaseUrl } from '@/lib/tasks-server';

// POST /api/billing/email-pay-link — from the iPhone app, where Apple does not
// let us take payment, the owner asks to be emailed the link to pay on the web.
// The email goes ONLY to the signed-in person's own address, never one taken
// from the request, so this cannot be used to send mail to anybody else.
//
// OPEN route like notify-admin: every caller is walled by definition. Once per
// ten minutes per person, so a stuck tap cannot fill an inbox; a repeat answers
// 200 with alreadySent, because from their side it worked.

const COOLDOWN_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  if (!isHardPaywallEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const to = String(auth.user.email ?? '').trim();
  if (!to) {
    return NextResponse.json({ error: 'There is no email on this account.' }, { status: 400 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ error: 'Email is not available right now.' }, { status: 503 });
  }

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json({ error: 'Server is not configured.' }, { status: 500 });
  }

  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
  if (!team.primaryWorkspaceId || !team.ownerUserId) {
    return NextResponse.json({ error: 'No team found.' }, { status: 404 });
  }
  if (!team.isOwnerOrAdmin) {
    return NextResponse.json({ error: 'Your team admin can pick the plan.' }, { status: 403 });
  }

  const last = await latestBillingEventAtForActor(
    admin,
    team.primaryWorkspaceId,
    auth.user.id,
    'pay_link_emailed'
  );
  const lastMs = last ? Date.parse(last) : Number.NaN;
  if (Number.isFinite(lastMs) && Date.now() - lastMs < COOLDOWN_MS) {
    return NextResponse.json({ ok: true, alreadySent: true, email: to });
  }

  await logBillingEvent(admin, {
    workspaceId: team.primaryWorkspaceId,
    ownerUserId: team.ownerUserId,
    actorUserId: auth.user.id,
    type: 'pay_link_emailed',
    metadata: {},
  });

  const fullName = String(auth.user.user_metadata?.full_name || '').trim();
  try {
    await sendEmail(admin, {
      templateId: 'pay_link',
      to,
      props: {
        firstName: fullName ? fullName.split(/\s+/)[0] : null,
        payUrl: `${resolveAppBaseUrl()}/locked`,
      },
      trigger: 'pay_link_emailed',
      recipientUserId: auth.user.id,
      actorUserId: auth.user.id,
    });
  } catch {
    return NextResponse.json({ error: 'Could not send the email. Try again.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, alreadySent: false, email: to });
}
