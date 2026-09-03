// Server loader for lib/task-owners.ts. Reads which team member actually took
// each template step on the workspace's PAST releases, so a fresh draft can
// start from what the team has done instead of defaulting every task to the
// release owner.
//
// THE FILTER IS THE INSIGHT: assigned to someone OTHER than the release
// owner. Template instantiation defaults every task's assignee to the owner
// (lib/release-templates/instantiate.ts), so a row still sitting on the owner
// is not evidence of anything — it is just the unmoved default. A row
// assigned to anyone else IS the record of a deliberate reassignment, which is
// the only signal worth ranking.
//
// FAILS CLOSED to an empty list on any read problem, which is the SAFE
// direction here (unlike the guard's fail-open): proposeTaskOwners already
// falls all the way through to the release creator when it has no history to
// work with, so "found nothing" degrades to the exact behaviour the product
// already had before this feature existed.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PastAssignment } from './task-owners';

/** How far back to look. A generous cap on rows scanned, not on releases —
 *  bounds the query cost for a workspace with a long history without needing
 *  to guess how many releases that represents. */
const HISTORY_ROW_LIMIT = 500;

function readMetadataField(metadata: unknown, field: 'task_id' | 'role'): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const template = (metadata as { template?: unknown }).template;
  if (!template || typeof template !== 'object') return null;
  const value = (template as Record<string, unknown>)[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Past reassignments in this workspace, newest first — the order
 *  lib/task-owners.ts's recency tie-break assumes. */
export async function loadPastAssignments(
  admin: SupabaseClient,
  input: { workspaceId: string; ownerUserId: string; excludeReleaseId: string }
): Promise<PastAssignment[]> {
  try {
    const { data, error } = await admin
      .from('tasks')
      .select('assigned_to_user_id, metadata')
      .eq('workspace_id', input.workspaceId)
      .neq('release_id', input.excludeReleaseId)
      .not('assigned_to_user_id', 'is', null)
      .neq('assigned_to_user_id', input.ownerUserId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_ROW_LIMIT);

    if (error || !data) return [];

    const rows = data as Array<{ assigned_to_user_id: string | null; metadata: unknown }>;
    const assignments: PastAssignment[] = [];
    for (const row of rows) {
      if (!row.assigned_to_user_id) continue;
      assignments.push({
        templateTaskId: readMetadataField(row.metadata, 'task_id'),
        role: readMetadataField(row.metadata, 'role'),
        assignedToUserId: row.assigned_to_user_id,
      });
    }
    return assignments;
  } catch {
    return [];
  }
}
