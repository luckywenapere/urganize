/**
 * Curator pitch payments, server side: reading prices, settling a paid
 * checkout, the 15-minute sweep, refunds, the daily reconcile, notifications
 * and founder alerts. The routes are thin callers of this module.
 *
 * Everything here uses the service-role client. Three rules hold throughout,
 * and each one is the reason something below looks the way it does:
 *
 *   * NOTHING IS MARKED PAID ON A CLIENT'S WORD. Only a transaction Paystack
 *     confirms through transaction/verify, checked against the quote to the
 *     kobo inside settle_pitch_quote(), moves a pitch to a curator.
 *
 *   * MONEY-SETTLING PATHS ARE NOT BEHIND THE FEATURE FLAG. The webhook branch,
 *     the sweep and the refunds run whether or not NEXT_PUBLIC_FEATURE_PITCH_
 *     PAYMENTS is on, the cancel-trial precedent: if the flag is switched off
 *     after a real pitch was paid, the refund it is owed must still happen.
 *     With the flag off and nothing ever paid, all of it finds no rows.
 *
 *   * NOTHING HERE THROWS INTO A CALLER. A failed notification, alert or cache
 *     write is logged and swallowed; money state lives in the database and is
 *     never left half-written by a side effect failing after it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MAX_REFUND_ATTEMPTS,
  PITCH_REMINDER_LEAD_HOURS,
  STRIKE_LIMIT,
  STRIKE_WINDOW_DAYS,
  allocatePaystackFee,
  findUnrecordedRefund,
  formatNaira,
  isPitchPaymentReference,
  paymentEventKey,
  resolveCuratorPaymentState,
  type CuratorPaymentState,
  type QuoteLine,
} from './pitch-payments';
import {
  INBOX_PAUSED,
  acceptedLine,
  autoRefundLine,
  formatPitchDeadline,
  inboxCard,
  missedWindowLine,
  passedLine,
  reminderLine,
} from './pitch-payment-copy';
import {
  createPaystackRefund,
  listPaystackBanks,
  listPaystackRefunds,
  listPaystackTransactions,
  verifyPaystackTransaction,
  type PaystackBank,
} from './paystack-server';
import { sendPushToUsers } from './push-server';
import { sendEmail } from './email';
import { logBillingEvent } from './billing-events-server';

export const PITCHES_TABLE = 'playlist_pitches';
export const CURATOR_PROFILES_TABLE = 'curator_profiles';
export const PAYOUT_ACCOUNTS_TABLE = 'curator_payout_accounts';
export const PRICING_TABLE = 'curator_pricing';
export const QUOTES_TABLE = 'pitch_quotes';
export const PAYMENTS_TABLE = 'pitch_payments';
export const RECOVERIES_TABLE = 'curator_recoveries';
export const STRIKES_TABLE = 'curator_strikes';
export const PAYMENT_EVENTS_TABLE = 'payment_events';
export const RESOLVE_ATTEMPTS_TABLE = 'payout_resolve_attempts';
const APP_SETTINGS_TABLE = 'app_settings';
const BANKS_SETTINGS_KEY = 'paystack_banks_ng';
const BANKS_TTL_MS = 24 * 60 * 60 * 1000;

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://app.urganize.app').replace(/\/$/, '');

// ─── who is who ──────────────────────────────────────────────────────────────

async function loadUserContact(
  admin: SupabaseClient,
  userId: string
): Promise<{ email: string | null; name: string }> {
  let email: string | null = null;
  let name = '';
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    email = data?.user?.email?.trim() || null;
  } catch {
    // No email means no email notice; push may still reach them.
  }
  try {
    const { data } = await admin.from('profiles').select('name').eq('id', userId).maybeSingle();
    name = typeof data?.name === 'string' ? data.name.trim() : '';
  } catch {
    // A name is a nicety.
  }
  return { email, name };
}

// ─── prices ──────────────────────────────────────────────────────────────────

/**
 * What each curator charges right now. Fails OPEN to free: if the payment
 * tables cannot be read, every curator reads as taking free pitches, so a
 * database blip can never stop the free pitching that works today. The cost of
 * being wrong that way is one free pitch to a curator who charges, which is
 * cheap and visible; failing closed would stop pitching altogether.
 */
export async function loadCuratorPaymentStates(
  admin: SupabaseClient,
  curatorUserIds: string[]
): Promise<Map<string, CuratorPaymentState>> {
  const states = new Map<string, CuratorPaymentState>();
  const ids = Array.from(new Set(curatorUserIds.filter(Boolean)));
  if (!ids.length) return states;

  try {
    const [profiles, pricing, accounts] = await Promise.all([
      admin.from(CURATOR_PROFILES_TABLE).select('user_id,inbox_paused_at').in('user_id', ids),
      admin
        .from(PRICING_TABLE)
        .select('curator_user_id,pitch_price_kobo,response_window_hours,is_live')
        .in('curator_user_id', ids),
      admin
        .from(PAYOUT_ACCOUNTS_TABLE)
        .select('id,curator_user_id,status,paystack_subaccount_code')
        .in('curator_user_id', ids)
        .eq('status', 'active'),
    ]);

    if (profiles.error || pricing.error || accounts.error) {
      console.warn('[pitch-payments] could not read curator prices; treating as free', {
        profiles: profiles.error?.message,
        pricing: pricing.error?.message,
        accounts: accounts.error?.message,
      });
      return states;
    }

    const pausedBy = new Map<string, string | null>();
    for (const row of (profiles.data || []) as Array<Record<string, unknown>>) {
      pausedBy.set(String(row.user_id), (row.inbox_paused_at as string | null) ?? null);
    }
    const pricingBy = new Map<string, { pitch_price_kobo: number; response_window_hours: number; is_live: boolean }>();
    for (const row of (pricing.data || []) as Array<Record<string, unknown>>) {
      pricingBy.set(String(row.curator_user_id), {
        pitch_price_kobo: Number(row.pitch_price_kobo) || 0,
        response_window_hours: Number(row.response_window_hours) || 0,
        is_live: row.is_live === true,
      });
    }
    const accountBy = new Map<string, { id: string; status: string; paystack_subaccount_code: string | null }>();
    for (const row of (accounts.data || []) as Array<Record<string, unknown>>) {
      accountBy.set(String(row.curator_user_id), {
        id: String(row.id),
        status: String(row.status),
        paystack_subaccount_code: (row.paystack_subaccount_code as string | null) ?? null,
      });
    }

    for (const id of ids) {
      states.set(
        id,
        resolveCuratorPaymentState({
          curatorUserId: id,
          inboxPausedAt: pausedBy.get(id) ?? null,
          pricing: pricingBy.get(id) ?? null,
          payoutAccount: accountBy.get(id) ?? null,
        })
      );
    }
  } catch (error) {
    console.warn('[pitch-payments] curator price read threw; treating as free', error);
  }
  return states;
}

