// Counting embedded-action runs and alerting the founder on a trip. Server
// only — lib/urgans-actions/guard.ts holds the pure decision.
//
// STORAGE IS `billing_events`, WITH NO MIGRATION — the urgans-usage-server.ts
// precedent exactly: `type` is free text, and the existing
// `(workspace_id, type, created_at desc)` index is the access path this needs.
//
// FAILS OPEN: `countBillingEventsSince` returns 0 on a read error by its own
// design, so an infrastructure blip grants the run rather than refusing a
// paying customer. Consistent with every other guard in this codebase.

import type { SupabaseClient } from '@supabase/supabase-js';
import { countBillingEventsSince, latestBillingEventAt } from '../billing-events-server';
import { notifyFounder } from '../billing-alerts-server';
import {
  EMBEDDED_ACTIONS_DAILY_CAP,
  decideEmbeddedActionsGuard,
  guardWindowStartIso,
  shouldAlertGuardTrip,
  type EmbeddedActionsGuardDecision,
} from './guard';

/** May this team run one more embedded action right now? Also fires (at most
 * once per team per 24h) the founder alert on a trip — the caller does not
 * need to know that happened; it just gets the allow/refuse answer. */
export async function checkEmbeddedActionsGuard(
  admin: SupabaseClient,
  input: {
    workspaceId: string;
    ownerUserId: string | null;
    actorUserId: string | null;
    now?: Date;
  }
): Promise<EmbeddedActionsGuardDecision> {
  const now = input.now ?? new Date();
  const sinceIso = guardWindowStartIso(now);
  const count = await countBillingEventsSince(
    admin,
    input.workspaceId,
    'urgans_embedded_action',
    sinceIso
  );

  const decision = decideEmbeddedActionsGuard({ count });
  if (decision.allowed) return decision;

  const lastAlertAtIso = await latestBillingEventAt(
    admin,
    input.workspaceId,
    'urgans_guard_tripped'
  );
  if (shouldAlertGuardTrip({ lastAlertAtIso, now })) {
    await notifyFounder(admin, {
      kind: 'urgans_guard_tripped',
      workspaceId: input.workspaceId,
      ownerUserId: input.ownerUserId,
      actorUserId: input.actorUserId,
      note: `${count} embedded actions in the last 24h (cap: ${EMBEDDED_ACTIONS_DAILY_CAP}).`,
      metadata: { count, cap: EMBEDDED_ACTIONS_DAILY_CAP },
    });
  }

  return decision;
}
