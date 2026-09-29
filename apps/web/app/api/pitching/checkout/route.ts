import { NextRequest, NextResponse } from 'next/server';
import { PITCHES_TABLE, flagOffResponse, requireTeamUser } from '../_shared';
import {
  ARTIST_PITCH_TERMS_VERSION,
  buildPaystackSplit,
  generatePitchReference,
  isPitchPaymentsEnabled,
  isQuoteExpired,
  toArtistQuoteView,
} from '@/lib/pitch-payments';
import {
  ALREADY_PAID,
  PAYMENTS_UNAVAILABLE,
  PAYMENT_IN_REVIEW,
  PITCHES_CHANGED,
  QUOTE_EXPIRED,
  TERMS_CHANGED,
} from '@/lib/pitch-payment-copy';
import {
  createPaystackSplit,
  initializePaystackTransaction,
  isPaystackConfigured,
  paystackSplitMode,
} from '@/lib/paystack-server';
import { QUOTES_TABLE } from '@/lib/pitch-payments-server';
import {
  QUOTE_COLUMNS,
  checkPaidCurators,
  insertPitchQuote,
  quoteStillMatches,
  targetsFromQuoteLines,
} from '@/lib/pitch-quotes-server';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';

type QuoteRow = Parameters<typeof toArtistQuoteView>[0] & Record<string, unknown>;

function resolveAppBase(request: NextRequest): string {
  // The billing checkout's rule: prefer NEXT_PUBLIC_APP_URL so a branch never
  // calls back to a stale preview, fall back to the request origin locally.
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (configured || new URL(request.url).origin).replace(/\/$/, '');
}

/**
 * Open Paystack for a quote.
 *
 * Four things happen before any money can move, in this order:
 *
 *   1. The terms the artist was shown are the current ones.
 *   2. Every pitch is still waiting for payment.
 *   3. The quote still matches what the curators charge and where their money
 *      goes. A quote older than 30 minutes, or one whose curator changed their
 *      price or bank since, is RE-PRICED. If the total moved, the artist sees
 *      the new one before paying ("Prices changed"). If it did not, checkout
 *      carries on with the fresh quote.
 *   4. The quote is CLAIMED before Paystack is called, so two taps on Pay open
 *      one transaction, not two. A second tap gets the same checkout page back.
 *
 * The split is built on the server from the quote: a flat share for each
 * curator's subaccount, and bearer_type 'account' so Urganize pays Paystack's fee
 * from its own cut.
 */
