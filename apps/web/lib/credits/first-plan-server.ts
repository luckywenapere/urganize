import type { SupabaseClient } from '@supabase/supabase-js';
import { isFirstPlanFree, type FirstPlanFacts } from './first-plan';

/**
 * Reads the two facts `isFirstPlanFree` decides from (lib/credits/first-plan.ts),
 * for the team OWNER, since the owner's team is the one that pays. Both reads
 * are head-only counts and run together. Any error reads as null, which the
 * rule treats as "not free".
 */
export async function readFirstPlanFacts(
  admin: SupabaseClient,
  ownerUserId: string | null
): Promise<FirstPlanFacts> {
  if (!ownerUserId) return { approvedPlans: null, plannedRollouts: null };
  try {
    const [plans, planned] = await Promise.all([
      admin
        .from('release_plan_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', ownerUserId)
        .eq('status', 'approved'),
      admin
        .from('releases')
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', ownerUserId)
        .eq('metadata->>planned_by_urgans', 'true'),
    ]);
    return {
      approvedPlans: plans.error || typeof plans.count !== 'number' ? null : plans.count,
      plannedRollouts: planned.error || typeof planned.count !== 'number' ? null : planned.count,
    };
  } catch {
    return { approvedPlans: null, plannedRollouts: null };
  }
}

/** True when this run of `actionId` is the team's free first plan. */
export async function isFirstPlanFreeForTeam(
  admin: SupabaseClient,
  actionId: string,
  ownerUserId: string | null
): Promise<boolean> {
  if (actionId !== 'release.draft_plan') return false;
  return isFirstPlanFree(actionId, await readFirstPlanFacts(admin, ownerUserId));
}
