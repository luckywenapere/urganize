import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/tasks-server';
import { afterResponse } from '@/lib/after-response';
import { handleInboundWhatsapp } from '@/lib/whatsapp/server';
import { verifyTwilioSignature } from '@/lib/whatsapp/transport';

// Replies from task owners, posted here by Twilio. Not behind a user session:
// the Twilio signature is the only proof it is real, so an unsigned or wrongly
// signed request is refused. An unset TWILIO_AUTH_TOKEN means the route does not
// exist (404), like the Resend webhook.
//
// Twilio expects an answer inside 15 seconds and retries on failure, so the
// reply work runs after the response and duplicates are dropped by message id.

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) return new NextResponse('Not found', { status: 404 });

  const form = await request.formData().catch(() => null);
  if (!form) return new NextResponse('Bad request', { status: 400 });
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === 'string') params[key] = value;
  });

  // Behind Vercel the URL the function sees can differ from the one Twilio
  // signed, so the public one can be pinned in env.
  const url = process.env.WHATSAPP_WEBHOOK_URL?.trim() || request.url;
  if (!verifyTwilioSignature(url, params, request.headers.get('x-twilio-signature'), authToken)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const admin = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (admin && params.From) {
    // A button tap arrives as ButtonText; typed text arrives as Body.
    const text = (params.ButtonText || params.Body || '').trim();
    afterResponse('whatsapp inbound', () =>
      handleInboundWhatsapp(admin, {
        from: params.From,
        body: text,
        providerMessageId: params.MessageSid || null,
      })
    );
  }

  return new NextResponse(EMPTY_TWIML, { status: 200, headers: { 'Content-Type': 'text/xml' } });
}