/**
 * What each curator still owes and is not already reserved by another open
 * checkout. Reserving matters: two checkouts made minutes apart for one
 * curator must not both take the same debt off their share, or the curator is
 * short-paid for money they never owed. Open recoveries minus what unexpired,
 * unpaid quotes have already claimed.
 */
export async function loadRecoveryAvailable(
  admin: SupabaseClient,
  curatorUserIds: string[],
  now: Date
): Promise<Map<string, number>> {
  const available = new Map<string, number>();
  const ids = Array.from(new Set(curatorUserIds.filter(Boolean)));
  if (!ids.length) return available;

  const { data: recoveries, error } = await admin
    .from(RECOVERIES_TABLE)
    .select('curator_user_id,owed_kobo,recovered_kobo')
    .in('curator_user_id', ids)
    .eq('status', 'open');
  if (error) {
    // Not recovering this time is the safe direction: the debt stays open and
    // is taken next time, rather than guessed at now.
    console.warn('[pitch-payments] could not read recoveries', error.message);
    return available;
  }

  for (const row of (recoveries || []) as Array<Record<string, unknown>>) {
    const id = String(row.curator_user_id);
    const open = Math.max(0, (Number(row.owed_kobo) || 0) - (Number(row.recovered_kobo) || 0));
    available.set(id, (available.get(id) ?? 0) + open);
  }
  if (!available.size) return available;

  const { data: quotes } = await admin
    .from(QUOTES_TABLE)
    .select('lines')
    .in('status', ['open', 'checkout_started'])
    .gt('expires_at', now.toISOString());

  for (const quote of (quotes || []) as Array<Record<string, unknown>>) {
    const lines = Array.isArray(quote.lines) ? (quote.lines as Array<Record<string, unknown>>) : [];
    for (const line of lines) {
      const id = String(line.curator_user_id || '');
      const reserved = Number(line.recovery_applied_kobo) || 0;
      if (reserved > 0 && available.has(id)) {
        available.set(id, Math.max(0, (available.get(id) ?? 0) - reserved));
      }
    }
  }
  return available;
}

// ─── settling a paid checkout ────────────────────────────────────────────────

export type SettleOutcome =
  | { state: 'settled'; quoteId: string; newlySettled: boolean }
  | { state: 'not_paid'; paystackStatus: string }
  | { state: 'needs_review'; quoteId: string; reason: string }
  | { state: 'not_found' }
  | { state: 'error'; message: string; transient: boolean };

/**
 * From "Paystack says this reference was paid" to "the pitches are in the
 * curators' inboxes". Called by the webhook, by the callback page and by the
 * daily reconcile, and idempotent across all three: settle_pitch_quote() takes
 * a row lock and answers 'already_settled' the second time, so only the first
 * caller sends notifications.
 */
