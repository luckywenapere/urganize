import type { SupabaseClient } from '@supabase/supabase-js';
import { checkLimit, type CountableLimitKey, type LimitVerdict } from './entitlements';
import { getWorkspaceTier } from './team-billing-server';
import { logBillingEvent } from './billing-events-server';

// Seat counting and seat enforcement.
//
// It lives on its own rather than in lib/tasks-server.ts for one specific
// reason: `app/api/invites/[token]/route.ts` needs it, and that route
// deliberately hand-rolls its auth and re-declares its own table constant to
// stay OFF the `@/app/api/_shared/auth` chain — because that chain runs
// `requireActiveAccount`, and an invitee accepting into a paid team does not
// have a subscription of their own. Importing anything paywall-adjacent into
// that route would lock out every new teammate. Everything imported here is a
// leaf module for exactly that reason; keep it that way.

const WORKSPACE_MEMBERS_TABLE = 'workspace_members';

/** How many seats a team is using.
 *
 * `invited` and `active` both occupy a seat; only `removed` frees one. That is
 * not a choice made here — it mirrors `loadWorkspaceMembers` and every other
 * read of this table, all of which filter `.neq('status', 'removed')`. Counting
 * differently from the list the user is looking at would be worse than any
 * particular answer.
 *
 * Returns null when the count cannot be read, and callers MUST treat null as
 * "do not enforce". Blocking an invite because a count query failed would turn
 * a transient database blip into a team that cannot grow.
 */
export async function countTeamSeats(
  client: SupabaseClient,
  workspaceId: string
): Promise<number | null> {
  if (!workspaceId) return null;
  try {
    const { count, error } = await client
      .from(WORKSPACE_MEMBERS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .neq('status', 'removed');
    if (error) {
      console.error('[seats] could not count team seats:', error.message);
      return null;
    }
    return count ?? 0;
  } catch (error) {
    console.error('[seats] could not count team seats:', error);
    return null;
  }
}

/**
 * Is this team allowed one more seat?
 *
 * Shared by BOTH places a seat can be created, which is the whole point:
 * `POST /api/workspace/members/invite` mints one seat per email, and
 * `POST /api/invites/[token]` redeems a shareable link that MANY people can
 * use. Capping only the first leaves the second wide open.
 *
 * FAILS OPEN, twice over, and both are deliberate:
 *   - an unreadable seat count returns allowed, because turning a transient
 *     database blip into a team that cannot grow is far worse than briefly
 *     allowing one seat too many;
 *   - an unresolvable tier does the same, via getWorkspaceTier returning null.
 *
 * It is also INERT today, structurally rather than by a flag. Nothing in the
 * product writes `subscriptions.plan = 'manager'`: checkout validates against
 * the legacy plan ids and ADMIN_ASSIGNABLE_PLANS does not include it. So every
 * team resolves to `label`, which has no seat ceiling, until pricing v2 puts
 * Manager into checkout. A second flag check here would add a way for that to
 * be wrong without adding any safety.
 */
export async function checkSeatAllowance(
  client: SupabaseClient,
  workspaceId: string
): Promise<LimitVerdict> {
  const allowed: LimitVerdict = { allowed: true, limit: null, current: 0, remaining: null };

  const tier = await getWorkspaceTier(workspaceId);
  if (!tier) return allowed;

  const current = await countTeamSeats(client, workspaceId);
  if (current === null) return allowed;

  return checkLimit({ tier, key: 'seats', current });
}

/**
 * Record that a team hit a ceiling. Never throws and never blocks the response
 * it belongs to — `logBillingEvent` swallows its own failures by design, and a
 * missing analytics row must not turn a clean refusal into a 500.
 *
 * This is the pricing spec's "track every limit hit, by entitlement key": these
 * rows are the upgrade signal, and frequent seat or release blocks on Manager
 * are the clearest buy intent the product produces.
 */
export async function recordLimitHit(
  client: SupabaseClient,
  input: {
    workspaceId: string;
    ownerUserId?: string | null;
    actorUserId: string | null;
    key: CountableLimitKey;
    limit: number;
    current: number;
  }
): Promise<void> {
  await logBillingEvent(client, {
    workspaceId: input.workspaceId,
    ownerUserId: input.ownerUserId ?? null,
    actorUserId: input.actorUserId,
    type: 'limit_hit',
    metadata: {
      entitlement: input.key,
      limit: input.limit,
      current: input.current,
    },
  });
}
