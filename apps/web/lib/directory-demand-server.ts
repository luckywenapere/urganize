import type { SupabaseClient } from '@supabase/supabase-js';
import { BILLING_EVENTS_TABLE, logBillingEvent } from './billing-events-server';
import { isSameUtcDayAs, type DirectoryDemand } from './directory-demand';

/**
 * The I/O half of lib/directory-demand.ts. One row per team per role per UTC
 * day, in billing_events.
 *
 * NEVER THROWS AND NEVER BLOCKS. A manager filtering the directory is doing
 * their own work; recording that we could not supply what they asked for is
 * ours, and it must not cost them a spinner or an error. Every failure answers
 * false and the caller moves on.
 *
 * No migration: billing_events.type is free text by design and its existing
 * (workspace_id, type, created_at) index is the access path this uses.
 */

export type RecordDirectoryDemandInput = {
  workspaceId: string | null;
  ownerUserId: string | null;
  actorUserId: string;
  demand: DirectoryDemand;
  now?: Date;
};

/** Returns whether a row was written. False covers both "already recorded
 *  today" and "could not read or write", which the caller treats the same. */
export async function recordDirectoryDemand(
  admin: SupabaseClient,
  input: RecordDirectoryDemandInput
): Promise<boolean> {
  const now = input.now ?? new Date();

  // No team resolves to no dedupe key, so nothing is written rather than
  // writing an unattributable row.
  if (!input.workspaceId) return false;

  try {
    // Filtered on the metadata role rather than the type alone: dedupe is per
    // ROLE, so a manager looking for a designer and then an engineer in the
    // same sitting is two signals and not one.
    const { data, error } = await admin
      .from(BILLING_EVENTS_TABLE)
      .select('created_at')
      .eq('workspace_id', input.workspaceId)
      .eq('type', 'directory_role_wanted')
      .eq('metadata->>role', input.demand.role)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const previous = (data as { created_at: string | null }).created_at ?? null;
      if (isSameUtcDayAs(previous, now)) return false;
    }
  } catch {
    // Fall through and record. A read we could not complete must not lose the
    // signal; a duplicate row costs nothing.
  }

  return logBillingEvent(admin, {
    workspaceId: input.workspaceId,
    ownerUserId: input.ownerUserId,
    actorUserId: input.actorUserId,
    type: 'directory_role_wanted',
    metadata: {
      role: input.demand.role,
      matched: input.demand.matched,
      source: input.demand.source,
    },
  });
}
