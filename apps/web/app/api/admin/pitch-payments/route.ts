import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_shared';
import { formatNaira } from '@/lib/pitch-payments';
import {
  CURATOR_PROFILES_TABLE,
  PAYMENTS_TABLE,
  PAYOUT_ACCOUNTS_TABLE,
  PITCHES_TABLE,
  QUOTES_TABLE,
  RECOVERIES_TABLE,
  requestPitchRefund,
} from '@/lib/pitch-payments-server';
import {
  createPaystackRefund,
  isPaystackConfigured,
  paystackSplitMode,
  setPaystackSubaccountActive,
  verifyPaystackTransaction,
} from '@/lib/paystack-server';

// /admin/pitch-payments — everything about curator pitch payments that needs
// a person: bank accounts whose name did not match, checkouts that did not
// settle cleanly, refunds that failed, and curators paused by strikes.
//
// DELIBERATELY NOT FLAG-GATED (the /admin/teams precedent): access is
// ADMIN_EMAILS, and a failed refund has to stay visible and fixable whether or
// not paid pitching is switched on today.
//
// The spec's two admin routes (approve a payout account, refund a pitch) are
// actions here rather than separate routes, next to the rest of the queue.

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const auth = await verifyAdmin(request);
  if (!auth.ok) return auth.response;
  const admin = auth.supabaseAdmin;

  const since = new Date(Date.now() - 30 * DAY_MS).toISOString();

  const [accounts, quotes, refunds, paused, recent, recoveries] = await Promise.all([
    admin
      .from(PAYOUT_ACCOUNTS_TABLE)
      .select('id,curator_user_id,bank_name,account_last4,resolved_account_name,created_at')
      .eq('status', 'needs_review')
      .order('created_at', { ascending: true })
      .limit(100),
    admin
      .from(QUOTES_TABLE)
      .select('id,paystack_reference,total_kobo,review_reason,paid_at,payer_user_id,lines,created_at')
      .eq('status', 'needs_review')
      .order('created_at', { ascending: true })
      .limit(100),
    admin
      .from(PAYMENTS_TABLE)
      .select(
        'id,paystack_reference,price_kobo,song_title,artist_name,curator_name,status,refund_attempts,refund_last_error,refund_requested_at'
      )
      .in('status', ['refund_pending', 'refund_failed'])
      .order('refund_requested_at', { ascending: true })
      .limit(100),
    admin
      .from(CURATOR_PROFILES_TABLE)
      .select('user_id,display_name,inbox_paused_at')
      .not('inbox_paused_at', 'is', null)
      .order('inbox_paused_at', { ascending: true })
      .limit(100),
    admin
      .from(PAYMENTS_TABLE)
      .select('id,paystack_reference,price_kobo,platform_fee_kobo,paystack_fee_kobo,song_title,curator_name,status,paid_at')
      .gte('paid_at', since)
      .order('paid_at', { ascending: false })
      .limit(200),
    admin.from(RECOVERIES_TABLE).select('owed_kobo,recovered_kobo').eq('status', 'open'),
  ]);

  const failed = [accounts, quotes, refunds, paused, recent, recoveries].find((result) => result.error);
  if (failed?.error) {
    return NextResponse.json(
      { error: `Could not load pitch payments: ${failed.error.message}` },
      { status: 500 }
    );
  }

  const accountRows = (accounts.data || []) as Array<Record<string, unknown>>;
  const names = await loadNames(
    admin,
    accountRows.map((row) => String(row.curator_user_id || ''))
  );

  const recentRows = (recent.data || []) as Array<Record<string, unknown>>;
  const summary = recentRows.reduce<{
    count: number;
    grossKobo: number;
    feeKobo: number;
    paystackFeeKobo: number;
    refundedCount: number;
  }>(
    (totals, row) => {
      const price = Number(row.price_kobo) || 0;
      totals.count += 1;
      totals.grossKobo += price;
      totals.feeKobo += Number(row.platform_fee_kobo) || 0;
      totals.paystackFeeKobo += Number(row.paystack_fee_kobo) || 0;
      if (row.status === 'refunded') totals.refundedCount += 1;
      return totals;
    },
    { count: 0, grossKobo: 0, feeKobo: 0, paystackFeeKobo: 0, refundedCount: 0 }
  );
  const openRecoveryKobo = ((recoveries.data || []) as Array<Record<string, unknown>>).reduce(
    (sum, row) => sum + Math.max(0, (Number(row.owed_kobo) || 0) - (Number(row.recovered_kobo) || 0)),
    0
  );

  return NextResponse.json({
    paystackConfigured: isPaystackConfigured(),
    splitMode: paystackSplitMode(),
    payoutReviews: accountRows.map((row) => ({
      id: String(row.id),
      curatorName: names.get(String(row.curator_user_id))?.displayName || '',
      profileName: names.get(String(row.curator_user_id))?.profileName || '',
      bankName: String(row.bank_name || ''),
      accountLast4: String(row.account_last4 || ''),
      resolvedAccountName: String(row.resolved_account_name || ''),
      createdAt: String(row.created_at || ''),
    })),
    quoteReviews: ((quotes.data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      reference: String(row.paystack_reference || ''),
      totalKobo: Number(row.total_kobo) || 0,
      reason: String(row.review_reason || ''),
      paidAt: row.paid_at ? String(row.paid_at) : null,
      createdAt: String(row.created_at || ''),
      curators: (Array.isArray(row.lines) ? (row.lines as Array<Record<string, unknown>>) : []).map((line) =>
        String(line.curator_name || '')
      ),
    })),
    refunds: ((refunds.data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      reference: String(row.paystack_reference || ''),
      priceKobo: Number(row.price_kobo) || 0,
      songTitle: String(row.song_title || ''),
      artistName: String(row.artist_name || ''),
      curatorName: String(row.curator_name || ''),
      status: String(row.status || ''),
      attempts: Number(row.refund_attempts) || 0,
      lastError: row.refund_last_error ? String(row.refund_last_error) : null,
      requestedAt: row.refund_requested_at ? String(row.refund_requested_at) : null,
    })),
    pausedCurators: ((paused.data || []) as Array<Record<string, unknown>>).map((row) => ({
      curatorUserId: String(row.user_id),
      displayName: String(row.display_name || ''),
      pausedAt: String(row.inbox_paused_at || ''),
    })),
    recentPayments: recentRows.map((row) => ({
      id: String(row.id),
      reference: String(row.paystack_reference || ''),
      priceKobo: Number(row.price_kobo) || 0,
      songTitle: String(row.song_title || ''),
      curatorName: String(row.curator_name || ''),
      status: String(row.status || ''),
      paidAt: String(row.paid_at || ''),
    })),
    summary: { ...summary, openRecoveryKobo },
  });
}