export async function settlePitchCheckout(
  admin: SupabaseClient,
  reference: string,
  source: 'webhook' | 'callback' | 'reconcile'
): Promise<SettleOutcome> {
  if (!isPitchPaymentReference(reference)) return { state: 'not_found' };

  const { data: quote, error } = await admin
    .from(QUOTES_TABLE)
    .select('id,status,lines,total_kobo,payer_user_id,owner_user_id,workspace_id,release_id,paystack_reference')
    .eq('paystack_reference', reference)
    .maybeSingle();
  if (error) return { state: 'error', message: error.message, transient: true };
  if (!quote) return { state: 'not_found' };

  const quoteRow = quote as Record<string, unknown>;
  const quoteId = String(quoteRow.id);
  if (quoteRow.status === 'paid') return { state: 'settled', quoteId, newlySettled: false };
  if (quoteRow.status === 'needs_review') {
    return { state: 'needs_review', quoteId, reason: 'already_in_review' };
  }

  const verified = await verifyPaystackTransaction(reference);
  if (!verified.ok) return { state: 'error', message: verified.message, transient: verified.transient };
  if (verified.data.status !== 'success') {
    return { state: 'not_paid', paystackStatus: verified.data.status || 'unknown' };
  }

  const lines = Array.isArray(quoteRow.lines) ? (quoteRow.lines as QuoteLine[]) : [];
  const allocation = allocatePaystackFee(verified.data.feesKobo, lines);

  const { data: result, error: rpcError } = await admin.rpc('settle_pitch_quote', {
    p_quote_id: quoteId,
    p_amount_kobo: verified.data.amountKobo,
    p_currency: verified.data.currency,
    p_transaction_id: verified.data.transactionId,
    p_paid_at: verified.data.paidAt || new Date().toISOString(),
    p_fee_allocation: allocation,
  });
  if (rpcError) return { state: 'error', message: rpcError.message, transient: true };

  const outcome = (result || {}) as Record<string, unknown>;
  switch (outcome.result) {
    case 'settled': {
      const pitchIds = Array.isArray(outcome.pitch_ids) ? (outcome.pitch_ids as string[]) : [];
      await notifyCuratorsOfPaidPitches(admin, pitchIds);
      const unmatched = Array.isArray(outcome.recovery_unmatched)
        ? (outcome.recovery_unmatched as Array<Record<string, unknown>>)
        : [];
      if (unmatched.length) {
        await alertFounderPitchPayments(admin, {
          kind: 'pitch_recovery_unmatched',
          subject: 'Recovery over-collected',
          headline:
            'A paid checkout took more off a curator share than they still owed, because two checkouts raced. The split already happened, so the extra needs paying back by hand.',
          facts: [
            ['Reference', reference],
            ...unmatched.map(
              (entry, index) =>
                [`Payment ${index + 1}`, `${String(entry.payment_id)} · ${formatNaira(Number(entry.amount_kobo) || 0)}`] as [
                  string,
                  string,
                ]
            ),
          ],
          metadata: { reference, unmatched, source },
        });
      }
      return { state: 'settled', quoteId, newlySettled: true };
    }
    case 'already_settled':
      return { state: 'settled', quoteId, newlySettled: false };
    case 'amount_mismatch':
    case 'pitch_state_changed': {
      const reason = String(outcome.result);
      await alertFounderPitchPayments(admin, {
        kind: 'pitch_payment_needs_review',
        subject: 'Paid checkout needs review',
        headline:
          reason === 'amount_mismatch'
            ? 'Paystack confirmed a payment that does not match its quote. No pitch was sent. Refund or settle it by hand from the admin page.'
            : 'A payment arrived for pitches that were no longer waiting for payment, most likely paid twice. No pitch was sent. Refund the duplicate from the admin page.',
          facts: [
            ['Reference', reference],
            ['Expected', formatNaira(Number(quoteRow.total_kobo) || 0)],
            ['Received', formatNaira(verified.data.amountKobo)],
            ['Currency', verified.data.currency || 'unknown'],
            ['Found by', source],
          ],
          metadata: { reference, outcome, source },
          workspaceId: (quoteRow.workspace_id as string | null) ?? null,
        });
      return { state: 'needs_review', quoteId, reason };
    }
    case 'needs_review':
      return { state: 'needs_review', quoteId, reason: 'already_in_review' };
    case 'not_found':
      return { state: 'not_found' };
    default:
      return { state: 'error', message: `Unexpected settle answer: ${String(outcome.result)}`, transient: false };
  }
}

// ─── webhook events ──────────────────────────────────────────────────────────

/**
 * Records a Paystack event BEFORE it is processed. Returns whether it was
 * already processed, which is the only case a redelivery is skipped: a row that
 * exists but never finished is processed again, so a failed attempt that
 * answered 500 is genuinely retried rather than swallowed by the dedupe.
 */
export async function recordPaymentEvent(
  admin: SupabaseClient,
  event: string,
  data: Record<string, unknown>
): Promise<{ id: string | null; alreadyProcessed: boolean }> {
  const eventKey = paymentEventKey(event, data);
  const reference =
    typeof data.reference === 'string'
      ? data.reference
      : typeof data.transaction_reference === 'string'
        ? data.transaction_reference
        : null;

  const { error: insertError } = await admin
    .from(PAYMENT_EVENTS_TABLE)
    .upsert(
      { event, event_key: eventKey, paystack_reference: reference, payload: data },
      { onConflict: 'event,event_key', ignoreDuplicates: true }
    );
  if (insertError) {
    console.warn('[pitch-payments] could not record payment event', insertError.message);
    return { id: null, alreadyProcessed: false };
  }

  const { data: row } = await admin
    .from(PAYMENT_EVENTS_TABLE)
    .select('id,processed_at')
    .eq('event', event)
    .eq('event_key', eventKey)
    .maybeSingle();
  const record = row as Record<string, unknown> | null;
  return { id: record ? String(record.id) : null, alreadyProcessed: Boolean(record?.processed_at) };
}

export async function finishPaymentEvent(
  admin: SupabaseClient,
  id: string | null,
  error?: string | null
): Promise<void> {
  if (!id) return;
  try {
    await admin
      .from(PAYMENT_EVENTS_TABLE)
      .update(error ? { process_error: error.slice(0, 500) } : { processed_at: new Date().toISOString(), process_error: null })
      .eq('id', id);
  } catch {
    // The event row is bookkeeping; the money state is already right.
  }
}

/**
 * charge.success for a pitch checkout. Answers the HTTP status the webhook
 * should return: 500 only for a transient failure, so Paystack redelivers.
 * Everything settle-able is settled, and everything that needs a human is
 * parked, with 200.
 */
export async function handlePitchChargeEvent(
  admin: SupabaseClient,
  data: Record<string, unknown>
): Promise<{ status: number; body: Record<string, unknown> }> {
  const reference = String(data.reference || '');
  const recorded = await recordPaymentEvent(admin, 'charge.success', data);
  if (recorded.alreadyProcessed) {
    return { status: 200, body: { received: true, matched: 'pitch_checkout', duplicate: true } };
  }

  const outcome = await settlePitchCheckout(admin, reference, 'webhook');
  if (outcome.state === 'error' && outcome.transient) {
    await finishPaymentEvent(admin, recorded.id, outcome.message);
    return { status: 500, body: { error: 'Could not settle the pitch checkout. Please redeliver.' } };
  }
  await finishPaymentEvent(admin, recorded.id, outcome.state === 'error' ? outcome.message : null);
  return { status: 200, body: { received: true, matched: 'pitch_checkout', state: outcome.state } };
}

