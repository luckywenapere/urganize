import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Whether a user may be handed work on a team: an ACTIVE member, or the
 * team's owner. One answer for both ways an assignee gets written.
 *
 * `PATCH /api/tasks/[id]` has always asked this question and refused a
 * stranger. `POST /api/tasks` did not ask at all, so an activity could be
 * created already assigned to any user id on the platform (and the person got
 * a "you have new work" notification on a team they were never on). Both
 * routes call this now, so the two cannot disagree again.
 *
 * Throws on a query error rather than guessing: unlike the seat and release
 * counters, a wrong "yes" here puts somebody on a team they do not belong to,
 * and a wrong "no" is a retry. The caller turns a throw into its usual 500.
 */
export async function isTeamAssignee(
  adminClient: SupabaseClient,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  if (!workspaceId || !userId) return false;

  const [memberResult, ownerResult] = await Promise.all([
    adminClient
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
    adminClient
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .eq('owner_id', userId)
      .maybeSingle(),
  ]);

  if (memberResult.error) throw memberResult.error;
  if (ownerResult.error) throw ownerResult.error;

  return Boolean(memberResult.data || ownerResult.data);
}

export const ASSIGN_OUTSIDE_TEAM_MESSAGE = 'Cannot assign an activity to someone outside your team.';
