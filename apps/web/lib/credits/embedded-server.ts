import type { SupabaseClient } from '@supabase/supabase-js';
import { isCreditsEnabled } from './config';
import { embeddedRefusalNotice } from './copy';
import { getCreditSnapshot, settleTurn, type CreditSnapshot } from './credits-server';
import { EMBEDDED_HOLD_CREDITS, embeddedCharge, type EmbeddedCharge } from './embedded';
import { canStartTurn, type UsageCall } from './pricing';
import type { TeamForAllowance } from './allowance';

/**
 * Paying for an embedded action (see embedded.ts for the rules). Two calls, one
 * before the run and one after, shared by every door onto the planner and the
 * press-kit draft so none of them can be free:
 *
 *   gate = await beginEmbeddedRun(...)   // the hold: refuse if the balance is short
 *   ...the run...
 *   await settleEmbeddedRun(...)         // only if it succeeded
 *
 * With credits off, or no team to charge, the gate is `{ metered: false }` and
 * nothing here reads or writes a credit: the run is exactly what it was.
 *
 * FAILS OPEN like the chat does: an unreadable balance does not block the run,
 * and an unwritable charge is logged loudly (credits-server.ts) rather than
 * thrown at someone whose plan has already been built.
 */

export type EmbeddedRunGate =
  | { metered: false }
  | { metered: true; ok: true; snapshot: CreditSnapshot }
  | { metered: true; ok: false; message: string };

export async function beginEmbeddedRun(
  admin: SupabaseClient,
  input: { workspaceId: string | null; ownerUserId: string | null; team: TeamForAllowance }
): Promise<EmbeddedRunGate> {
  if (!isCreditsEnabled() || !input.workspaceId) return { metered: false };
  const snapshot = await getCreditSnapshot(admin, {
    workspaceId: input.workspaceId,
    ownerUserId: input.ownerUserId,
    team: input.team,
  });
  if (!snapshot) return { metered: false };
  if (!canStartTurn(snapshot.total, EMBEDDED_HOLD_CREDITS)) {
    return {
      metered: true,
      ok: false,
      message: embeddedRefusalNotice({
        account: snapshot.account,
        nextGrantAt: snapshot.nextGrantAt,
        needed: EMBEDDED_HOLD_CREDITS,
        left: snapshot.total,
      }),
    };
  }
  return { metered: true, ok: true, snapshot };
}

/**
 * Charge a run that succeeded, from the calls it made. Returns what was charged
 * so the caller can record it. A run with no calls (no model configured) costs
 * nothing and writes nothing.
 */
export async function settleEmbeddedRun(
  admin: SupabaseClient,
  input: {
    gate: EmbeddedRunGate;
    workspaceId: string | null;
    ownerUserId: string | null;
    actorUserId: string;
    /** Identifies the run, so settling it twice charges it once. */
    requestId: string;
    actionId: string;
    calls: readonly UsageCall[];
  }
): Promise<EmbeddedCharge> {
  const charge = embeddedCharge(input.calls);
  if (!input.gate.metered || !input.gate.ok || !input.workspaceId) return charge;
  await settleTurn(admin, {
    workspaceId: input.workspaceId,
    ownerUserId: input.ownerUserId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    charge,
    calls: input.calls,
    balances: input.gate.snapshot,
    context: {
      source: 'embedded_action',
      action: input.actionId,
      hold_credits: EMBEDDED_HOLD_CREDITS,
      capped: charge.capped,
      uncapped_credits: charge.uncappedCredits,
    },
  });
  return charge;
}
