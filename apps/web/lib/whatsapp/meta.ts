// The Meta WhatsApp Cloud API, spoken directly. Pure helpers plus one fetch.
//
// Why direct (2026-11-07, #1119): Twilio adds about $0.005 on every message,
// in and out, on top of Meta's own price. Through Meta directly, replies inside
// the 24-hour window cost nothing and a utility template outside it costs
// Meta's rate alone (about $0.0067 in Nigeria, given in #1112, not re-checked).
//
// Env:
//   WHATSAPP_META_TOKEN            a permanent system-user token with whatsapp_business_messaging
//   WHATSAPP_META_PHONE_NUMBER_ID  the sending number's id (not the number itself)
//   WHATSAPP_META_APP_SECRET       the Meta app's secret, to check webhook signatures
//   WHATSAPP_META_VERIFY_TOKEN     any string; Meta echoes it once when the webhook is added
//   WHATSAPP_META_TEMPLATE_LANG    optional, default "en"
//   WHATSAPP_META_TEMPLATE_<KEY>   optional template name per key; defaults below

import { createHmac, timingSafeEqual } from 'node:crypto';

export const META_GRAPH_VERSION = 'v21.0';

export type TemplateKey = 'opt_in' | 'chase' | 'post_day';

/** Names the templates are submitted under in WhatsApp Manager. */
export const DEFAULT_TEMPLATE_NAMES: Record<TemplateKey, string> = {
  opt_in: 'urganize_opt_in',
  chase: 'urganize_task_chase',
  post_day: 'urganize_post_day',
};

export function isMetaConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_META_TOKEN?.trim() && process.env.WHATSAPP_META_PHONE_NUMBER_ID?.trim());
}

export function metaTemplateName(key: TemplateKey): string {
  const fromEnv = process.env[`WHATSAPP_META_TEMPLATE_${key.toUpperCase()}`]?.trim();
  return fromEnv || DEFAULT_TEMPLATE_NAMES[key];
}

/** Meta wants the number as digits with no "+". */
export function toMetaRecipient(phone: string): string {
  return (phone || '').replace(/\D/g, '');
}

/**
 * Meta refuses a template parameter holding a newline, a tab or more than four
 * spaces in a row, and caps it in length. A task title can hold any of those.
 */
export function cleanTemplateParam(value: string): string {
  const flat = (value || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  return (flat || '-').slice(0, 300);
}

export function buildMetaPayload(
  to: string,
  message: { text: string } | { template: { name: string; lang: string; variables: string[] } }
): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: toMetaRecipient(to) };
  if ('text' in message) {
    return { ...base, type: 'text', text: { preview_url: false, body: message.text.slice(0, 4096) } };
  }
  const { name, lang, variables } = message.template;
  return {
    ...base,
    type: 'template',
    template: {
      name,
      language: { code: lang },
      components: variables.length
        ? [{ type: 'body', parameters: variables.map((v) => ({ type: 'text', text: cleanTemplateParam(v) })) }]
        : [],
    },
  };
}

export type MetaSendResult = { ok: true; sid: string } | { ok: false; error: string };

export async function sendViaMeta(payload: Record<string, unknown>): Promise<MetaSendResult> {
  const token = process.env.WHATSAPP_META_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) return { ok: false, error: 'WhatsApp (Meta) is not set up on the server.' };
  try {
    const res = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => null)) as
      | { messages?: Array<{ id?: string }>; error?: { message?: string; code?: number } }
      | null;
    const id = body?.messages?.[0]?.id;
    if (!res.ok || !id) {
      const code = body?.error?.code ? ` (${body.error.code})` : '';
      return { ok: false, error: `${body?.error?.message || `Meta answered ${res.status}.`}${code}` };
    }
    return { ok: true, sid: id };
  } catch {
    return { ok: false, error: 'Could not reach Meta.' };
  }
}

/** Meta signs each webhook body: "sha256=" + hex HMAC-SHA256 with the app secret. */
export function metaSignatureFor(rawBody: string, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`;
}

export function verifyMetaSignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!signature || !appSecret) return false;
  const expected = Buffer.from(metaSignatureFor(rawBody, appSecret));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type MetaInbound = { from: string; body: string; id: string };
export type MetaStatus = { id: string; status: 'sent' | 'delivered' | 'read' | 'failed'; error: string | null };

type MetaWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
          button?: { text?: string; payload?: string };
          interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
        }>;
        statuses?: Array<{
          id?: string;
          status?: string;
          errors?: Array<{ title?: string; message?: string; code?: number }>;
        }>;
      };
    }>;
  }>;
};

const KNOWN_STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);

/**
 * Pulls the messages people sent and the delivery updates out of one webhook.
 * A button tap reads as its label, the same as Twilio's ButtonText. Media
 * (a voice note, a photo) reads as empty text, the same as Twilio's Body.
 */
export function parseMetaWebhook(payload: unknown): { inbound: MetaInbound[]; statuses: MetaStatus[] } {
  const inbound: MetaInbound[] = [];
  const statuses: MetaStatus[] = [];
  const entries = (payload as MetaWebhookPayload | null)?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const m of value.messages ?? []) {
        if (!m.id || !m.from) continue;
        const body =
          m.text?.body ??
          m.button?.text ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title ??
          '';
        inbound.push({ id: m.id, from: `+${toMetaRecipient(m.from)}`, body: body.trim() });
      }
      for (const s of value.statuses ?? []) {
        if (!s.id || !s.status || !KNOWN_STATUSES.has(s.status)) continue;
        const err = s.errors?.[0];
        statuses.push({
          id: s.id,
          status: s.status as MetaStatus['status'],
          error: err ? `${err.message || err.title || 'Failed'}${err.code ? ` (${err.code})` : ''}` : null,
        });
      }
    }
  }
  return { inbound, statuses };
}
