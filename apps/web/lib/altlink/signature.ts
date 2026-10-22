// Altlink webhook signature check. Server only (node:crypto), kept apart from
// lib/altlink/rules.ts so client components can import those rules.

import { createHmac, timingSafeEqual } from 'node:crypto';

// ── Webhook signature ───────────────────────────────────────────────────────

export const ALTLINK_SIGNATURE_HEADER = 'x-altlink-signature';
export const ALTLINK_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type AltlinkVerifyResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: 'no_secret' | 'no_signature' | 'malformed' | 'stale' | 'mismatch' };

/** `X-Altlink-Signature: t=<ts>,v1=<hex>`, HMAC-SHA256 of `"<t>." + raw body`. */
export function verifyAltlinkSignature(
  secret: string | null | undefined,
  rawBody: string,
  header: string | null | undefined,
  nowMs: number
): AltlinkVerifyResult {
  if (!secret) return { ok: false, reason: 'no_secret' };
  if (!header) return { ok: false, reason: 'no_signature' };
  let t: string | null = null;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const [key, ...rest] = part.trim().split('=');
    const value = rest.join('=').trim();
    if (key === 't') t = value;
    else if (key === 'v1' && value) v1.push(value);
  }
  if (!t || !/^\d+$/.test(t) || v1.length === 0) return { ok: false, reason: 'malformed' };
  const timestamp = Number(t);
  if (Math.abs(nowMs / 1000 - timestamp) > ALTLINK_WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'stale' };
  }
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  const matches = v1.some((given) => {
    if (!/^[0-9a-f]+$/i.test(given) || given.length !== expected.length * 2) return false;
    return timingSafeEqual(Buffer.from(given, 'hex'), expected);
  });
  return matches ? { ok: true, timestamp } : { ok: false, reason: 'mismatch' };
}

/** Build a valid header (tests and the local replay script). */
export function signAltlinkBody(secret: string, rawBody: string, timestamp: number): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}
