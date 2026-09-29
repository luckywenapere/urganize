import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/_shared/auth';
import { applyResendEvent } from '@/lib/email/webhook-server';
import { verifyResendWebhook, type ResendEvent } from '@/lib/email/webhook';

// Resend delivery events (delivered, delayed, bounced, complained). Public,
// because Resend is the caller; the Svix signature is the only access control,
// and an unset RESEND_WEBHOOK_SECRET means the route does not exist (404), so a
// deployment that has not configured it exposes nothing.
export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // The signature covers the exact bytes, so read the raw text, never re-serialised JSON.
  const rawBody = await request.text();
  const valid = verifyResendWebhook(secret, rawBody, {
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
  });
  if (!valid) return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const admin = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (!admin) return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 });

  const { handled } = await applyResendEvent(admin, event);
  // A non-2xx makes Resend retry, which is right only for a real failure.
  return NextResponse.json({ ok: handled }, { status: handled ? 200 : 500 });
}
