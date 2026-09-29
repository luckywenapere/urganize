/**
 * Curator pitch payments, browser side: one small function per route, so the
 * screens never build a request by hand. Every call carries the session token
 * and answers the same shape, so a screen only ever checks `ok` and shows
 * `error`.
 *
 * Opening Paystack follows the billing wall's rule: in the phone app the
 * payment page opens in the system browser rather than taking over the app's
 * own webview, and on the web the tab goes there.
 */

import { supabase } from '@/lib/supabase/client';
import { isIOSApp, isNativePlatform } from '@/lib/platform';
import { openExternalUrl } from '@/lib/external-link';
import type { PaystackBank } from '@/lib/paystack-server';
import type {
  CuratorEarnings,
  CuratorPayoutAccount,
  CuratorPricing,
  PitchQuote,
  PitchReceipt,
} from '@/types/pitch-payments';

export type ClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; code?: string; body?: Record<string, unknown> };

const NETWORK_ERROR = "Couldn't reach Urganize. Check your connection and try again.";

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

async function call<T>(
  path: string,
  init: { method?: string; body?: Record<string, unknown> } = {}
): Promise<ClientResult<T>> {
  const token = await accessToken();
  if (!token) return { ok: false, status: 401, error: 'Sign in again to carry on.' };

  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: typeof body?.error === 'string' ? body.error : 'That did not work. Try again.',
      code: typeof body?.code === 'string' ? body.code : undefined,
      body: body ?? undefined,
    };
  }
  return { ok: true, data: (body ?? {}) as T };
}

// ─── the paying side ─────────────────────────────────────────────────────────

/**
 * Paid pitching is not offered inside the iOS app, the same line the billing
 * wall draws: Apple does not allow a reviewed iOS app to send people to an
 * outside payment page for something used in the app. The web and the Android
 * app take payments; the iOS app points to the web.
 */
export function canPayForPitchesHere(): boolean {
  return !isIOSApp();
}

export function requestPitchQuote(
  body:
    | { releaseId: string; playlistIds: string[]; songTitle: string; songUrl: string; note: string }
    | { pitchIds: string[] }
) {
  return call<{ quote: PitchQuote }>('/api/pitching/quote', { method: 'POST', body });
}

export function startPitchCheckout(quoteId: string, termsVersion: string) {
  return call<{ authorizationUrl: string; reference: string; quote: PitchQuote }>('/api/pitching/checkout', {
    method: 'POST',
    body: { quoteId, termsVersion },
  });
}

/** Sends the artist to Paystack. */
export async function openPaystackCheckout(authorizationUrl: string): Promise<void> {
  if (isNativePlatform()) {
    await openExternalUrl(authorizationUrl);
    return;
  }
  if (typeof window !== 'undefined') window.location.href = authorizationUrl;
}

export function removeUnpaidPitch(pitchId: string) {
  return call<{ removed: boolean }>(`/api/pitching/pitches/${encodeURIComponent(pitchId)}`, {
    method: 'DELETE',
  });
}

export type PitchPaymentState = 'paid' | 'not_paid' | 'needs_review' | 'pending' | 'error';

export function verifyPitchPayment(reference: string) {
  return call<{ state: PitchPaymentState; quote: PitchQuote }>(
    `/api/pitching/checkout/verify?reference=${encodeURIComponent(reference)}`
  );
}

export function loadPitchReceipts() {
  return call<{ receipts: PitchReceipt[]; truncated: boolean }>('/api/pitching/payments');
}

// ─── the curator side ────────────────────────────────────────────────────────

export function loadCuratorEarnings() {
  return call<CuratorEarnings>('/api/curator/earnings');
}

export function loadPayoutBanks() {
  return call<{ banks: PaystackBank[] }>('/api/curator/payouts/banks');
}

export function resolvePayoutAccount(bankCode: string, accountNumber: string) {
  return call<{ accountName: string; bankName: string }>('/api/curator/payouts/resolve', {
    method: 'POST',
    body: { bankCode, accountNumber },
  });
}

export function savePayoutAccount(input: {
  bankCode: string;
  accountNumber: string;
  termsVersion: string;
}) {
  return call<{ account: CuratorPayoutAccount }>('/api/curator/payouts/account', {
    method: 'POST',
    body: { ...input, acceptTerms: true },
  });
}

export function removePayoutAccount() {
  return call<{ account: null }>('/api/curator/payouts/account', { method: 'DELETE' });
}

export function saveCuratorPricing(price: string, live: boolean) {
  return call<{ pricing: CuratorPricing; livePriceKobo: number | null }>('/api/curator/pricing', {
    method: 'PUT',
    body: { price, live },
  });
}

export function stopCuratorPricing() {
  return call<{ pricing: CuratorPricing | null; livePriceKobo: null }>('/api/curator/pricing', {
    method: 'DELETE',
  });
}
