import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/releases/_shared';
import { isReferralsEnabled, referralLink } from '@/lib/referrals';
import { isReferralCreditsEnabled, REFERRAL_REWARD_CAP, REFERRAL_REWARD_CREDITS } from '@/lib/referral-credits';
import { getOrCreatePersonalReferral } from '@/lib/referrals-server';

// GET /api/referrals/mine — the signed-in team's own invite link, and what
// inviting has earned so far. It creates the team's code the first time it is
// asked for, which is why it is a GET that writes: the code is not worth a
// separate "create" step the person has to find.
//
// The code belongs to the TEAM the caller OWNS, found from the authenticated
// user and never from the request. Someone who only belongs to another team gets
// `available: false` rather than an error, and the Settings section draws
// nothing for them.
//
// An OPEN route (getAuthenticatedUser, not the paywall gate): inviting a friend
// should not depend on a plan, and a walled team is exactly one that might want
// the credits. 404 while either switch is off.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isReferralsEnabled() || !isReferralCreditsEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Could not load your invite link.' }, { status: 500 });

  const workspace = await admin.from('workspaces').select('id').eq('owner_id', auth.user.id).maybeSingle();
  const workspaceId = (workspace.data as { id: string } | null)?.id;
  if (workspace.error) return NextResponse.json({ error: 'Could not load your invite link.' }, { status: 500 });
  if (!workspaceId) return NextResponse.json({ available: false }, { headers: { 'Cache-Control': 'no-store' } });

  const mine = await getOrCreatePersonalReferral(admin, workspaceId);
  if (!mine) return NextResponse.json({ error: 'Could not load your invite link.' }, { status: 500 });

  return NextResponse.json(
    {
      available: true,
      code: mine.code,
      link: referralLink(mine.code, new URL(request.url).origin),
      stats: mine.stats,
      reward: { credits: REFERRAL_REWARD_CREDITS, cap: REFERRAL_REWARD_CAP },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
