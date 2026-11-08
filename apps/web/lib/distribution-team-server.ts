import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveBillingInterval } from './billing-plans';
import { decideDistributionAccess, type DistributionAccess } from './distribution-entitlement';
import { getTeamAccessForUser } from './team-billing-server';
import { readTrmFeeConfig } from './trm/partner-fee';

/**
 * Does a team's plan include distribution right now, read from the team owner's
 * subscription the same way the Distribute step's card does
 * (app/api/billing/distribution). Shared by the TRM ledger (what we owe at a
 * send) and the distribution limits (what a send may use), so the two can never
 * disagree about who is on a plan.
 */
export async function loadTeamDistribution(
  admin: SupabaseClient,
  ownerUserId: string
): Promise<{
  decision: DistributionAccess;
  workspaceId: string | null;
  /** The owner's plan id ('solo', 'manager', ...) and whether the team is paying
   *  now: Solo and Manager pay per single or buy the Distribution add-on. */
  plan: string | null;
  paying: boolean;
}> {
  const config = readTrmFeeConfig();
  const [access, subscription, team] = await Promise.all([
    getTeamAccessForUser(ownerUserId, null),
    admin.from('subscriptions').select('plan, billing_interval, expires_at').eq('user_id', ownerUserId).maybeSingle(),
    admin.from('workspaces').select('id').eq('owner_id', ownerUserId).maybeSingle(),
  ]);
  const sub = subscription.data as { plan: string | null; billing_interval: string | null; expires_at: string | null } | null;
  const plan = sub?.plan ?? null;
  const interval = plan ? resolveBillingInterval({ plan, storedInterval: sub?.billing_interval ?? null }) : null;
  const decision = decideDistributionAccess({
    accessState: access.state,
    plan,
    interval,
    expiresAt: sub?.expires_at ?? null,
    requiresPrepay: config.distributionRequiresPrepay,
  });
  return {
    decision,
    workspaceId: (team.data as { id: string } | null)?.id ?? null,
    plan,
    paying: access.state === 'paid',
  };
}
