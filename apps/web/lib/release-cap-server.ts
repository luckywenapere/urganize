import type { SupabaseClient } from '@supabase/supabase-js';
import { checkLimit, type LimitVerdict } from './entitlements';
import { getWorkspaceTier } from './team-billing-server';
import { INACTIVE_RELEASE_STATUSES } from './release-activity';

// The Manager tier's active-release ceiling.
//
// Counts releases the owner is still working — everything except the two
// terminal statuses, matching lib/release-activity.ts and therefore matching the
// "N active releases" figure the identity card already shows. A cap that
// disagreed with the number printed next to it would be indefensible.
//
// FAILS OPEN at every step, consistent with the seat cap and the tier resolver:
// no resolvable team, no resolvable tier, or an unreadable count all mean "do
// not enforce". Refusing to let someone create a release because a count query
// blipped is a far worse failure than briefly allowing a fourth.
//
// Inert today for the same structural reason seats are: nothing writes
// subscriptions.plan = 'manager', so every team resolves to `label`, which has
// no release ceiling.

const ALLOWED: LimitVerdict = { allowed: true, limit: null, current: 0, remaining: null };

export type ReleaseCapResult = {
  verdict: LimitVerdict;
  /** The team the check resolved to, for the limit_hit event. */
  workspaceId: string | null;
};

/** Resolve the owner's own team. The cap is asked about the person creating a
 * release, and a release is created by its owner, so this is always the team
 * they own rather than one they were invited into. */
async function findOwnedWorkspaceId(
  client: SupabaseClient,
  ownerUserId: string
): Promise<string | null> {
  try {
    const { data, error } = await client
      .from('workspaces')
      .select('id')
      .eq('owner_id', ownerUserId)
      .maybeSingle();
    if (error || !data) return null;
    return String((data as { id: string }).id) || null;
  } catch {
    return null;
  }
}

async function countActiveReleases(
  client: SupabaseClient,
  ownerUserId: string
): Promise<number | null> {
  try {
    const { count, error } = await client
      .from('releases')
      .select('id', { count: 'exact', head: true })
      .eq('owner_user_id', ownerUserId)
      // `not in` rather than a positive list, so a status added to the enum
      // later counts as active by default — the same way isReleaseActive
      // treats an unrecognised value.
      .not('status', 'in', `(${INACTIVE_RELEASE_STATUSES.join(',')})`);
    if (error) {
      console.error('[release-cap] could not count active releases:', error.message);
      return null;
    }
    return count ?? 0;
  } catch (error) {
    console.error('[release-cap] could not count active releases:', error);
    return null;
  }
}

export async function checkActiveReleaseAllowance(
  client: SupabaseClient,
  ownerUserId: string
): Promise<ReleaseCapResult> {
  const workspaceId = await findOwnedWorkspaceId(client, ownerUserId);
  if (!workspaceId) return { verdict: ALLOWED, workspaceId: null };

  const tier = await getWorkspaceTier(workspaceId);
  if (!tier) return { verdict: ALLOWED, workspaceId };

  const current = await countActiveReleases(client, ownerUserId);
  if (current === null) return { verdict: ALLOWED, workspaceId };

  return { verdict: checkLimit({ tier, key: 'active_releases', current }), workspaceId };
}
