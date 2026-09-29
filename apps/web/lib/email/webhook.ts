// Resend webhook: signature verification and the event-to-status mapping. Pure
// (node:crypto only), so it is unit-tested directly.
//
// Resend signs webhooks with Svix. The signed content is
// `${svix-id}.${svix-timestamp}.${raw body}`, the key is the base64 part of the
// `whsec_…` secret, and the svix-signature header is a space-separated list of
// `v1,<base64 hmac>` (more than one during a secret rotation).

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { EmailLogStatus } from './log-server';

/** How far a signed timestamp may be from now. Bounds replay of a captured
 *  request; Svix's own default. */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type WebhookHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

export function verifyResendWebhook(
  secret: string,
  rawBody: string,
  headers: WebhookHeaders,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(nowSeconds - sentAt) > WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }

  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();

  return signature.split(' ').some((part) => {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type ResendEvent = {
  type: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    bounce?: { type?: string };
  };
};

/** The log status a Resend event maps to, or null for events we ignore
 *  (opened, clicked, and anything new). */
export function statusForEvent(type: string): EmailLogStatus | null {
  switch (type) {
    case 'email.delivered':
      return 'delivered';
    case 'email.delivery_delayed':
      return 'delayed';
    case 'email.bounced':
      return 'bounced';
    case 'email.complained':
      return 'complained';
    case 'email.failed':
      return 'failed';
    default:
      return null;
  }
}

const RANK: Partial<Record<EmailLogStatus, number>> = {
  pending: 0,
  sent: 1,
  delayed: 2,
  delivered: 3,
  failed: 4,
  bounced: 4,
  complained: 5,
};

/** Webhooks arrive out of order and get retried, so a status only ever moves
 *  forward. A `delivered` landing after `bounced` (or a replay of `delayed`
 *  after `delivered`) must not rewrite the record. */
export function shouldAdvanceStatus(current: EmailLogStatus, next: EmailLogStatus): boolean {
  const from = RANK[current];
  const to = RANK[next];
  if (from === undefined || to === undefined) return false;
  return to > from;
}

/** A bounce we should stop sending to. A temporary bounce (full mailbox) is not
 *  a reason to suppress the address. Anything unspecified is treated as
 *  permanent, since sending again to a dead address damages sender reputation. */
export function isPermanentBounce(event: ResendEvent): boolean {
  const type = event.data?.bounce?.type?.toLowerCase();
  return type !== 'transient' && type !== 'temporary';
}

export function recipientOf(event: ResendEvent): string | null {
  const to = event.data?.to;
  const first = Array.isArray(to) ? to[0] : to;
  return typeof first === 'string' && first.includes('@') ? first.trim().toLowerCase() : null;
}
