import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/_shared/auth';
import { readAltlinkEvent } from '@/lib/altlink/rules';
import { ALTLINK_SIGNATURE_HEADER, verifyAltlinkSignature } from '@/lib/altlink/signature';
import { applyAltlinkWebhook } from '@/lib/altlink/server';

// Altlink webhooks (Partner API v2). Public, because Altlink is the caller; the
// HMAC signature is the only access control. An unset ALTLINK_WEBHOOK_SECRET
// means the route does not exist (404).
//
//   401: bad or missing signature, or a timestamp more than 5 minutes off.
//   200: verified. A replayed event_id is a no-op ("duplicate").
//   500: a verified event we could not store, so Altlink retries it.

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = process.env.ALTLINK_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // The signature covers the exact bytes: raw text, never re-serialised JSON.
  const rawBody = await request.text();
  const verified = verifyAltlinkSignature(secret, rawBody, request.headers.get(ALTLINK_SIGNATURE_HEADER), Date.now());
  if (!verified.ok) return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
  }
  const event = readAltlinkEvent(body);
  if (!event) return NextResponse.json({ ok: true, outcome: 'ignored' });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const admin = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (!admin) return NextResponse.json({ ok: false }, { status: 500 });

  const outcome = await applyAltlinkWebhook(admin, event);
  if (outcome === 'error') return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true, outcome });
}
