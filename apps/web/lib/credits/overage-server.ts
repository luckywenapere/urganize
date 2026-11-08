import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logBillingEvent } from '../billing-events-server';
import { chargeSavedCard, verifyPaystackTransaction } from '../paystack-server';
import type { TeamForAllowance } from './allowance';
import { buildOverageState, overageCostKobo, overageRateKobo, OVERAGE_REFERENCE_PREFIX, type OverageState } from './overage';

// The ONLY reader and writer of credit_overage and of team_billing_prefs'
// credit_cap_kobo. The rules are in overage.ts. The ledger itself is written by
// credits-server.ts only (credits-guard.test.ts).

type Client = SupabaseClient;

const OVERAGE = 'credit_overage';
const PREFS = 'team_billing_prefs';

/** Failed charges after which the team must pay before going past its credits again. */
export const MAX_OVERAGE_ATTEMPTS = 3;

/** The team's cap and what it used past its credits this window. Null when the
 *  team cannot go past its credits (not paying), or the rows cannot be read. */
export async function readOverageState(
  client: Client,
  input: { workspaceId: string; team: TeamForAllowance; windowStart: string; windowEnd: string }
): Promise<OverageState | null> {
  const rateKobo = overageRateKobo(input.team);
  if (rateKobo === null) return null;
  try {
    const [prefs, current, unpaid] = await Promise.all([
      client.from(PREFS).select('credit_cap_kobo').eq('workspace_id', input.workspaceId).maybeSingle(),
      client.from(OVERAGE).select('credits').eq('workspace_id', input.workspaceId).eq('window_start', input.windowStart).maybeSingle(),
      client
        .from(OVERAGE)
        .select('window_start')
        .eq('workspace_id', input.workspaceId)
        .eq('status', 'failed')
        .gte('attempts', MAX_OVERAGE_ATTEMPTS)
        .limit(1),
    ]);
    if (prefs.error || current.error) return null;
    // An older window that could not be charged stops paid credits until it is paid.
    const blocked = (unpaid.data ?? []).length > 0;
    const capKobo = blocked ? 0 : Number((prefs.data as { credit_cap_kobo?: number } | null)?.credit_cap_kobo) || 0;
    const credits = Number((current.data as { credits?: number } | null)?.credits) || 0;
    return buildOverageState({ rateKobo, capKobo, credits, windowStart: input.windowStart, windowEnd: input.windowEnd });
  } catch (error) {
    console.error('[overage] could not read:', error);
    return null;
  }
}

/** Add credits used past the allowance to this window. Never throws. */
export async function recordOverage(
  client: Client,
  input: { workspaceId: string; state: OverageState; credits: number; requestId: string }
): Promise<void> {
  if (input.credits <= 0) return;
  try {
    const { error } = await client.rpc('add_credit_overage', {
      p_workspace: input.workspaceId,
      p_window: input.state.windowStart,
      p_window_end: input.state.windowEnd,
      p_credits: Math.floor(input.credits),
      p_rate_kobo: input.state.rateKobo,
    });
    if (error) console.error(`[overage] LOST OVERAGE: ${input.credits} credits for ${input.requestId}:`, error.message);
  } catch (error) {
    console.error(`[overage] LOST OVERAGE: ${input.credits} credits for ${input.requestId}:`, error);
  }
}

/** The cap and card for the settings screen. */
export async function readCreditCap(client: Client, workspaceId: string): Promise<number> {
  const prefs = await client.from(PREFS).select('credit_cap_kobo').eq('workspace_id', workspaceId).maybeSingle();
  return Number((prefs.data as { credit_cap_kobo?: number } | null)?.credit_cap_kobo) || 0;
}

export async function writeCreditCap(
  client: Client,
  input: { workspaceId: string; capKobo: number; actorUserId: string }
): Promise<boolean> {
  const result = await client.from(PREFS).upsert(
    { workspace_id: input.workspaceId, credit_cap_kobo: input.capKobo, updated_by: input.actorUserId, updated_at: new Date().toISOString() },
    { onConflict: 'workspace_id' }
  );
  if (result.error) {
    console.error('[overage] could not save the cap:', result.error.message);
    return false;
  }
  return true;
}

