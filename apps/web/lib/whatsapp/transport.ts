// Sending WhatsApp. Server only.
//
// Two ways out, picked by env (2026-11-07, #1119):
//   meta    the WhatsApp Cloud API directly (lib/whatsapp/meta.ts). The default
//           once WHATSAPP_META_TOKEN and WHATSAPP_META_PHONE_NUMBER_ID are set,
//           because it is the cheapest.
//   twilio  the fallback, used when Meta is not set up, or when
//           WHATSAPP_PROVIDER=twilio forces it (for example if the Meta number
//           is restricted for a day).
// Everything else in lib/whatsapp calls sendWhatsapp() and never knows which.
//
// Twilio env:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN   the Twilio account
//   WHATSAPP_FROM                           e.g. whatsapp:+14155238886 (sandbox) or the approved number
//   WHATSAPP_OPTIN_CONTENT_SID, WHATSAPP_CHASE_CONTENT_SID, WHATSAPP_POST_CONTENT_SID
//                                           approved Twilio templates (optional in the sandbox)
//   WHATSAPP_WEBHOOK_URL                    the public URL Twilio posts replies to, for signature checks
//
// Free text only reaches a person inside the 24 hours after they last wrote to
// us. Outside it WhatsApp needs an approved template, which is what `template`
// is for: on Meta it names the template, on Twilio it picks the content SID.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { toWhatsappAddress } from './phone';
import { buildMetaPayload, isMetaConfigured, metaTemplateName, sendViaMeta, type TemplateKey } from './meta';

export type { TemplateKey } from './meta';
export type WhatsappProvider = 'meta' | 'twilio';

function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.WHATSAPP_FROM?.trim()
  );
}

/** Which way messages go out right now, or null when neither is set up. */
export function whatsappProvider(): WhatsappProvider | null {
  const forced = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase();
  if (forced === 'twilio' && isTwilioConfigured()) return 'twilio';
  if (isMetaConfigured()) return 'meta';
  if (isTwilioConfigured()) return 'twilio';
  return null;
}

export function isWhatsappConfigured(): boolean {
  return whatsappProvider() !== null;
}

export type SendResult = { ok: true; sid: string } | { ok: false; error: string };

const TWILIO_CONTENT_SID_ENV: Record<TemplateKey, string> = {
  opt_in: 'WHATSAPP_OPTIN_CONTENT_SID',
  chase: 'WHATSAPP_CHASE_CONTENT_SID',
  post_day: 'WHATSAPP_POST_CONTENT_SID',
};

/**
 * `body` is the plain text, always logged and used for free-text sends.
 * `template` is how the same words go out when a template is needed: its
 * variables are {{1}}, {{2}}, ... in order.
 */
export async function sendWhatsapp(input: {
  to: string;
  body: string;
  template?: { key: TemplateKey; variables: string[] } | null;
}): Promise<SendResult> {
  const provider = whatsappProvider();
  if (!provider) return { ok: false, error: 'WhatsApp is not set up on the server.' };

  if (provider === 'meta') {
    const lang = process.env.WHATSAPP_META_TEMPLATE_LANG?.trim() || 'en';
    const payload = input.template
      ? buildMetaPayload(input.to, {
          template: { name: metaTemplateName(input.template.key), lang, variables: input.template.variables },
        })
      : buildMetaPayload(input.to, { text: input.body });
    return sendViaMeta(payload);
  }

  const contentSid = input.template ? process.env[TWILIO_CONTENT_SID_ENV[input.template.key]]?.trim() || null : null;
  const contentVariables = input.template
    ? Object.fromEntries(input.template.variables.map((v, i) => [String(i + 1), v]))
    : {};
  return sendViaTwilio({ to: input.to, body: input.body, contentSid, contentVariables });
}

async function sendViaTwilio(input: {
  to: string;
  body: string;
  contentSid: string | null;
  contentVariables: Record<string, string>;
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
    form.set('ContentVariables', JSON.stringify(input.contentVariables));
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
