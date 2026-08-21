// billing_events writes and lookups. Server only.
//
// The ledger behind two things: the founder's conversion feed (every trial,
// wall and payment moment per team) and the dedupe checks that keep the
// notification paths from emailing twice or letting a teammate spam an owner.
//
// NOTHING HERE THROWS. A billing event is a record of something that already
// happened — the payment landed, the wall rendered, the admin comped the team.
// Losing the row is regrettable; failing the request that carried it would turn
// a successful payment into an error page. Same posture as lib/email.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingEventType } from './billing-events';

export const BILLING_EVENTS_TABLE = 'billing_events';

export type LogBillingEventInput = {
  workspaceId: string | null;
  ownerUserId: string | null;
  /** Who caused it: the member who saw the wall, or the admin who acted. */
  actorUserId: string | null;
  type: BillingEventType;
  metadata?: Record<string, unknown>;
};

/** Insert one event. Returns whether it landed, for callers that want to log a
 * miss; never throws, and never blocks the caller's real work. */
export async function logBillingEvent(
  admin: SupabaseClient,
  input: LogBillingEventInput
): Promise<boolean> {
  try {
    const { error } = await admin.from(BILLING_EVENTS_TABLE).insert({
      workspace_id: input.workspaceId,
      owner_user_id: input.ownerUserId,
      actor_user_id: input.actorUserId,
      type: input.type,
      metadata: input.metadata ?? {},
    });
    if (error) {
      console.warn('[billing-events] insert failed:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[billing-events] insert threw:', error);
    return false;
  }
}

/** Has this team ever produced this event? Drives first-hit vs return-visit.
 * Errors answer `false`, which biases toward recording — a duplicate row is
 * cheaper than a lost signal. */
export async function hasBillingEvent(
  admin: SupabaseClient,
  workspaceId: string,
  type: BillingEventType
): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from(BILLING_EVENTS_TABLE)
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('type', type)
      .limit(1);
    if (error) return false;
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/** When this team last produced this event, or null. */
export async function latestBillingEventAt(
  admin: SupabaseClient,
  workspaceId: string,
  type: BillingEventType
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from(BILLING_EVENTS_TABLE)
      .select('created_at')
      .eq('workspace_id', workspaceId)
      .eq('type', type)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { created_at: string | null }).created_at ?? null;
  } catch {
    return null;
  }
}

/** When this specific person last produced this event on this team. Powers the
 * per-actor notify-admin cooldown. */
export async function latestBillingEventAtForActor(
  admin: SupabaseClient,
  workspaceId: string,
  actorUserId: string,
  type: BillingEventType
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from(BILLING_EVENTS_TABLE)
      .select('created_at')
      .eq('workspace_id', workspaceId)
      .eq('actor_user_id', actorUserId)
      .eq('type', type)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { created_at: string | null }).created_at ?? null;
  } catch {
    return null;
  }
}

/** How many of this event a team produced since `sinceIso`. Powers the
 * per-team daily cap. Errors answer the cap value's worst case (0) so a broken
 * read never blocks a legitimate first notification. */
export async function countBillingEventsSince(
  admin: SupabaseClient,
  workspaceId: string,
  type: BillingEventType,
  sinceIso: string
): Promise<number> {
  try {
    const { count, error } = await admin
      .from(BILLING_EVENTS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('type', type)
      .gte('created_at', sinceIso);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
