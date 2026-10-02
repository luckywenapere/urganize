import { NextRequest, NextResponse } from 'next/server';
import { requireUrgansAccess } from '@/app/api/_shared/urgans-access';
import { isChappiEnabled } from '@/lib/chappi/config';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { getUsageSnapshot } from '@/lib/urgans-usage-server';
import { isCreditsEnabled } from '@/lib/credits/config';
import { isLowOnCredits } from '@/lib/credits/copy';
import { getCreditSnapshot } from '@/lib/credits/credits-server';

// GET /api/urgans/usage — how much of the assistant window this team has spent.
//
// A small dedicated route rather than another field on /api/subscription-status,
// which is cached: this number changes on every assistant turn, so serving it
// from a cached payload would show a stale count exactly when it matters.
//
// Returns `limit: null` for an uncapped team, which is every team except a
// paying Manager one, and the banner renders nothing on null.
//
// With credits switched on a `credits` object rides along, and the old action
// count is reported as uncapped: credits replace that ceiling, so the banner
// must not warn about both. Reading the balance also grants what the team is
// owed (a subscriber's allowance for this window, or a trial's one-off credits)
// on the first look, which is what keeps a team that never chats from needing a
// row it will never use.

export async function GET(request: NextRequest) {
  if (!isChappiEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireUrgansAccess(request);
  if ('error' in auth) return auth.error;

  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
  if (!team.primaryWorkspaceId) {
    return NextResponse.json({ used: 0, limit: null, approaching: false });
  }

  if (isCreditsEnabled()) {
    const credits = await getCreditSnapshot(auth.adminClient, {
      workspaceId: team.primaryWorkspaceId,
      ownerUserId: team.ownerUserId,
      team,
    });
    // Unreadable: say nothing rather than guess, the same as every other counter here.
    if (!credits) return NextResponse.json({ used: 0, limit: null, approaching: false });
    return NextResponse.json({
      used: 0,
      limit: null,
      approaching: false,
      credits: {
        total: credits.total,
        trial: credits.trial,
        allowance: credits.allowance,
        topup: credits.topup,
        account: credits.account,
        monthlyAllowance: credits.monthlyAllowance,
        nextGrantAt: credits.nextGrantAt,
        low: isLowOnCredits(credits.total),
      },
    });
  }

  const snapshot = await getUsageSnapshot(auth.adminClient, {
    workspaceId: team.primaryWorkspaceId,
    ownerUserId: team.ownerUserId,
    tier: team.tier,
  });

  return NextResponse.json(snapshot);
}
