// POST /api/dayzero/webhook — Day Zero license events (#1393).
//
// Verified by the hex HMAC-SHA256 of X-DayZero-Timestamp + the raw body, keyed
// with DAYZERO_API_KEY (401 otherwise). Then:
//   purchase   → the license is stored as inactive
//   activate   → active (the buyer is about to reach /dayzero/callback)
//   deactivate → deactivated, a refund: Solo Plus comes off its account
//   upgrade / downgrade / migrate → the plan moves from prev_license_key
// "test": true events never touch the database. Every handled event answers
// 200 {success: true, event}; Day Zero retries anything else, so a database
// failure answers 500 on purpose to get the retry. Repeats are safe
// (lib/dayzero.ts nextLicenseStatus).

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/releases/_shared';
import { parseDayzeroWebhook, verifyDayzeroSignature } from '@/lib/dayzero';
import { applyDayzeroWebhook } from '@/lib/dayzero-server';

export const dynamic = 'force-dynamic';

const eventName = (rawBody: string): string => {
  try {
    const body = JSON.parse(rawBody) as { event?: unknown };
    return typeof body.event === 'string' ? body.event : '';
  } catch {
    return '';
  }
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const genuine = verifyDayzeroSignature({
    timestamp: request.headers.get('x-dayzero-timestamp'),
    signature: request.headers.get('x-dayzero-signature'),
    rawBody,
    apiKey: process.env.DAYZERO_API_KEY?.trim(),
  });
  if (!genuine) return NextResponse.json({ success: false, error: 'Invalid signature.' }, { status: 401 });

  let body: unknown = null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = null;
  }
  const event = parseDayzeroWebhook(body);
  const ack = () => NextResponse.json({ success: true, event: event?.event ?? eventName(rawBody) });

  // Unreadable or a test: acknowledge, change nothing.
  if (!event || event.test) return ack();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const admin = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (!admin) return NextResponse.json({ success: false, error: 'Not configured.' }, { status: 500 });

  try {
    await applyDayzeroWebhook(admin, event);
  } catch (error) {
    console.error('[dayzero] webhook failed', event.event, error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, event: event.event }, { status: 500 });
  }
  return ack();
}
