/**
 * The low-balance signal (2026-10-24). Every plan since 17 Oct failed with
 * `insufficient_balance` on RodiumAi and nobody was told: the wallet is ours,
 * not the team's, so the only person who can fix it is the founder.
 *
 * When a gateway call fails for an empty wallet this logs a loud line every
 * time and, at most once a day across ALL teams, emails the founder through the
 * existing billing-alert mail (Resend, free plan; no new service). The event row
 * in billing_events is the dedupe ledger, as for every founder alert.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyAiFailure } from './gateway-error';
import { notifyFounder } from '../billing-alerts-server';

export const WALLET_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** True when a gateway error means the AI wallet itself is empty. */
export function isWalletEmptyError(error: unknown): boolean {
  return classifyAiFailure(error).kind === 'insufficient_balance';
}

/** Pure: may we email again? */
export function shouldSendWalletAlert(lastAlertAtIso: string | null, now: Date): boolean {
  if (!lastAlertAtIso) return true;
  const last = Date.parse(lastAlertAtIso);
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= WALLET_ALERT_COOLDOWN_MS;
}

async function lastWalletAlertAt(admin: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('billing_events')
      .select('created_at')
      .eq('type', 'ai_wallet_empty')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { created_at: string | null }).created_at ?? null;
  } catch {
    return null;
  }
}

/** Never throws. */
export async function reportAiWalletEmpty(
  admin: SupabaseClient,
  input: { feature: string; workspaceId: string | null; ownerUserId: string | null; actorUserId: string | null; now?: Date }
): Promise<void> {
  console.error(`[ai-wallet] RodiumAi balance is empty: ${input.feature} fell back. Top up the AI wallet.`);
  try {
    if (!input.workspaceId) return;
    const now = input.now ?? new Date();
    if (!shouldSendWalletAlert(await lastWalletAlertAt(admin), now)) return;
    await notifyFounder(admin, {
      kind: 'ai_wallet_empty',
      workspaceId: input.workspaceId,
      ownerUserId: input.ownerUserId,
      actorUserId: input.actorUserId,
      note: `${input.feature} hit insufficient_balance on the AI gateway. Plans fall back to the quick plan until the wallet is topped up.`,
      metadata: { feature: input.feature },
    });
  } catch {
    // The log line above is the floor.
  }
}