/**
 * refund.processed / refund.failed for a pitch checkout. Refunds from any other
 * flow (the card-trial check) are left alone and acknowledged.
 *
 * Matched on the transaction reference and the amount, oldest pending first:
 * Paystack's refund webhook does not reliably carry the refund id we stored,
 * and two pitches refunded from one checkout for the same price are
 * interchangeable for this purpose (same money, same transaction).
 */
export async function handlePitchRefundEvent(
  admin: SupabaseClient,
  event: string,
  data: Record<string, unknown>
): Promise<{ status: number; body: Record<string, unknown> }> {
  const reference = String(data.transaction_reference || data.reference || '');
  if (!isPitchPaymentReference(reference)) {
    return { status: 200, body: { received: true, event, matched: false } };
  }

  const recorded = await recordPaymentEvent(admin, event, data);
  if (recorded.alreadyProcessed) {
    return { status: 200, body: { received: true, event, duplicate: true } };
  }

  if (event !== 'refund.processed' && event !== 'refund.failed') {
    await finishPaymentEvent(admin, recorded.id);
    return { status: 200, body: { received: true, event, logged: true } };
  }

  const amountKobo = Number(data.amount) || 0;
  const refundId = Number(data.id);
  let paymentId: string | null = null;

  if (Number.isFinite(refundId) && refundId > 0) {
    const { data: byId } = await admin
      .from(PAYMENTS_TABLE)
      .select('id')
      .eq('paystack_refund_id', refundId)
      .maybeSingle();
    paymentId = byId ? String((byId as Record<string, unknown>).id) : null;
  }
  if (!paymentId) {
    const { data: byAmount } = await admin
      .from(PAYMENTS_TABLE)
      .select('id')
      .eq('paystack_reference', reference)
      .eq('status', 'refund_pending')
      .eq('price_kobo', amountKobo)
      .order('refund_requested_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    paymentId = byAmount ? String((byAmount as Record<string, unknown>).id) : null;
  }

  if (!paymentId) {
    console.warn('[pitch-payments] refund event matched no pending payment', { event, reference, amountKobo });
    await finishPaymentEvent(admin, recorded.id, 'no matching payment');
    return { status: 200, body: { received: true, event, matched: false } };
  }

  if (event === 'refund.processed') {
    await admin
      .from(PAYMENTS_TABLE)
      .update({ status: 'refunded', refunded_at: new Date().toISOString(), refund_last_error: null })
      .eq('id', paymentId)
      .in('status', ['refund_pending', 'refund_failed']);
  } else {
    const { data: flipped } = await admin
      .from(PAYMENTS_TABLE)
      .update({ status: 'refund_failed', refund_last_error: 'Paystack reported the refund failed.' })
      .eq('id', paymentId)
      .eq('status', 'refund_pending')
      .select('id,price_kobo,paystack_reference,song_title,curator_name')
      .maybeSingle();
    if (flipped) {
      const row = flipped as Record<string, unknown>;
      await alertFounderPitchPayments(admin, {
        kind: 'pitch_refund_failed',
        subject: 'Refund failed',
        headline:
          'Paystack says a missed-window refund failed. The artist has not been paid back. Refund them by hand, then mark it refunded on the admin page.',
        facts: [
          ['Reference', String(row.paystack_reference)],
          ['Amount', formatNaira(Number(row.price_kobo) || 0)],
          ['Song', String(row.song_title || '')],
          ['Curator', String(row.curator_name || '')],
        ],
        metadata: { reference, paymentId, event },
      });
    }
  }

  await finishPaymentEvent(admin, recorded.id);
  return { status: 200, body: { received: true, event, matched: true } };
}

// ─── refunds ─────────────────────────────────────────────────────────────────

type RefundablePayment = {
  id: string;
  price_kobo: number;
  paystack_reference: string;
  refund_attempts: number;
  paystack_refund_id: number | null;
};

/**
 * Ask Paystack to refund one paid pitch in full. A partial refund on the
 * checkout's transaction, because one checkout can carry several pitches and
 * only this one is being refunded.
 *
 * A RETRY READS PAYSTACK FIRST. If an earlier attempt reached Paystack but our
 * record of it failed to save, asking again would refund the artist twice: a
 * partial refund on a multi-pitch checkout succeeds a second time as long as
 * money remains on the transaction. So on any attempt after the first, an
 * unrecorded refund of the same amount is adopted instead of created.
 */
export async function requestPitchRefund(
  admin: SupabaseClient,
  payment: RefundablePayment,
  notes: { merchantNote: string; customerNote: string }
): Promise<{ ok: boolean; error?: string }> {
  if (payment.paystack_refund_id) return { ok: true };

  if (payment.refund_attempts > 0) {
    const [existing, siblings] = await Promise.all([
      listPaystackRefunds(payment.paystack_reference),
      admin
        .from(PAYMENTS_TABLE)
        .select('paystack_refund_id')
        .eq('paystack_reference', payment.paystack_reference)
        .not('paystack_refund_id', 'is', null),
    ]);
    if (existing.ok) {
      const recordedIds = ((siblings.data || []) as Array<Record<string, unknown>>).map((row) =>
        Number(row.paystack_refund_id)
      );
      const adopted = findUnrecordedRefund(existing.data, recordedIds, payment.price_kobo);
      if (adopted) {
        await admin
          .from(PAYMENTS_TABLE)
          .update({ paystack_refund_id: adopted, refund_last_error: null })
          .eq('id', payment.id);
        return { ok: true };
      }
    } else if (existing.transient) {
      // Cannot tell whether a refund already exists, so do not risk a second
      // one. Try again on the next run.
      return { ok: false, error: existing.message };
    }
  }

  // Count the attempt BEFORE calling Paystack, so a crash between the call and
  // the write still marks this as a retry and the next run checks first.
  await admin
    .from(PAYMENTS_TABLE)
    .update({ refund_attempts: payment.refund_attempts + 1 })
    .eq('id', payment.id);

  const refund = await createPaystackRefund({
    reference: payment.paystack_reference,
    amountKobo: payment.price_kobo,
    merchantNote: notes.merchantNote,
    customerNote: notes.customerNote,
  });

  if (!refund.ok) {
    await admin
      .from(PAYMENTS_TABLE)
      .update({ refund_last_error: refund.message.slice(0, 500) })
      .eq('id', payment.id);
    return { ok: false, error: refund.message };
  }

  await admin
    .from(PAYMENTS_TABLE)
    .update({ paystack_refund_id: refund.data.refundId, refund_last_error: null })
    .eq('id', payment.id);
  return { ok: true };
}

// ─── the 15-minute sweep ─────────────────────────────────────────────────────

export type WindowSweepResult = {
  expired: number;
  refundsRequested: number;
  refundsFailed: number;
  reminders: number;
  paused: number;
  errors: string[];
};

const SWEEP_BATCH = 100;

/**
 * Expire every paid pitch whose window has closed, refund it, retry refunds
 * that failed, and send the one-day reminders. Runs every 15 minutes from
 * Supabase pg_cron and once a day from the Vercel cron as a backstop; running
 * both, or running twice, is harmless because every step is conditional.
 */
export async function runPitchWindowSweep(admin: SupabaseClient, now: Date = new Date()): Promise<WindowSweepResult> {
  const result: WindowSweepResult = { expired: 0, refundsRequested: 0, refundsFailed: 0, reminders: 0, paused: 0, errors: [] };

  try {
    // 1. Missed windows.
    const { data: due, error: dueError } = await admin
      .from(PITCHES_TABLE)
      .select('id')
      .eq('payment_kind', 'paid')
      .in('status', ['new', 'listened'])
      .lte('response_due_at', now.toISOString())
      .order('response_due_at', { ascending: true })
      .limit(SWEEP_BATCH);
    if (dueError) throw new Error(dueError.message);

    for (const row of (due || []) as Array<Record<string, unknown>>) {
      const pitchId = String(row.id);
      const { data: expiry, error: expiryError } = await admin.rpc('expire_paid_pitch', {
        p_pitch_id: pitchId,
        p_now: now.toISOString(),
        p_strike_limit: STRIKE_LIMIT,
        p_strike_window_days: STRIKE_WINDOW_DAYS,
      });
      if (expiryError) {
        result.errors.push(`expire ${pitchId}: ${expiryError.message}`);
        continue;
      }
      const outcome = (expiry || {}) as Record<string, unknown>;
      if (outcome.result !== 'expired') continue;
      result.expired += 1;

      const paymentId = String(outcome.payment_id || '');
      const { data: payment } = await admin
        .from(PAYMENTS_TABLE)
        .select('id,price_kobo,paystack_reference,refund_attempts,paystack_refund_id,curator_share_kobo,curator_name,song_title')
        .eq('id', paymentId)
        .maybeSingle();
      if (payment) {
        const row = payment as Record<string, unknown>;
        const refund = await requestPitchRefund(
          admin,
          {
            id: String(row.id),
            price_kobo: Number(row.price_kobo) || 0,
            paystack_reference: String(row.paystack_reference || ''),
            refund_attempts: Number(row.refund_attempts) || 0,
            paystack_refund_id: (row.paystack_refund_id as number | null) ?? null,
          },
          {
            merchantNote: 'Curator missed the reply window. Automatic refund.',
            customerNote: 'The curator did not reply in time, so this pitch is refunded.',
          }
        );
        if (refund.ok) result.refundsRequested += 1;
        else result.refundsFailed += 1;
      }

      await notifyMissedWindow(admin, pitchId, Number(outcome.strike_count) || 1);
      if (outcome.paused === true) {
        result.paused += 1;
        await notifyInboxPaused(admin, String(outcome.curator_user_id || ''));
      }
    }

    // 2. Refunds that did not go through the first time.
    const { data: pending } = await admin
      .from(PAYMENTS_TABLE)
      .select('id,price_kobo,paystack_reference,refund_attempts,paystack_refund_id,song_title,curator_name')
      .eq('status', 'refund_pending')
      .is('paystack_refund_id', null)
      .order('refund_requested_at', { ascending: true })
      .limit(SWEEP_BATCH);

    for (const row of (pending || []) as Array<Record<string, unknown>>) {
      const attempts = Number(row.refund_attempts) || 0;
      if (attempts === 0) continue; // just handled above, or never tried: the step above owns it
      if (attempts >= MAX_REFUND_ATTEMPTS) {
        const { data: flipped } = await admin
          .from(PAYMENTS_TABLE)
          .update({ status: 'refund_failed' })
          .eq('id', String(row.id))
          .eq('status', 'refund_pending')
          .select('id')
          .maybeSingle();
        if (flipped) {
          await alertFounderPitchPayments(admin, {
            kind: 'pitch_refund_failed',
            subject: 'Refund failed',
            headline: `A missed-window refund failed ${MAX_REFUND_ATTEMPTS} times. The artist has not been paid back. Refund them by hand, then mark it refunded on the admin page.`,
            facts: [
              ['Reference', String(row.paystack_reference)],
              ['Amount', formatNaira(Number(row.price_kobo) || 0)],
              ['Song', String(row.song_title || '')],
              ['Curator', String(row.curator_name || '')],
            ],
            metadata: { paymentId: String(row.id) },
          });
        }
        continue;
      }
      const refund = await requestPitchRefund(
        admin,
        {
          id: String(row.id),
          price_kobo: Number(row.price_kobo) || 0,
          paystack_reference: String(row.paystack_reference || ''),
          refund_attempts: attempts,
          paystack_refund_id: null,
        },
        {
          merchantNote: 'Curator missed the reply window. Automatic refund, retried.',
          customerNote: 'The curator did not reply in time, so this pitch is refunded.',
        }
      );
      if (refund.ok) result.refundsRequested += 1;
      else result.refundsFailed += 1;
    }

    // 3. One-day reminders. Claimed with a conditional write, so a reminder
    // is sent once however many sweeps overlap.
    const leadEnd = new Date(now.getTime() + PITCH_REMINDER_LEAD_HOURS * 60 * 60 * 1000);
    const { data: soon } = await admin
      .from(PITCHES_TABLE)
      .select('id')
      .eq('payment_kind', 'paid')
      .in('status', ['new', 'listened'])
      .is('reminder_sent_at', null)
      .gt('response_due_at', now.toISOString())
      .lte('response_due_at', leadEnd.toISOString())
      .limit(SWEEP_BATCH);

    for (const row of (soon || []) as Array<Record<string, unknown>>) {
      const { data: claimed } = await admin
        .from(PITCHES_TABLE)
        .update({ reminder_sent_at: now.toISOString() })
        .eq('id', String(row.id))
        .is('reminder_sent_at', null)
        .select('id')
        .maybeSingle();
      if (!claimed) continue;
      result.reminders += 1;
      await notifyReminder(admin, String(row.id));
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  if (result.errors.length) console.warn('[pitch-payments] window sweep errors', result.errors);
  return result;
}

// ─── the daily sweep ─────────────────────────────────────────────────────────

export type DailySweepResult = {
  banksRefreshed: boolean;
  checked: number;
  repaired: number;
  mismatches: string[];
  error?: string;
};

/**
 * Reconcile the last 48 hours of Paystack pitch transactions against our
 * records, and refresh the cached bank list.
 *
 * A Paystack success with no paid quote is REPAIRED by settling it now: that
 * is a webhook we missed, and the artist has paid. A paid quote Paystack does
 * not list, or an amount that does not match, is a mismatch for the founder.
 */
export async function runPitchDailySweep(admin: SupabaseClient, now: Date = new Date()): Promise<DailySweepResult> {
  const result: DailySweepResult = { banksRefreshed: false, checked: 0, repaired: 0, mismatches: [] };

  const banks = await getNigerianBanks(admin, { refresh: true, now });
  result.banksRefreshed = Boolean(banks && banks.length);

  const from = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const seen = new Set<string>();

  try {
    for (let page = 1; page <= 10; page += 1) {
      const listed = await listPaystackTransactions({ fromIso: from.toISOString(), toIso: now.toISOString(), page });
      if (!listed.ok) {
        result.error = listed.message;
        break;
      }
      for (const transaction of listed.data.transactions) {
        if (!isPitchPaymentReference(transaction.reference)) continue;
        result.checked += 1;
        seen.add(transaction.reference);

        const { data: quote } = await admin
          .from(QUOTES_TABLE)
          .select('status,total_kobo')
          .eq('paystack_reference', transaction.reference)
          .maybeSingle();
        const row = quote as Record<string, unknown> | null;
        if (!row) {
          result.mismatches.push(`${transaction.reference}: paid at Paystack, no quote here`);
          continue;
        }
        if (row.status === 'needs_review') continue;
        if (Number(row.total_kobo) !== transaction.amountKobo) {
          result.mismatches.push(
            `${transaction.reference}: quote ${formatNaira(Number(row.total_kobo) || 0)}, Paystack ${formatNaira(transaction.amountKobo)}`
          );
          continue;
        }
        if (row.status !== 'paid') {
          const settled = await settlePitchCheckout(admin, transaction.reference, 'reconcile');
          if (settled.state === 'settled' && settled.newlySettled) result.repaired += 1;
          else if (settled.state !== 'settled') {
            result.mismatches.push(`${transaction.reference}: could not settle (${settled.state})`);
          }
        }
      }
      if (!listed.data.hasMore) break;
    }

    if (!result.error) {
      const { data: paidHere } = await admin
        .from(QUOTES_TABLE)
        .select('paystack_reference')
        .eq('status', 'paid')
        .gte('paid_at', from.toISOString());
      for (const row of (paidHere || []) as Array<Record<string, unknown>>) {
        const reference = String(row.paystack_reference || '');
        if (reference && !seen.has(reference)) {
          result.mismatches.push(`${reference}: paid here, not in Paystack's list`);
        }
      }
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  if (result.mismatches.length) {
    await alertFounderPitchPayments(admin, {
      kind: 'pitch_reconcile_mismatch',
      subject: 'Pitch payments reconcile',
      headline: `The daily check found ${result.mismatches.length} pitch payment ${result.mismatches.length === 1 ? 'mismatch' : 'mismatches'} in the last 48 hours.`,
      facts: result.mismatches.slice(0, 20).map((line, index) => [`${index + 1}`, line] as [string, string]),
      metadata: { mismatches: result.mismatches, checked: result.checked, repaired: result.repaired },
    });
  }
  return result;
}

// ─── the bank list ───────────────────────────────────────────────────────────

/**
 * Nigerian banks, cached for a day in app_settings (the spec: "cached daily").
 * A stale list is better than none, so a failed refresh keeps serving the old
 * one; null only when there has never been a list.
 */
export async function getNigerianBanks(
  admin: SupabaseClient,
  options: { refresh?: boolean; now?: Date } = {}
): Promise<PaystackBank[] | null> {
  const now = options.now ?? new Date();
  let cached: { fetchedAt: string; banks: PaystackBank[] } | null = null;

  try {
    const { data } = await admin.from(APP_SETTINGS_TABLE).select('value_json').eq('key', BANKS_SETTINGS_KEY).maybeSingle();
    const value = (data as Record<string, unknown> | null)?.value_json as Record<string, unknown> | undefined;
    if (value && Array.isArray(value.banks)) {
      cached = {
        fetchedAt: String(value.fetchedAt || ''),
        banks: (value.banks as Array<Record<string, unknown>>)
          .map((bank) => ({ code: String(bank.code || ''), name: String(bank.name || '') }))
          .filter((bank) => bank.code && bank.name),
      };
    }
  } catch {
    cached = null;
  }

  const fresh = cached && Date.parse(cached.fetchedAt) > now.getTime() - BANKS_TTL_MS;
  if (cached && fresh && !options.refresh) return cached.banks;

  const listed = await listPaystackBanks();
  if (!listed.ok || !listed.data.length) return cached?.banks ?? null;

  try {
    await admin.from(APP_SETTINGS_TABLE).upsert(
      {
        key: BANKS_SETTINGS_KEY,
        value_json: { fetchedAt: now.toISOString(), banks: listed.data },
        updated_at: now.toISOString(),
      },
      { onConflict: 'key' }
    );
  } catch {
    // Serving the list matters more than caching it.
  }
  return listed.data;
}

// ─── notifications ───────────────────────────────────────────────────────────

type PitchForNotice = {
  id: string;
  curator_user_id: string;
  created_by: string | null;
  song_title: string;
  artist_name: string;
  response_due_at: string | null;
  curator_reply: string | null;
  status: string;
};

async function loadPitchForNotice(admin: SupabaseClient, pitchId: string): Promise<PitchForNotice | null> {
  const { data } = await admin
    .from(PITCHES_TABLE)
    .select('id,curator_user_id,created_by,song_title,artist_name,response_due_at,curator_reply,status')
    .eq('id', pitchId)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    curator_user_id: String(row.curator_user_id || ''),
    created_by: row.created_by ? String(row.created_by) : null,
    song_title: String(row.song_title || ''),
    artist_name: String(row.artist_name || ''),
    response_due_at: (row.response_due_at as string | null) ?? null,
    curator_reply: (row.curator_reply as string | null) ?? null,
    status: String(row.status || ''),
  };
}

async function loadPaymentForPitch(
  admin: SupabaseClient,
  pitchId: string
): Promise<{ curatorShareKobo: number; priceKobo: number; curatorName: string } | null> {
  const { data } = await admin
    .from(PAYMENTS_TABLE)
    .select('curator_share_kobo,price_kobo,curator_name')
    .eq('pitch_id', pitchId)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    curatorShareKobo: Number(row.curator_share_kobo) || 0,
    priceKobo: Number(row.price_kobo) || 0,
    curatorName: String(row.curator_name || ''),
  };
}

async function notifyUser(
  admin: SupabaseClient,
  userId: string | null,
  notice: {
    title: string;
    body: string;
    path: string;
    tag: string;
    trigger: string;
    ctaLabel: string;
    quote?: string;
    footnote: string;
  }
): Promise<void> {
  if (!userId) return;
  try {
    await sendPushToUsers(admin, [userId], {
      title: notice.title,
      body: notice.body,
      url: notice.path,
      tag: notice.tag,
    });
  } catch {
    // Push is best effort.
  }
  try {
    const contact = await loadUserContact(admin, userId);
    if (!contact.email) return;
    await sendEmail(admin, {
      templateId: 'pitch_notice',
      to: contact.email,
      recipientUserId: userId,
      trigger: notice.trigger,
      props: {
        recipientName: contact.name,
        subject: notice.title,
        lead: notice.body,
        quote: notice.quote,
        ctaLabel: notice.ctaLabel,
        ctaUrl: `${APP_URL}${notice.path}`,
        footnote: notice.footnote,
      },
    });
  } catch {
    // Email is best effort; the inbox and the Pitching page are the record.
  }
}

const CURATOR_FOOTNOTE = 'You are getting this because you take paid pitches on Urganize.';
const ARTIST_FOOTNOTE = 'You are getting this because you paid to pitch a curator on Urganize.';

async function notifyCuratorsOfPaidPitches(admin: SupabaseClient, pitchIds: string[]): Promise<void> {
  for (const pitchId of pitchIds) {
    const pitch = await loadPitchForNotice(admin, pitchId);
    if (!pitch) continue;
    const payment = await loadPaymentForPitch(admin, pitchId);
    await notifyUser(admin, pitch.curator_user_id, {
      title: 'New paid pitch',
      body: inboxCard(
        pitch.artist_name,
        pitch.song_title,
        formatPitchDeadline(pitch.response_due_at),
        payment?.curatorShareKobo ?? 0
      ),
      path: '/curator',
      tag: `pitch-paid-${pitchId}`,
      trigger: 'pitch_paid',
      ctaLabel: 'Open your inbox',
      footnote: CURATOR_FOOTNOTE,
    });
  }
}

async function notifyReminder(admin: SupabaseClient, pitchId: string): Promise<void> {
  const pitch = await loadPitchForNotice(admin, pitchId);
  if (!pitch) return;
  const payment = await loadPaymentForPitch(admin, pitchId);
  await notifyUser(admin, pitch.curator_user_id, {
    title: '1 day left to reply',
    body: reminderLine(pitch.artist_name, payment?.curatorShareKobo ?? 0),
    path: '/curator',
    tag: `pitch-reminder-${pitchId}`,
    trigger: 'pitch_reminder',
    ctaLabel: 'Reply now',
    footnote: CURATOR_FOOTNOTE,
  });
}

async function notifyMissedWindow(admin: SupabaseClient, pitchId: string, strikeCount: number): Promise<void> {
  const pitch = await loadPitchForNotice(admin, pitchId);
  if (!pitch) return;
  const payment = await loadPaymentForPitch(admin, pitchId);
  await notifyUser(admin, pitch.curator_user_id, {
    title: 'You missed a pitch',
    body: missedWindowLine(pitch.artist_name, payment?.curatorShareKobo ?? 0, Math.min(strikeCount, STRIKE_LIMIT)),
    path: '/curator/earnings',
    tag: `pitch-missed-${pitchId}`,
    trigger: 'pitch_missed_window',
    ctaLabel: 'See your earnings',
    footnote: CURATOR_FOOTNOTE,
  });
  await notifyUser(admin, pitch.created_by, {
    title: 'Pitch refunded',
    body: autoRefundLine(payment?.curatorName || 'The curator', payment?.priceKobo ?? 0),
    path: '/dashboard/pitching',
    tag: `pitch-refund-${pitchId}`,
    trigger: 'pitch_auto_refund',
    ctaLabel: 'See your pitches',
    footnote: ARTIST_FOOTNOTE,
  });
}

async function notifyInboxPaused(admin: SupabaseClient, curatorUserId: string): Promise<void> {
  if (!curatorUserId) return;
  await notifyUser(admin, curatorUserId, {
    title: 'Your inbox is paused',
    body: INBOX_PAUSED,
    path: '/curator/earnings',
    tag: `pitch-paused-${curatorUserId}`,
    trigger: 'curator_inbox_paused',
    ctaLabel: 'Open Urganize',
    footnote: CURATOR_FOOTNOTE,
  });
  const { data: profile } = await admin
    .from(CURATOR_PROFILES_TABLE)
    .select('display_name')
    .eq('user_id', curatorUserId)
    .maybeSingle();
  await alertFounderPitchPayments(admin, {
    kind: 'curator_inbox_paused',
    subject: 'Curator paused',
    headline: `A curator missed ${STRIKE_LIMIT} pitches in ${STRIKE_WINDOW_DAYS} days and their inbox is paused. Review them on the admin page before unpausing.`,
    facts: [
      ['Curator', String((profile as Record<string, unknown> | null)?.display_name || curatorUserId)],
      ['User id', curatorUserId],
    ],
    metadata: { curatorUserId },
  });
}

/** A curator answered a paid pitch: tell the artist who paid for it. */
export async function notifyArtistOfReply(admin: SupabaseClient, pitchId: string): Promise<void> {
  const pitch = await loadPitchForNotice(admin, pitchId);
  if (!pitch) return;
  const payment = await loadPaymentForPitch(admin, pitchId);
  const curator = payment?.curatorName || 'The curator';
  const accepted = pitch.status === 'added';
  await notifyUser(admin, pitch.created_by, {
    title: accepted ? 'A curator said yes' : 'A curator replied',
    body: accepted ? acceptedLine(curator, pitch.song_title) : passedLine(curator, pitch.song_title),
    path: '/dashboard/pitching',
    tag: `pitch-reply-${pitchId}`,
    trigger: 'pitch_replied',
    ctaLabel: 'Read the reply',
    quote: pitch.curator_reply || undefined,
    footnote: ARTIST_FOOTNOTE,
  });
}

// ─── founder alerts ──────────────────────────────────────────────────────────

export type PitchPaymentAlertKind =
  | 'payout_needs_review'
  | 'pitch_payment_needs_review'
  | 'pitch_refund_failed'
  | 'pitch_reconcile_mismatch'
  | 'pitch_recovery_unmatched'
  | 'curator_inbox_paused';

/**
 * A pitch payment problem that needs the founder. Written to the billing ledger
 * (billing_events, workspace optional) so /admin sees it even with email off,
 * and emailed to BILLING_ALERTS_EMAIL when that is set. Never throws.
 */
export async function alertFounderPitchPayments(
  admin: SupabaseClient,
  alert: {
    kind: PitchPaymentAlertKind;
    subject: string;
    headline: string;
    facts: Array<[string, string]>;
    metadata?: Record<string, unknown>;
    workspaceId?: string | null;
  }
): Promise<void> {
  try {
    await logBillingEvent(admin, {
      workspaceId: alert.workspaceId ?? null,
      ownerUserId: null,
      actorUserId: null,
      type: alert.kind,
      metadata: { ...(alert.metadata ?? {}), headline: alert.headline },
    });
  } catch {
    // The ledger row is a convenience; the alert email is the interrupt.
  }

  const recipient = process.env.BILLING_ALERTS_EMAIL?.trim();
  if (!recipient) return;
  try {
    await sendEmail(admin, {
      templateId: 'founder_ops_alert',
      to: recipient,
      trigger: alert.kind,
      props: { subject: alert.subject, headline: alert.headline, facts: alert.facts },
    });
  } catch {
    // Never surfaces anywhere.
  }
}
