// Unsubscribe tokens and List-Unsubscribe headers. Pure apart from reading the
// signing secret from env; no I/O, so it is unit-tested directly.
//
// A token is `<base64url payload>.<base64url hmac>` and carries the address and
// the category scope it unsubscribes, so the public unsubscribe page needs no
// database read to know what a link means. It is signed rather than looked up
// because the link goes in an email and has to work years later for someone who
// is not signed in.
//
// The secret is EMAIL_UNSUBSCRIBE_SECRET when set, else derived from
// RESEND_API_KEY (already set wherever email works, and domain-separated so the
// key itself is never used as the HMAC key). Neither present means no link can
// be made, and unsubscribable mail degrades to sending without one.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isUnsubscribableCategory, type EmailCategory } from './registry';

export const UNSUBSCRIBE_PATH = '/unsubscribe';
export const UNSUBSCRIBE_API_PATH = '/api/email/unsubscribe';

export type UnsubscribeScope = Extract<EmailCategory, 'onboarding' | 'reminders' | 'announcements'>;

export const UNSUBSCRIBE_SCOPE_LABELS: Record<UnsubscribeScope, string> = {
  onboarding: 'getting-started emails',
  reminders: 'release reminders',
  announcements: 'product announcements',
};

export function isUnsubscribeScope(value: unknown): value is UnsubscribeScope {
  return typeof value === 'string' && value in UNSUBSCRIBE_SCOPE_LABELS;
}

export function readUnsubscribeSecret(): string | null {
  const explicit = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  if (explicit) return explicit;
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) return null;
  return createHash('sha256').update(`urganize:email-unsubscribe:${resendKey}`).digest('hex');
}

const b64 = (input: Buffer | string) => Buffer.from(input).toString('base64url');

function sign(secret: string, payload: string): string {
  return b64(createHmac('sha256', secret).update(payload).digest());
}

export function signUnsubscribeToken(
  secret: string,
  email: string,
  scope: UnsubscribeScope
): string {
  const payload = b64(JSON.stringify({ e: email.trim().toLowerCase(), s: scope }));
  return `${payload}.${sign(secret, payload)}`;
}

export type VerifiedUnsubscribe = { email: string; scope: UnsubscribeScope };

/** Null for anything that is not a token this secret signed. Never throws. */
export function verifyUnsubscribeToken(
  secret: string,
  token: string | null | undefined
): VerifiedUnsubscribe | null {
  if (!token || token.length > 1024) return null;
  const [payload, signature, ...rest] = token.split('.');
  if (!payload || !signature || rest.length) return null;

  const expected = Buffer.from(sign(secret, payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      e?: unknown;
      s?: unknown;
    };
    if (typeof parsed.e !== 'string' || !parsed.e.includes('@') || !isUnsubscribeScope(parsed.s)) {
      return null;
    }
    return { email: parsed.e, scope: parsed.s };
  } catch {
    return null;
  }
}

/** The public page link. `origin` is the app's own origin, never user input. */
export function buildUnsubscribeUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}${UNSUBSCRIBE_PATH}?t=${encodeURIComponent(token)}`;
}

/** RFC 8058 one-click headers. The POST target is the API route, and the token
 *  rides in the query string because the body of a one-click POST is fixed. */
export function buildUnsubscribeHeaders(origin: string, token: string): Record<string, string> {
  const postUrl = `${origin.replace(/\/+$/, '')}${UNSUBSCRIBE_API_PATH}?t=${encodeURIComponent(token)}`;
  return {
    'List-Unsubscribe': `<${postUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/** The unsubscribe scope a template category maps to, or null when the category
 *  is not one a recipient can turn off. */
export function unsubscribeScopeFor(category: EmailCategory): UnsubscribeScope | null {
  return isUnsubscribableCategory(category) ? (category as UnsubscribeScope) : null;
}