export async function POST(request: NextRequest) {
  if (!isPitchPaymentsEnabled()) return flagOffResponse();

  const auth = await requireTeamUser(request);
  if ('error' in auth && auth.error) return auth.error;

  if (!isPaystackConfigured()) {
    return NextResponse.json({ error: PAYMENTS_UNAVAILABLE }, { status: 503 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const quoteId = typeof payload.quoteId === 'string' ? payload.quoteId : '';
  if (!quoteId) return NextResponse.json({ error: 'Quote id is required.' }, { status: 400 });
  if (payload.termsVersion !== ARTIST_PITCH_TERMS_VERSION) {
    return NextResponse.json({ error: TERMS_CHANGED, code: 'terms_changed' }, { status: 409 });
  }

  const email = String(auth.user.email || '').trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'Add an email to your account before you pay.' }, { status: 400 });
  }

  const { data: found, error: readError } = await auth.adminClient
    .from(QUOTES_TABLE)
    .select(QUOTE_COLUMNS)
    .eq('id', quoteId)
    .eq('payer_user_id', auth.user.id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: 'Could not load your checkout.' }, { status: 500 });
  if (!found) return NextResponse.json({ error: 'Checkout not found.' }, { status: 404 });

  let quote = found as unknown as QuoteRow;
  if (quote.status === 'paid') {
    return NextResponse.json({ error: ALREADY_PAID, code: 'already_paid' }, { status: 409 });
  }
  if (quote.status === 'needs_review') {
    return NextResponse.json({ error: PAYMENT_IN_REVIEW, code: 'in_review' }, { status: 409 });
  }

  // 2. The pitches.
  const targets = targetsFromQuoteLines(quote.lines);
  const { data: pitchRows, error: pitchError } = await auth.adminClient
    .from(PITCHES_TABLE)
    .select('id,status')
    .in(
      'id',
      targets.map((target) => target.pitchId)
    );
  if (pitchError) return NextResponse.json({ error: 'Could not load your pitches.' }, { status: 500 });
  const pitches = (pitchRows || []) as Array<Record<string, unknown>>;
  if (
    !targets.length ||
    pitches.length !== targets.length ||
    pitches.some((row) => row.status !== 'awaiting_payment')
  ) {
    return NextResponse.json({ error: PITCHES_CHANGED, code: 'pitches_changed' }, { status: 409 });
  }

  // 3. Still the right price and the right bank accounts?
  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user as never);
  const check = await checkPaidCurators(auth.adminClient, {
    curatorUserIds: targets.map((target) => target.curatorUserId),
    payerUserId: auth.user.id,
    ownerUserId: String(quote.owner_user_id || ''),
    payerTeamOwnerIds: access.releaseOwnerIds,
  });
  if (!check.ok) {
    return NextResponse.json({ error: check.error, code: check.code }, { status: check.status });
  }

  const stale =
    quote.status === 'superseded' || isQuoteExpired(quote.expires_at) || !quoteStillMatches(quote.lines, check.states);

  if (stale) {
    const releaseId = String(quote.release_id || '');
    if (!releaseId) {
      return NextResponse.json({ error: PITCHES_CHANGED, code: 'pitches_changed' }, { status: 409 });
    }
    const fresh = await insertPitchQuote(auth.adminClient, {
      payerUserId: auth.user.id,
      ownerUserId: String(quote.owner_user_id || ''),
      releaseId,
      targets,
      states: check.states,
    });
    if (!fresh.ok) {
      return NextResponse.json({ error: fresh.error, code: fresh.code }, { status: fresh.status });
    }
    const freshRow = fresh.row as unknown as QuoteRow;
    if (Number(freshRow.total_kobo) !== Number(quote.total_kobo)) {
      return NextResponse.json(
        { error: QUOTE_EXPIRED, code: 'QUOTE_EXPIRED', quote: toArtistQuoteView(freshRow) },
        { status: 409 }
      );
    }
    quote = freshRow;
  }

  const base = resolveAppBase(request);

  // A checkout already opened for this quote: hand back the same page.
  if (quote.status === 'checkout_started' && quote.authorization_url) {
    return NextResponse.json({
      authorizationUrl: String(quote.authorization_url),
      reference: String(quote.paystack_reference),
      quote: toArtistQuoteView(quote),
    });
  }

  // 4. Claim it.
  const { data: claimed } = await auth.adminClient
    .from(QUOTES_TABLE)
    .update({ status: 'checkout_started' })
    .eq('id', quote.id)
    .eq('status', 'open')
    .select(QUOTE_COLUMNS)
    .maybeSingle();

  if (!claimed) {
    const { data: current } = await auth.adminClient
      .from(QUOTES_TABLE)
      .select(QUOTE_COLUMNS)
      .eq('id', quote.id)
      .maybeSingle();
    const row = current as unknown as QuoteRow | null;
    if (row?.authorization_url && row.status === 'checkout_started') {
      return NextResponse.json({
        authorizationUrl: String(row.authorization_url),
        reference: String(row.paystack_reference),
        quote: toArtistQuoteView(row),
      });
    }
    return NextResponse.json({ error: 'Opening checkout. Try again in a moment.' }, { status: 409 });
  }

  const claimedRow = claimed as unknown as QuoteRow;
  const lines = Array.isArray(claimedRow.lines) ? (claimedRow.lines as Array<Record<string, unknown>>) : [];
  const split = buildPaystackSplit(
    lines.map((line) => ({
      subaccount_code: String(line.subaccount_code || ''),
      split_share_kobo: Number(line.split_share_kobo) || 0,
    }))
  );

  const release = async (message: string) => {
    // Put the quote back and give it a NEW reference, so the next attempt can
    // never collide with a transaction Paystack may have half made for this one.
    await auth.adminClient
      .from(QUOTES_TABLE)
      .update({ status: 'open', paystack_reference: generatePitchReference() })
      .eq('id', claimedRow.id)
      .eq('status', 'checkout_started')
      .is('authorization_url', null);
    console.error('[pitching/checkout] could not open Paystack', message);
    return NextResponse.json({ error: 'Could not open the payment page. Try again.' }, { status: 502 });
  };

  let splitCode: string | null = null;
  if (split && paystackSplitMode() === 'split_code') {
    const created = await createPaystackSplit({ name: `Urganize pitch ${claimedRow.paystack_reference}`, split });
    if (!created.ok) return release(created.message);
    splitCode = created.data.splitCode;
  }

  const initialized = await initializePaystackTransaction({
    email,
    amountKobo: Number(claimedRow.total_kobo),
    reference: String(claimedRow.paystack_reference),
    callbackUrl: `${base}/dashboard/pitching/paid`,
    metadata: {
      source: 'pitch_checkout',
      quote_id: claimedRow.id,
      pitch_ids: targets.map((target) => target.pitchId),
      team_id: claimedRow.workspace_id ?? null,
      release_id: claimedRow.release_id ?? null,
      cancel_action: `${base}/dashboard/pitching?payment=cancelled`,
    },
    split: splitCode ? null : split,
    splitCode,
  });
  if (!initialized.ok) return release(initialized.message);

  await auth.adminClient
    .from(QUOTES_TABLE)
    .update({
      authorization_url: initialized.data.authorizationUrl,
      paystack_access_code: initialized.data.accessCode || null,
    })
    .eq('id', claimedRow.id);

  return NextResponse.json({
    authorizationUrl: initialized.data.authorizationUrl,
    reference: String(claimedRow.paystack_reference),
    quote: toArtistQuoteView(claimedRow),
  });
}
