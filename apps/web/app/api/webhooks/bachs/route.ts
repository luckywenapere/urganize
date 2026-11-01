import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/releases/_shared';
import { paidCheckoutFromEvent, parseBachsEvent, verifyBachsSignature } from '@/lib/bachs';
import { fulfilBachsCheckout } from '@/lib/bachs-server';

// Bachs webhook (2026-11-01, #946). Signature checked on the raw body
// (BACHS_WEBHOOK_SECRET, from the Bachs developer portal). A paid event only
// tells us which checkout to look at: fulfilBachsCheckout asks Bachs itself
// before it applies anything, and applies it once.
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
  const paid = paidCheckoutFromEvent(event);
  if (!paid) return NextResponse.json({ ok: true, ignored: event.type });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const admin = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });

  const result = await fulfilBachsCheckout(admin, paid.reference, {
    method: paid.method,
    paidAmount: paid.amount || null,
    paidCurrency: paid.currency || null,
  });
  if (result === 'error') return NextResponse.json({ error: 'Lookup failed.' }, { status: 500 });
  return NextResponse.json({ ok: true, result });
}
