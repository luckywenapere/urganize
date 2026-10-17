'use client';

// The browser half of Pitch on credits (URG-345): the calls the Pitch this!
// picker makes, and the one piece of state that has to survive a trip to
// Paystack and back: the pitches waiting to send once a top-up lands.

import { supabase } from '@/lib/supabase/client';
import type { CreditAccount } from '@/lib/credits/allowance';
import type { SentPitch } from '@/types/pitching';

async function authHeaders(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export type PitchCredits = { balance: number; account: CreditAccount; canBuy: boolean; purchasable: boolean };

export async function fetchPitchCredits(): Promise<PitchCredits | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  try {
    const response = await fetch('/api/pitching/credits', { headers, cache: 'no-store' });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<PitchCredits>;
    return {
      balance: Number(body.balance) || 0,
      account: (body.account as CreditAccount) || 'credits_only',
      canBuy: Boolean(body.canBuy),
      purchasable: Boolean(body.purchasable),
    };
  } catch {
    return null;
  }
}

export type SendBody = {
  releaseId: string;
  playlistIds: string[];
  songTitle: string;
  songUrl: string;
  note: string;
  requestId: string;
};

export type SendResult =
  | { ok: true; pitches: SentPitch[]; charged: number; balance: number | null }
  | { ok: false; code: string; error: string; short?: number; balance?: number; needed?: number };

export async function sendCreditPitchesRequest(body: SendBody): Promise<SendResult> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, code: 'auth', error: 'Sign in again to send this pitch.' };
  try {
    const response = await fetch('/api/pitching/send', { method: 'POST', headers, body: JSON.stringify(body) });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return {
        ok: false,
        code: typeof payload.code === 'string' ? payload.code : 'error',
        error: typeof payload.error === 'string' ? payload.error : 'Could not send. Try again.',
        short: typeof payload.short === 'number' ? payload.short : undefined,
        balance: typeof payload.balance === 'number' ? payload.balance : undefined,
        needed: typeof payload.needed === 'number' ? payload.needed : undefined,
      };
    }
    return {
      ok: true,
      pitches: Array.isArray(payload.pitches) ? (payload.pitches as SentPitch[]) : [],
      charged: Number(payload.charged) || 0,
      balance: typeof payload.balance === 'number' ? payload.balance : null,
    };
  } catch {
    return { ok: false, code: 'network', error: 'Could not reach Urganize. Check your connection and try again.' };
  }
}

/** Open Paystack for a pack; Paystack returns through the pitching bridge. */
export async function startTopUp(priceNaira: number): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, error: 'Sign in again to pay.' };
  try {
    const response = await fetch('/api/credits/checkout', {
      method: 'POST',
      headers,
      body: JSON.stringify({ priceNaira, returnTo: '/dashboard/pitching' }),
    });
    const body = (await response.json().catch(() => ({}))) as { authorizationUrl?: string; error?: string };
    if (!response.ok || !body.authorizationUrl) {
      return { ok: false, error: body.error || 'Could not open the payment page. Try again.' };
    }
    return { ok: true, url: body.authorizationUrl };
  } catch {
    return { ok: false, error: 'Could not reach Urganize. Check your connection and try again.' };
  }
}

export type VerifyState = 'paid' | 'pending' | 'not_paid' | 'needs_review' | 'error';

/** Ask whether a top-up landed, a few times, the way BuyCredits does. */
export async function waitForTopUp(reference: string, attempts = 6, gapMs = 2000): Promise<VerifyState> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const headers = await authHeaders();
    if (!headers) return 'error';
    try {
      const response = await fetch(`/api/credits/checkout/verify?reference=${encodeURIComponent(reference)}`, {
        headers,
        cache: 'no-store',
      });
      const body = (await response.json().catch(() => ({}))) as { state?: string };
      if (body.state === 'paid') return 'paid';
      if (body.state === 'needs_review') return 'needs_review';
      if (body.state === 'error') return 'error';
    } catch {
      // A dropped connection is not a failed payment.
    }
    await new Promise((resolve) => setTimeout(resolve, gapMs));
  }
  return 'not_paid';
}

// ─── the pitches waiting on a top-up ──────────────────────────────────────────

const PENDING_KEY = 'urganize.pitchCredits.pending';
/** A pending send older than this is dropped rather than sent by surprise. */
const PENDING_TTL_MS = 2 * 60 * 60 * 1000;

export type PendingCreditSend = SendBody & { savedAt: number };

export function savePendingCreditSend(body: SendBody): void {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify({ ...body, savedAt: Date.now() }));
  } catch {
    // Private mode: the selection is still on screen, it just will not send itself.
  }
}

export function readPendingCreditSend(): PendingCreditSend | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingCreditSend;
    if (!parsed || typeof parsed.releaseId !== 'string' || !Array.isArray(parsed.playlistIds)) return null;
    if (!Number.isFinite(parsed.savedAt) || Date.now() - parsed.savedAt > PENDING_TTL_MS) {
      window.localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingCreditSend(): void {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** For the pitching bridge: which rollout a returning top-up belongs to. */
export function pendingCreditSendReleaseId(): string {
  return readPendingCreditSend()?.releaseId || '';
}

export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
