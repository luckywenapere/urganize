import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/tasks-server';
import { afterResponse } from '@/lib/after-response';
import { handleInboundWhatsapp, recordWhatsappStatus } from '@/lib/whatsapp/server';
import { parseMetaWebhook, verifyMetaSignature } from '@/lib/whatsapp/meta';

// Replies and delivery updates from the Meta WhatsApp Cloud API (#1119). The
// Twilio fallback keeps its own route one level up.
//
// GET  is Meta's one-time check when the webhook is added in the app dashboard:
//      it sends our verify token back and expects the challenge echoed.
// POST is signed with the app secret (X-Hub-Signature-256 over the raw body);
//      anything unsigned or wrongly signed is refused.
// Without WHATSAPP_META_APP_SECRET the route does not exist (404).
//
// Meta retries anything that is not a fast 200, so the work runs after the
// response and duplicate messages are dropped by their id.

export async function GET(request: NextRequest) {
  const verifyToken = process.env.WHATSAPP_META_VERIFY_TOKEN?.trim();
  if (!verifyToken) return new NextResponse('Not found', { status: 404 });
  const params = request.nextUrl.searchParams;
  if (params.get('hub.mode') === 'subscribe' && params.get('hub.verify_token') === verifyToken) {
    return new NextResponse(params.get('hub.challenge') ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.WHATSAPP_META_APP_SECRET?.trim();
  if (!appSecret) return new NextResponse('Not found', { status: 404 });

  const raw = await request.text().catch(() => '');
  if (!verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'), appSecret)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse('Bad request', { status: 400 });
  }
  const { inbound, statuses } = parseMetaWebhook(payload);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const admin = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (admin && (inbound.length || statuses.length)) {
    afterResponse('whatsapp meta inbound', async () => {
      for (const status of statuses) await recordWhatsappStatus(admin, status);
      for (const message of inbound) {
        await handleInboundWhatsapp(admin, { from: message.from, body: message.body, providerMessageId: message.id });
      }
    });
  }

  return NextResponse.json({ ok: true });
}
