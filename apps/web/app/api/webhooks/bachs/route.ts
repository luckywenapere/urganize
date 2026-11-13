import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/releases/_shared';
import { paidCheckoutFromEvent, parseBachsEvent, verifyBachsSignature } from '@/lib/bachs';
import { fulfilBachsCheckout } from '@/lib/bachs-server';
import { invoiceFromEvent, subscriptionIdFromEvent } from '@/lib/bachs-trial';
import { applyPaidInvoice, settleCardTrialCheckout, syncSubscription } from '@/lib/bachs-trial-server';

// Bachs webhook (2026-11-01, #946). Signature checked on the raw body
// (BACHS_WEBHOOK_SECRET, from the Bachs developer portal). A paid event only
// tells us which checkout to look at: fulfilBachsCheckout asks Bachs itself
// before it applies anything, and applies it once.
//
// Card trials (2026-11-14, #1266): customer.subscription.* and invoice.* events
// are about a card Bachs charges by itself. They too only say which
// subscription to look at: lib/bachs-trial-server.ts asks Bachs for it before
// writing, and a paid invoice is applied once (its id is the lock).
//
// Answers: 400 for a bad signature (Bachs keeps retrying 400s only for a
// short while), 200 for everything we read, 500 when the lookup failed so
// Bachs retries.

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.BACHS_WEBHOOK_SECRET?.trim() || '';
  const genuine = verifyBachsSignature({
    rawBody,
    secret,
    timestampHeader: request.headers.get('x-bachs-timestamp'),
    signatureHeader: request.headers.get('x-bachs-signature'),
    signatureV2Header: request.headers.get('x-bachs-signature-v2'),
  });
  if (!genuine) return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });

  const event = parseBachsEvent(rawBody);
  if (!event) return NextResponse.json({ ok: true, ignored: 'unreadable' });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const getAdmin = () => (supabaseUrl ? createAdminClient(supabaseUrl) : null);

  const subscriptionId = subscriptionIdFromEvent(event);
  if (subscriptionId) {
    const admin = getAdmin();
    if (!admin) return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
    const invoice = invoiceFromEvent(event);
    const result = invoice ? await applyPaidInvoice(admin, invoice) : (await syncSubscription(admin, subscriptionId)).result;
    if (result === 'error') return NextResponse.json({ error: 'Lookup failed.' }, { status: 500 });
    return NextResponse.json({ ok: true, result });
  }

  const paid = paidCheckoutFromEvent(event);
  if (!paid) return NextResponse.json({ ok: true, ignored: event.type });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });

  const result = await fulfilBachsCheckout(admin, paid.reference, {
    method: paid.method,
    paidAmount: paid.amount || null,
    paidCurrency: paid.currency || null,
  });
  // Not a one-off checkout: it may be the card page of a trial.
  if (result === 'unknown' && paid.reference.startsWith('urganize_bt_')) {
    const row = await settleCardTrialCheckout(admin, paid.reference);
    return NextResponse.json({ ok: true, result: row?.subscription_id ? 'synced' : 'unknown' });
  }
  if (result === 'error') return NextResponse.json({ error: 'Lookup failed.' }, { status: 500 });
  return NextResponse.json({ ok: true, result });
}
