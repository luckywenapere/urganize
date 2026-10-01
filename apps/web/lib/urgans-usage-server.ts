import type { SupabaseClient } from '@supabase/supabase-js';
import { checkLimit, getEntitlement, isApproachingLimit, type LimitVerdict } from './entitlements';
import type { PricingTierId } from '@urganize/pricing';
import { countBillingEventsSince, logBillingEvent } from './billing-events-server';
import { usageWindowStartIso } from './urgans-usage';

// Counting assistant turns, and the ceiling.
//
// STORAGE IS `billing_events`, WITH NO MIGRATION, and that is a real reuse
// rather than a shortcut. Its `type` column is free text by design ("a new
// moment needs no migration", per the column comment), and its existing index
// `(workspace_id, type, created_at desc)` is exactly the access path for
// `count where workspace = ? and type = ? and created_at >= ?`. At a 150-per-
// window ceiling that is a handful of rows.
//
// FAILS OPEN throughout, consistent with the seat cap, the release cap and the
// tier resolver: an unresolvable team, an unresolvable tier or an unreadable
// count all mean "do not enforce". `countBillingEventsSince` returns 0 on error
// by its own design, which means a database blip grants a few extra assistant
// calls. That is the right direction to be wrong — falsely refusing a paying
// customer their assistant is much worse than serving a few free turns.

const UNCAPPED: LimitVerdict = { allowed: true, limit: null, current: 0, remaining: null };

export type UsageSnapshot = {
  used: number;
  /** null = no ceiling on this tier. */
  limit: number | null;
  /** True once the window is 80% consumed, for the banner. */
  approaching: boolean;
};

/** Anchor the window on the owner's billing day. Only the DAY-OF-MONTH is used
 * — see lib/urgans-usage.ts for why walking back from `expires_at` is unsound. */
export async function readBillingAnchor(
  client: SupabaseClient,
  ownerUserId: string | null
): Promise<string | null> {
  if (!ownerUserId) return null;
  try {
    const { data, error } = await client
      .from('subscriptions')
      .select('expires_at, status')
      .eq('user_id', ownerUserId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { expires_at: string | null; status: string | null };
    // A `trialing` row's expires_at is a TRIAL end, not a period end, so it is
    // not a billing anniversary. Such a team is uncapped anyway (trials resolve
    // to the flagship tier), but reading it would be wrong on its own terms.
    if (row.status === 'trialing') return null;
    return row.expires_at;
  } catch {
    return null;
  }
}

/** How much of the current window a team has used. */
export async function getUsageSnapshot(
  client: SupabaseClient,
  input: {
    workspaceId: string;
    ownerUserId: string | null;
    /** Already resolved by the caller's TeamAccessSnapshot, which is cached —
     *  re-deriving here would add two reads to the assistant's hot path. */
    tier: PricingTierId;
    now?: Date;
  }
): Promise<UsageSnapshot> {
  const limit = getEntitlement(input.tier, 'urgans_monthly_actions');
  if (limit === null) return { used: 0, limit: null, approaching: false };

  const anchorIso = await readBillingAnchor(client, input.ownerUserId);
  const sinceIso = usageWindowStartIso({ now: input.now ?? new Date(), anchorIso });
  const used = await countBillingEventsSince(client, input.workspaceId, 'urgans_action', sinceIso);

  return {
    used,
    limit,
    approaching: isApproachingLimit({
      tier: input.tier,
      key: 'urgans_monthly_actions',
      current: used,
    }),
  };
}

/** May this team take one more assistant turn? */
export async function checkUrgansAllowance(
  client: SupabaseClient,
  input: {
    workspaceId: string;
    ownerUserId: string | null;
    tier: PricingTierId;
    now?: Date;
  }
): Promise<LimitVerdict> {
  if (getEntitlement(input.tier, 'urgans_monthly_actions') === null) return UNCAPPED;

  const anchorIso = await readBillingAnchor(client, input.ownerUserId);
  const sinceIso = usageWindowStartIso({ now: input.now ?? new Date(), anchorIso });
  const current = await countBillingEventsSince(
    client,
    input.workspaceId,
    'urgans_action',
    sinceIso
  );

  return checkLimit({ tier: input.tier, key: 'urgans_monthly_actions', current });
}

/** Record one billable turn.
 *
 * Called AFTER a turn succeeds, so a gateway failure is not charged to the
 * user. Never throws — `logBillingEvent` swallows its own failures, and losing
 * a count is better than failing a turn the user already paid for in patience.
 *
 * `metadata` rides on the same event and is how the model router's decisions
 * (which model, why, how many hops, tokens) are kept: the type stays
 * `urgans_action`, so the monthly count above is unaffected, and no migration is
 * needed. It is left off entirely when there is none, so a turn the router did
 * not touch stores exactly what it always did. */
export async function recordUrgansAction(
  client: SupabaseClient,
  input: {
    workspaceId: string;
    ownerUserId: string | null;
    actorUserId: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await logBillingEvent(client, {
    workspaceId: input.workspaceId,
    ownerUserId: input.ownerUserId,
    actorUserId: input.actorUserId,
    type: 'urgans_action',
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}