export type OverageRunSummary = { windows: number; charged: number; failed: number; chargedKobo: number };

/** The daily run: charge every ended window with credits past the allowance to
 *  the team's saved card. `loadCard` is passed in so this module does not reach
 *  into add-ons. */
export async function chargeEndedOverage(
  client: Client,
  loadCard: (workspaceId: string) => Promise<import('../paystack-server').SavedCard | null>,
  now: Date = new Date(),
  /** One team paying now from its settings: no daily spacing, no attempt limit. */
  only?: { workspaceId: string }
): Promise<OverageRunSummary> {
  const summary: OverageRunSummary = { windows: 0, charged: 0, failed: 0, chargedKobo: 0 };
  let query = client
    .from(OVERAGE)
    .select('workspace_id, window_start, credits, rate_kobo, status, attempts, updated_at')
    .in('status', ['open', 'failed'])
    .lte('window_end', now.toISOString());
  query = only ? query.eq('workspace_id', only.workspaceId) : query.lt('attempts', MAX_OVERAGE_ATTEMPTS + 4);
  const due = await query.limit(200);
  if (due.error) {
    console.error('[overage] run read failed:', due.error.message);
    return summary;
  }
  for (const raw of (due.data ?? []) as Array<Record<string, unknown>>) {
    const workspaceId = String(raw.workspace_id);
    const windowStart = String(raw.window_start);
    const credits = Number(raw.credits) || 0;
    const rateKobo = Number(raw.rate_kobo) || 0;
    // Retry a failed charge once a day.
    if (!only && raw.status === 'failed' && now.getTime() - new Date(String(raw.updated_at)).getTime() < 20 * 3_600_000) continue;
    summary.windows += 1;
    const key = { workspace_id: workspaceId, window_start: windowStart };
    if (credits <= 0 || rateKobo <= 0) {
      await client.from(OVERAGE).update({ status: 'paid', charged_kobo: 0, charged_at: now.toISOString() }).match(key);
      continue;
    }
    const cap = await readCreditCap(client, workspaceId);
    const amountKobo = overageCostKobo(credits, rateKobo, cap > 0 ? cap : credits * rateKobo);
    const attempts = (Number(raw.attempts) || 0) + 1;
    const reference = `${OVERAGE_REFERENCE_PREFIX}${randomBytes(12).toString('hex')}`;
    const fail = async (why: string) => {
      summary.failed += 1;
      await client.from(OVERAGE).update({ status: 'failed', attempts, reference, updated_at: now.toISOString() }).match(key);
      await logBillingEvent(client, {
        workspaceId,
        ownerUserId: null,
        actorUserId: null,
        type: 'credit_overage_failed',
        metadata: { reference, credits, amountNaira: amountKobo / 100, why, attempts },
      });
    };
    const card = await loadCard(workspaceId);
    if (!card) {
      await fail('no saved card');
      continue;
    }
    const charged = await chargeSavedCard({
      card,
      amountKobo,
      reference,
      metadata: { source: 'credit_overage', workspace_id: workspaceId, window_start: windowStart, credits },
    });
    if (!charged.ok) {
      await fail(charged.message);
      continue;
    }
    const verified = await verifyPaystackTransaction(reference);
    if (!verified.ok || verified.data.status !== 'success' || verified.data.requestedAmountKobo !== amountKobo) {
      await fail(verified.ok ? `status ${verified.data.status}` : verified.message);
      continue;
    }
    await client
      .from(OVERAGE)
      .update({ status: 'paid', attempts, reference, charged_kobo: amountKobo, charged_at: now.toISOString(), updated_at: now.toISOString() })
      .match(key);
    summary.charged += 1;
    summary.chargedKobo += amountKobo;
    await logBillingEvent(client, {
      workspaceId,
      ownerUserId: null,
      actorUserId: null,
      type: 'credit_overage_charged',
      metadata: { reference, credits, amountNaira: amountKobo / 100, windowStart },
    });
  }
  return summary;
}
