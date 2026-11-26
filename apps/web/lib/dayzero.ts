// Day Zero lifetime deals (#1393). Pure: no I/O, no env reads, so every rule
// here is unit-tested in lib/dayzero.test.ts. The I/O lives in
// lib/dayzero-server.ts.
//
// Day Zero (dayzero.ltd) works like AppSumo Licensing v2: a signed webhook
// tells us a license was bought, activated or refunded, and an OAuth redirect
// brings the buyer to /dayzero/callback to claim it. One active license gives
// the account it is attached to the Pro plan (code id `manager`) for life.
// The plan is not written to `subscriptions`: getSubscriptionSnapshot folds an
// active license in (applyLifetimeLicense below), so a Paystack renewal can
// never overwrite it and a refund only has to flip the license row.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { DAYZERO_CLAIM_COOKIE, DAYZERO_CLAIM_TTL_SECONDS, DAYZERO_PENDING_COOKIE } from './dayzero-shared';

export { DAYZERO_CLAIM_COOKIE, DAYZERO_CLAIM_TTL_SECONDS, DAYZERO_PENDING_COOKIE };
export { DAYZERO_PLAN, applyLifetimeLicense, hasLiveCardPlan } from './dayzero-shared';
export type { DayzeroClaimState } from './dayzero-shared';


export const DAYZERO_EVENTS = [
  'purchase',
  'activate',
  'deactivate',
  'upgrade',
  'downgrade',
  'migrate',
] as const;
export type DayzeroEvent = (typeof DAYZERO_EVENTS)[number];

export type DayzeroLicenseStatus = 'inactive' | 'active' | 'deactivated';

export type DayzeroWebhookPayload = {
  licenseKey: string;
  event: DayzeroEvent;
  /** The status BEFORE this event, as Day Zero saw it. Informational only. */
  licenseStatus: string | null;
  /** When the event happened, in ms. Orders events that arrive out of order. */
  eventTimestamp: number;
  tier: number | null;
  test: boolean;
  prevLicenseKey: string | null;
  reason: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLicenseKey(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

// ── Webhook signature ───────────────────────────────────────────────────────

/** Hex HMAC-SHA256 of timestamp + raw body, keyed with the API key. */
export function signDayzeroPayload(timestamp: string, rawBody: string, apiKey: string): string {
  return createHmac('sha256', apiKey).update(`${timestamp}${rawBody}`).digest('hex');
}

/** Timing-safe check of X-DayZero-Signature. Any missing piece is a no. */
export function verifyDayzeroSignature(input: {
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  apiKey: string | null | undefined;
}): boolean {
  const { timestamp, signature, rawBody, apiKey } = input;
  if (!apiKey || !timestamp || !signature) return false;
  const expected = Buffer.from(signDayzeroPayload(timestamp, rawBody, apiKey), 'utf8');
  const given = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

// ── Webhook body ────────────────────────────────────────────────────────────

const toMs = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

/** Parse the webhook body. Returns null when it is not something we can act
 * on (the route still answers 200 so Day Zero does not retry garbage). */
export function parseDayzeroWebhook(body: unknown, nowMs = Date.now()): DayzeroWebhookPayload | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const event = typeof record.event === 'string' ? record.event.trim().toLowerCase() : '';
  if (!(DAYZERO_EVENTS as readonly string[]).includes(event)) return null;
  const test = record.test === true;
  const licenseKey = typeof record.license_key === 'string' ? record.license_key.trim().toLowerCase() : '';
  // A test event may carry a placeholder key; it never reaches the database.
  if (!test && !isLicenseKey(licenseKey)) return null;
  const prev = typeof record.prev_license_key === 'string' ? record.prev_license_key.trim().toLowerCase() : '';
  const extra = record.extra && typeof record.extra === 'object' ? (record.extra as Record<string, unknown>) : {};
  const tier = typeof record.tier === 'number' && Number.isFinite(record.tier) ? record.tier : null;
  return {
    licenseKey,
    event: event as DayzeroEvent,
    licenseStatus: typeof record.license_status === 'string' ? record.license_status : null,
    eventTimestamp: toMs(record.event_timestamp) ?? toMs(record.created_at) ?? nowMs,
    tier,
    test,
    prevLicenseKey: isLicenseKey(prev) ? prev : null,
    reason: typeof extra.reason === 'string' ? extra.reason.slice(0, 500) : null,
  };
}

// ── What an event does to a license row ─────────────────────────────────────

export type LicenseRow = {
  status: DayzeroLicenseStatus;
  userId: string | null;
  /** Timestamp (ms) of the last event applied. A record only; never used to order. */
  lastEventMs: number | null;
};

/**
 * The status an event moves a license to, or null for "change nothing".
 *
 * A refund is final. Once a license is deactivated, no activate (a late one, a
 * retried one, or the OAuth step) brings Pro back; only an upgrade, downgrade
 * or migrate to a NEW license key can. This does not lean on timestamps on
 * purpose: Day Zero may give a retried webhook a fresh event_timestamp, so an
 * old activate retried after a refund would look newer than the refund.
 *
 * Idempotent: a repeat changes nothing. `purchase` only ever creates the row.
 */
export function nextLicenseStatus(
  current: LicenseRow | null,
  event: 'purchase' | 'activate' | 'deactivate'
): DayzeroLicenseStatus | null {
  if (event === 'purchase') return current ? null : 'inactive';
  if (current?.status === 'deactivated') return null;
  const target: DayzeroLicenseStatus = event === 'activate' ? 'active' : 'deactivated';
  if (current?.status === target) return null;
  return target;
}

// ── The short-lived claim cookie ────────────────────────────────────────────

/** `<key>.<expiresMs>.<hmac>`, signed so nobody can plant someone else's key. */
export function encodeClaimCookie(licenseKey: string, expiresMs: number, secret: string): string {
  const body = `${licenseKey}.${expiresMs}`;
  const mac = createHmac('sha256', secret).update(`dayzero-claim:${body}`).digest('hex');
  return `${body}.${mac}`;
}

export function decodeClaimCookie(
  value: string | null | undefined,
  secret: string | null | undefined,
  nowMs = Date.now()
): string | null {
  if (!value || !secret) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [key, expires, mac] = parts;
  if (!isLicenseKey(key)) return null;
  const expiresMs = Number(expires);
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) return null;
  const expected = Buffer.from(
    createHmac('sha256', secret).update(`dayzero-claim:${key}.${expires}`).digest('hex'),
    'utf8'
  );
  const given = Buffer.from(mac, 'utf8');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return key.toLowerCase();
}
