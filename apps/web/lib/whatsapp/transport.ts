// Sending and receiving WhatsApp through Twilio. Server only.
//
// Twilio first because its sandbox lets a team test in a day with no Meta
// approval. Everything else in lib/whatsapp talks to sendWhatsapp(), so moving
// to the Meta Cloud API later changes this one file.
//
// Env:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN   the Twilio account
//   WHATSAPP_FROM                           e.g. whatsapp:+14155238886 (sandbox) or the approved number
//   WHATSAPP_OPTIN_CONTENT_SID              approved template for the opt-in message (optional in the sandbox)
//   WHATSAPP_CHASE_CONTENT_SID              approved template for a chase (optional in the sandbox)
//   WHATSAPP_WEBHOOK_URL                    the public URL Twilio posts replies to, for signature checks
//
// Free text only reaches a person inside the 24 hours after they last wrote to
// us. Outside it WhatsApp needs a template, which is what the two content SIDs
// are for. Without them a send outside the window fails and is logged.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { toWhatsappAddress } from './phone';

export function isWhatsappConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.WHATSAPP_FROM?.trim()
  );
}

export type SendResult = { ok: true; sid: string } | { ok: false; error: string };

export async function sendWhatsapp(input: {
  to: string;
  body: string;
  contentSid?: string | null;
  contentVariables?: Record<string, string>;
}): Promise<SendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.WHATSAPP_FROM?.trim();
  if (!accountSid || !authToken || !from) return { ok: false, error: 'WhatsApp is not set up on the server.' };

  const form = new URLSearchParams();
  form.set('From', from.startsWith('whatsapp:') ? from : `whatsapp:${from}`);
  form.set('To', toWhatsappAddress(input.to));
  if (input.contentSid) {
    form.set('ContentSid', input.contentSid);
    form.set('ContentVariables', JSON.stringify(input.contentVariables ?? {}));
  } else {
    form.set('Body', input.body);
  }

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    const payload = (await res.json().catch(() => null)) as { sid?: string; message?: string } | null;
    if (!res.ok || !payload?.sid) {
      return { ok: false, error: payload?.message || `Twilio answered ${res.status}.` };
    }
    return { ok: true, sid: payload.sid };
  } catch {
    return { ok: false, error: 'Could not reach Twilio.' };
  }
}

/**
 * Twilio signs each webhook: base64 HMAC-SHA1 of the full URL followed by every
 * POST field as name+value, names sorted. Anything unsigned or wrongly signed
 * is not from Twilio and must be dropped.
 */
export function twilioSignatureFor(url: string, params: Record<string, string>, authToken: string): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
}

export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
  authToken: string
): boolean {
  if (!signature || !authToken) return false;
  const expected = Buffer.from(twilioSignatureFor(url, params, authToken));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
