import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { effectiveRouterMode, type RouteSurface, type TeamForRouting } from './model-router';

type EnvLike = Record<string, string | undefined>;

/**
 * The team facts the model router needs to set a plan ceiling, for the
 * single-shot features that do not already have them in hand.
 *
 * Read ONLY when the router will use them. With the router off, a request must
 * cost exactly what it cost before, and this is a database read; the answer is
 * undefined without asking. When it is on (or in shadow, which records the
 * ceiling it would have applied) the lookup is the same cached one the paywall
 * already made for this request.
 *
 * Never fails a request. A failed lookup answers undefined, which the router
 * reads as "unknown team", and an unknown team is held at Manager level: a wrong
 * answer here costs a slightly smaller ceiling, never an error.
 *
 * Both `state` and `tier` are returned because `tier` alone is not a plan: it
 * reads as the uncapped flagship for a trial (see resolveCeiling).
 */
export async function loadTeamForRouting(
  surface: RouteSurface,
  user: { id: string; email?: string | null },
  env: EnvLike = process.env
): Promise<TeamForRouting | undefined> {
  if (effectiveRouterMode(surface, env) === 'off') return undefined;
  try {
    const team = await getTeamAccessForUser(user.id, user.email);
    return { state: team.state, tier: team.tier };
  } catch (error) {
    console.error('[ai-router] could not read the team for routing:', error);
    return undefined;
  }
}
