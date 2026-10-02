import type { SupabaseClient } from '@supabase/supabase-js';
import { logBillingEvent } from '../billing-events-server';
import { verifyPaystackTransaction } from '../paystack-server';
import { creditPurchase } from './credits-server';
import { checkPurchase } from './purchase';

/**
 * Settle a credits checkout: ask Paystack whether it was paid, and if so put the
 * credits on the ledger once. Called from the signed webhook and from the page
 * the person lands on after paying, in either order, any number of times. The
 * ledger's key on the reference is what makes that safe.
 *
 * Nothing is credited on the word of the caller. The webhook body and the
 * callback's query string are claims; the answer comes from Paystack's own
 * record of the transaction (verifyPaystackTransaction), checked against the pack
 * table by checkPurchase.
 *
 * `transient` separates "try again" from "it is wrong": a Paystack that is slow
 * or down answers transient so the webhook returns 500 and Paystack redelivers,
 * where a mismatch is recorded and left for a person to look at, because
 * redelivering it would only repeat the answer.
 */
export type SettleOutcome =
  | { state: 'credited'; credits: number }
  | { state: 'not_paid' }
  | { state: 'mismatch' }
  | { state: 'error'; transient: boolean };

export async function settleCreditsPurchase(
  admin: SupabaseClient,
  reference: string,
  via: 'webhook' | 'callback'
): Promise<SettleOutcome> {
  const verified = await verifyPaystackTransaction(reference);
  if (!verified.ok) {
    return { state: 'error', transient: verified.transient };
  }

  const decision = checkPurchase({
    status: verified.data.status,
    currency: verified.data.currency,
    amountKobo: verified.data.amountKobo,
    metadata: verified.data.metadata,
  });

  if (!decision.ok) {
    if (decision.reason === 'mismatch') {
      // Money may have arrived that matches no pack. Loud, so it is found.
      console.error(
        `[credits-purchase] MISMATCH on ${reference} (${via}): paid ${verified.data.amountKobo} ${verified.data.currency}, status ${verified.data.status}`
      );
    }
    return { state: decision.reason };
  }

  const result = await creditPurchase(admin, {
    workspaceId: decision.workspaceId,
    ownerUserId: decision.ownerUserId,
    actorUserId: decision.userId,
    credits: decision.credits,
    reference,
    priceNaira: decision.priceNaira,
  });
  if (result === 'error') {
    // The money is taken and the ledger write failed: retry, never drop it.
    console.error(`[credits-purchase] PAID BUT NOT CREDITED: ${reference} (${via})`);
    return { state: 'error', transient: true };
  }

  // Best effort, and only for the settle that actually added the credits, so a
  // webhook and a callback racing do not record one purchase twice.
  if (result === 'credited') {
    await logBillingEvent(admin, {
      workspaceId: decision.workspaceId,
      ownerUserId: decision.ownerUserId,
      actorUserId: decision.userId,
      type: 'credits_purchased',
      metadata: { reference, credits: decision.credits, priceNaira: decision.priceNaira, via },
    });
  }

  return { state: 'credited', credits: decision.credits };
}
