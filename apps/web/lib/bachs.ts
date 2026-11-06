import { createHmac, timingSafeEqual } from 'node:crypto';

// Bachs (bachs.io) payments, 2026-11-01 (#946). Pure pieces, so vitest holds
// them: which API a key talks to, how money is written, and the webhook
// signature check. The network calls live in lib/bachs-server.ts.
//
// What Bachs takes (docs.bachs.io, payment-method-support): Naira card and
// bank transfer, mobile money in nine African currencies, dollar cards and
// USDT/USDC. Only dollar cards can renew on their own, so every payment here
// buys one month or one year, and the renewal reminders ask for the next.

/** Sandbox keys start sk_sandbox_, live keys sk_live_. */
export function bachsBaseUrl(secretKey: string): string {
  return secretKey.startsWith('sk_live_') ? 'https://api.bachs.io' : 'https://sandbox-api.bachs.io';
}

/** On when the server has a key. The plan wall asks the server, never the env. */
export function isBachsConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.BACHS_SECRET_KEY?.trim());
}

/**
 * Whether checkout offers Bachs to this person. Bachs is for people paying from
 * outside Nigeria: in Naira, Paystack is cheaper (card 1.5% against 2%, transfer
 * capped at ₦300 against ₦2,000), so someone in Nigeria gets Paystack's card and
 * bank transfer. `country` is the two-letter code Vercel puts on the request
 * (x-vercel-ip-country). When it is missing (local dev, or Vercel could not tell),
 * Paystack is shown: most of our buyers are in Nigeria, and it still works.
 */
export function shouldOfferBachs(configured: boolean, country: string | null | undefined): boolean {
  if (!configured) return false;
  const code = (country ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return false;
  return code !== 'NG';
}

/** Bachs writes money as a decimal string in major units: 2,600,00 kobo -> "2600.00". */
export function koboToBachsAmount(kobo: number): string {
  return (Math.round(kobo) / 100).toFixed(2);
}

/** "2600.00" -> 260000 kobo. NaN for anything that is not a number. */
export function bachsAmountToKobo(amount: unknown): number {
  const value = typeof amount === 'number' ? amount : Number(String(amount ?? '').trim());
  return Number.isFinite(value) ? Math.round(value * 100) : Number.NaN;
}

/** Our own reference for a checkout, also sent to Bachs. */
export function newBachsReference(random: () => string = () => Math.random().toString(16).slice(2, 10)): string {
  return `urganize_bx_${Date.now()}_${random()}`;
}

/** How long a signed webhook stays acceptable (Bachs's own examples use 5 minutes). */
export const BACHS_SIGNATURE_TOLERANCE_SECONDS = 300;

function hexEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The webhook is genuine: HMAC-SHA256 of "{timestamp}.{raw body}" with the
 * endpoint's signing secret, hex. Accepts X-Bachs-Signature-V2
 * ("t=..,v1=..,v1=..", any v1 may match) or the bare X-Bachs-Signature with
 * X-Bachs-Timestamp. Refuses a timestamp more than five minutes off.
 */
export function verifyBachsSignature(input: {
  rawBody: string;
  secret: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  signatureV2Header: string | null;
  nowSeconds?: number;
}): boolean {
  const secret = input.secret.trim();
  if (!secret) return false;

  let timestamp = (input.timestampHeader ?? '').trim();
  const candidates: string[] = [];
  if (input.signatureV2Header) {
    for (const part of input.signatureV2Header.split(',')) {
      const [key, ...rest] = part.trim().split('=');
      const value = rest.join('=').trim();
      if (key === 't' && value) timestamp = value;
      if (key === 'v1' && value) candidates.push(value.toLowerCase());
    }
  }
  if (input.signatureHeader) candidates.push(input.signatureHeader.trim().toLowerCase());
  if (!timestamp || candidates.length === 0) return false;

  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - seconds) > BACHS_SIGNATURE_TOLERANCE_SECONDS) return false;

  // The portal shows the secret as "whsec_..."; the docs do not say whether
  // the prefix is part of the key, so either form is accepted.
  const keys = secret.startsWith('whsec_') ? [secret, secret.slice('whsec_'.length)] : [secret];
  return keys.some((key) => {
    const expected = createHmac('sha256', key).update(`${timestamp}.${input.rawBody}`, 'utf8').digest('hex');
    return candidates.some((candidate) => hexEqual(expected, candidate));
  });
}

/** A webhook event as far as we read it. */
export type BachsEvent = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

export function parseBachsEvent(rawBody: string): BachsEvent | null {
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    const data = parsed.data;
    if (typeof parsed.type !== 'string' || !data || typeof data !== 'object') return null;
    return { id: String(parsed.id ?? ''), type: parsed.type, data: data as Record<string, unknown> };
  } catch {
    return null;
  }
}

/**
 * The money arrived, as far as this event says: checkout.completed with
 * payment_status "paid" (the GET endpoint says "succeeded"; both accepted),
 * or collection.succeeded with SUCCEEDED, ACCEPTED or OVERPAID. Returns our
 * reference and what was paid, or null for any other event.
 */
export function paidCheckoutFromEvent(
  event: BachsEvent
): { reference: string; checkoutId: string | null; amount: string; currency: string; method: string | null } | null {
  const data = event.data;
  const reference = typeof data.reference === 'string' ? data.reference : '';
  const checkoutId = typeof data.checkout_id === 'string' ? data.checkout_id : null;
  const amount = String(data.amount ?? '');
  const currency = String(data.currency ?? '').toUpperCase();
  const details = data.payment_method_details as Record<string, unknown> | undefined;
  const method = typeof details?.type === 'string' ? details.type : null;
  if (!reference) return null;

  if (event.type === 'checkout.completed') {
    const status = String(data.payment_status ?? '').toLowerCase();
    if (status !== 'paid' && status !== 'succeeded') return null;
    return { reference, checkoutId, amount, currency, method };
  }
  if (event.type === 'collection.succeeded') {
    const status = String(data.status ?? '').toUpperCase();
    if (status !== 'SUCCEEDED' && status !== 'ACCEPTED' && status !== 'OVERPAID') return null;
    return { reference, checkoutId, amount, currency, method };
  }
  return null;
}

/** A checkout as GET /v1/checkout-sessions/{id} returns it, as far as we read it. */
export type RemoteCheckout = {
  status?: string;
  payment_status?: string;
  amount?: string | number;
  currency?: string;
  reference?: string;
  charge?: { amount?: string | number; currency?: string; status?: string } | null;
};

/** Bachs says this checkout is paid, for exactly our amount in Naira. */
export function remoteCheckoutIsPaid(remote: RemoteCheckout, row: { amount_kobo: number; reference: string }): boolean {
  const status = String(remote.status ?? '').toLowerCase();
  const paymentStatus = String(remote.payment_status ?? '').toLowerCase();
  if (status !== 'completed') return false;
  if (paymentStatus !== 'succeeded' && paymentStatus !== 'paid') return false;
  if (remote.reference && remote.reference !== row.reference) return false;
  if (String(remote.currency ?? '').toUpperCase() !== 'NGN') return false;
  return bachsAmountToKobo(remote.amount) === row.amount_kobo;
}
