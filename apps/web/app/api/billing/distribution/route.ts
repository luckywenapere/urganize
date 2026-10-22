import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/_shared/auth';
import { resolveBillingInterval } from '@/lib/billing-plans';
import { decideDistributionAccess, prepayOffers } from '@/lib/distribution-entitlement';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { readTrmFeeConfig } from '@/lib/trm/partner-fee';

// Does this person's team get distribution with its plan, and if not, what
// would unlock it? Feeds the card at the top of the Distribute step (pricing
// v3, mock c). An open route like subscription-status: a walled or read-only
// team still opens the step, and a 402 would redirect the browser to /locked.
// It reads the TEAM OWNER's subscription, because that is whose plan the team
// is on; it never returns the owner's email.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const access = await getTeamAccessForUser(auth.user.id, auth.user.email ?? null);
  const config = readTrmFeeConfig();
  const ownerUserId = access.ownerUserId;

  let plan: string | null = null;
  let storedInterval: string | null = null;
  let expiresAt: string | null = null;
  if (ownerUserId) {
    const admin = createAdminClient(auth.supabaseUrl);
    if (admin) {
      const subscription = await admin
        .from('subscriptions')
        .select('plan, billing_interval, expires_at')
        .eq('user_id', ownerUserId)
        .maybeSingle();
      const row = subscription.data as { plan: string | null; billing_interval: string | null; expires_at: string | null } | null;
      plan = row?.plan ?? null;
      storedInterval = row?.billing_interval ?? null;
      expiresAt = row?.expires_at ?? null;
    }
  }

  const interval = plan ? resolveBillingInterval({ plan, storedInterval }) : null;
  const decision = decideDistributionAccess({
    accessState: access.state,
    plan,
    interval,
    expiresAt,
    requiresPrepay: config.distributionRequiresPrepay,
  });

  return NextResponse.json({
    ...decision,
    requiresPrepay: config.distributionRequiresPrepay,
    canSwitch: access.isOwnerOrAdmin && ownerUserId === auth.user.id,
    ownerName: access.ownerName,
    offers: decision.state === 'needs_prepay' ? prepayOffers(decision.tier) : [],
  });
}
