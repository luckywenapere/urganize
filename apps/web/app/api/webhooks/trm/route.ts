import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/_shared/auth';
import { applyTrmWebhook, recordRefusedDelivery } from '@/lib/trm/server';
import { afterResponse } from '@/lib/after-response';
import { syncSmartLinkFromTrm } from '@/lib/altlink/server';
import { headerBag, loggableHeaders, readTrmEvent, verifyTrmWebhook } from '@/lib/trm/webhook';

// TRM lifecycle webhooks (URG-392). Public, because TRM is the caller; the
// HMAC signature (lib/trm/webhook.ts) is the only access control. An unset
// TRM_WEBHOOK_SECRET means the route does not exist (404), so a deployment that
// has not configured it accepts nothing.
//
//   401: bad or missing signature, or a timestamp more than 5 minutes off.
//        Nothing changes; the x-trm-* headers, content-type and a capped
//        body are kept so a misconfigured secret can be diagnosed.
//   200: verified. A replayed delivery id is a no-op 200 ("duplicate").
//   500: a verified delivery we could not store, so TRM retries it.

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = process.env.TRM_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const admin = supabaseUrl ? createAdminClient(supabaseUrl) : null;

  // The signature covers the exact bytes: read raw text, never re-serialised JSON.
  const rawBody = await request.text();
  const headers = headerBag(request.headers.entries());
  const verified = verifyTrmWebhook(secret, rawBody, headers);
  if (!verified.ok) {
    if (admin) await recordRefusedDelivery(admin, loggableHeaders(headers), rawBody, verified.reason);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
  }
  if (!admin) return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 });

  const event = readTrmEvent(body, headers);
  const outcome = await applyTrmWebhook(admin, event, {
    headers: loggableHeaders(headers),
    payload: body,
    signedAt: verified.timestamp,
  });
  if (outcome === 'error') return NextResponse.json({ ok: false }, { status: 500 });
  // Codes from TRM make (or patch) the rollout's Altlink link, after the reply.
  if (outcome === 'applied' && (event.upc || event.isrc) && process.env.NEXT_PUBLIC_FEATURE_ALTLINK !== 'false') {
    afterResponse('altlink-from-trm', () =>
      syncSmartLinkFromTrm(admin, { externalReleaseId: event.externalReleaseId, trmReleaseId: event.releaseId })
    );
  }
  return NextResponse.json({ ok: true, outcome });
}