async function loadNames(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Map<string, { displayName: string; profileName: string }>> {
  const names = new Map<string, { displayName: string; profileName: string }>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return names;
  const [curators, profiles] = await Promise.all([
    admin.from(CURATOR_PROFILES_TABLE).select('user_id,display_name').in('user_id', ids),
    admin.from('profiles').select('id,name').in('id', ids),
  ]);
  for (const id of ids) names.set(id, { displayName: '', profileName: '' });
  for (const row of (curators.data || []) as Array<Record<string, unknown>>) {
    const entry = names.get(String(row.user_id));
    if (entry) entry.displayName = String(row.display_name || '');
  }
  for (const row of (profiles.data || []) as Array<Record<string, unknown>>) {
    const entry = names.get(String(row.id));
    if (entry) entry.profileName = String(row.name || '');
  }
  return names;
}

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  const auth = await verifyAdmin(request);
  if (!auth.ok) return auth.response;
  const admin = auth.supabaseAdmin;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const action = typeof payload.action === 'string' ? payload.action : '';
  const now = new Date().toISOString();

  switch (action) {
    case 'approve_payout': {
      const accountId = typeof payload.accountId === 'string' ? payload.accountId : '';
      if (!accountId) return fail('Account id is required.');
      const { data, error } = await admin
        .from(PAYOUT_ACCOUNTS_TABLE)
        .update({ status: 'active', activated_at: now, reviewed_by: auth.userId, reviewed_at: now })
        .eq('id', accountId)
        .eq('status', 'needs_review')
        .select('id')
        .maybeSingle();
      if (error) return fail(error.message, 500);
      if (!data) return fail('That account is no longer waiting for review.', 409);
      return NextResponse.json({ ok: true });
    }

    case 'reject_payout': {
      const accountId = typeof payload.accountId === 'string' ? payload.accountId : '';
      const note = typeof payload.note === 'string' ? payload.note.trim().slice(0, 500) : '';
      if (!accountId) return fail('Account id is required.');
      const { data, error } = await admin
        .from(PAYOUT_ACCOUNTS_TABLE)
        .update({
          status: 'disabled',
          review_note: note || null,
          reviewed_by: auth.userId,
          reviewed_at: now,
          retired_at: now,
        })
        .eq('id', accountId)
        .eq('status', 'needs_review')
        .select('id,paystack_subaccount_code')
        .maybeSingle();
      if (error) return fail(error.message, 500);
      if (!data) return fail('That account is no longer waiting for review.', 409);
      const code = String((data as Record<string, unknown>).paystack_subaccount_code || '');
      if (code) await setPaystackSubaccountActive(code, false);
      return NextResponse.json({ ok: true });
    }

    case 'refund_payment': {
      // A refund for a dispute, or another try at a refund Paystack refused.
      const paymentId = typeof payload.paymentId === 'string' ? payload.paymentId : '';
      if (!paymentId) return fail('Payment id is required.');
      const { data: found, error } = await admin
        .from(PAYMENTS_TABLE)
        .select('id,pitch_id,curator_user_id,curator_share_kobo,price_kobo,paystack_reference,status,refund_attempts,paystack_refund_id')
        .eq('id', paymentId)
        .maybeSingle();
      if (error) return fail(error.message, 500);
      const payment = found as Record<string, unknown> | null;
      if (!payment) return fail('Payment not found.', 404);
      if (payment.status === 'refunded') return fail('That payment is already refunded.', 409);

      if (payment.status === 'paid') {
        // A pitch still waiting on its curator refunds itself if the window is
        // missed, with the strike and the recovery that come with it. Refunding
        // it by hand now would race that and double count, so it has to wait.
        if (payment.pitch_id) {
          const { data: pitch } = await admin
            .from(PITCHES_TABLE)
            .select('status')
            .eq('id', String(payment.pitch_id))
            .maybeSingle();
          const pitchStatus = (pitch as Record<string, unknown> | null)?.status;
          if (pitchStatus === 'new' || pitchStatus === 'listened') {
            return fail(
              'This pitch is still waiting on the curator. It refunds on its own if they miss the window.',
              409
            );
          }
        }
        const { data: claimed } = await admin
          .from(PAYMENTS_TABLE)
          .update({ status: 'refund_pending', refund_reason: 'admin', refund_requested_at: now })
          .eq('id', paymentId)
          .eq('status', 'paid')
          .select('id')
          .maybeSingle();
        if (!claimed) return fail('That payment changed. Reload and try again.', 409);

        if (payload.recoverFromCurator === true && Number(payment.curator_share_kobo) > 0) {
          await admin.from(RECOVERIES_TABLE).upsert(
            {
              curator_user_id: String(payment.curator_user_id),
              source_payment_id: paymentId,
              owed_kobo: Number(payment.curator_share_kobo),
            },
            { onConflict: 'source_payment_id', ignoreDuplicates: true }
          );
        }
      } else if (payment.status === 'refund_failed') {
        const { data: claimed } = await admin
          .from(PAYMENTS_TABLE)
          .update({ status: 'refund_pending' })
          .eq('id', paymentId)
          .eq('status', 'refund_failed')
          .select('id')
          .maybeSingle();
        if (!claimed) return fail('That payment changed. Reload and try again.', 409);
      }

      const refund = await requestPitchRefund(
        admin,
        {
          id: paymentId,
          price_kobo: Number(payment.price_kobo) || 0,
          paystack_reference: String(payment.paystack_reference || ''),
          refund_attempts: Number(payment.refund_attempts) || 0,
          paystack_refund_id: (payment.paystack_refund_id as number | null) ?? null,
        },
        {
          merchantNote: 'Refunded by Urganize after a review.',
          customerNote: 'Urganize refunded this pitch.',
        }
      );
      if (!refund.ok) return fail(refund.error || 'Paystack refused the refund.', 502);
      return NextResponse.json({ ok: true });
    }

    case 'mark_refunded': {
      // The founder refunded the artist outside Paystack's API.
      const paymentId = typeof payload.paymentId === 'string' ? payload.paymentId : '';
      if (!paymentId) return fail('Payment id is required.');
      const { data, error } = await admin
        .from(PAYMENTS_TABLE)
        .update({ status: 'refunded', refunded_at: now, refund_last_error: 'Refunded by hand.' })
        .eq('id', paymentId)
        .in('status', ['refund_pending', 'refund_failed'])
        .select('id')
        .maybeSingle();
      if (error) return fail(error.message, 500);
      if (!data) return fail('Only a pending or failed refund can be marked refunded.', 409);
      return NextResponse.json({ ok: true });
    }

    case 'unpause_curator': {
      const curatorUserId = typeof payload.curatorUserId === 'string' ? payload.curatorUserId : '';
      if (!curatorUserId) return fail('Curator id is required.');
      // strikes_reset_at is what stops the three strikes that caused the pause
      // from pausing the inbox again on the very next miss.
      const { data, error } = await admin
        .from(CURATOR_PROFILES_TABLE)
        .update({ inbox_paused_at: null, strikes_reset_at: now })
        .eq('user_id', curatorUserId)
        .not('inbox_paused_at', 'is', null)
        .select('user_id')
        .maybeSingle();
      if (error) return fail(error.message, 500);
      if (!data) return fail('That inbox is not paused.', 409);
      return NextResponse.json({ ok: true });
    }

    case 'refund_quote': {
      // A checkout that did not settle cleanly (a mismatched amount, or a
      // second payment for pitches already paid). No pitch was sent, so the
      // whole payment goes back, for whatever Paystack says was actually paid.
      const quoteId = typeof payload.quoteId === 'string' ? payload.quoteId : '';
      if (!quoteId) return fail('Quote id is required.');
      const { data: found, error } = await admin
        .from(QUOTES_TABLE)
        .select('id,status,paystack_reference,review_reason')
        .eq('id', quoteId)
        .maybeSingle();
      if (error) return fail(error.message, 500);
      const quote = found as Record<string, unknown> | null;
      if (!quote || quote.status !== 'needs_review') return fail('That checkout is not waiting for review.', 409);
      if (String(quote.review_reason || '').startsWith('refunded')) return fail('That checkout is already refunded.', 409);

      const reference = String(quote.paystack_reference || '');
      const verified = await verifyPaystackTransaction(reference);
      if (!verified.ok) return fail(verified.message, 502);
      if (verified.data.status !== 'success' || verified.data.amountKobo <= 0) {
        return fail(`Paystack shows this payment as ${verified.data.status || 'unknown'}, so there is nothing to refund.`, 409);
      }
      const refund = await createPaystackRefund({
        reference,
        amountKobo: verified.data.amountKobo,
        merchantNote: 'Checkout needed review. Full refund.',
        customerNote: 'Your pitch payment could not be matched, so it is refunded in full.',
      });
      if (!refund.ok) return fail(refund.message, 502);
      await admin
        .from(QUOTES_TABLE)
        .update({ review_reason: `refunded_by_admin ${formatNaira(verified.data.amountKobo)}`.slice(0, 200) })
        .eq('id', quoteId);
      return NextResponse.json({ ok: true });
    }

    default:
      return fail('Unknown action.');
  }
}
