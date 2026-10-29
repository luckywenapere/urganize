// Closed sign-up (2026-10-15), browser half of a /start/<code> invite.
//
// The person opens my.urganize.app/start/<code>, then signs up, often with
// Google, which leaves the site and comes back. The code has to survive that
// trip, so it lives in localStorage (sessionStorage does not survive the
// system-browser round trip the Expo shell uses), with its own expiry so a
// stale code never lingers. After sign-in the code is posted to
// /api/access/redeem, which does the real check.
//
// FAILS TOWARD NO INTENT: losing it costs one tap on the link again.

import { looksLikeAccessCode, ACCESS_INVITE_TTL_DAYS } from './access-gate';
import { readWelcomeIntent } from './welcome-intent';
import { looksLikeShareCode, normalizeShareCode } from './waitlist-share';

const ACCESS_INTENT_KEY = 'urganize.access.code';

type StoredIntent = { code: string; savedAt: number };

export function markAccessIntent(code: string): void {
  if (typeof window === 'undefined' || !looksLikeAccessCode(code)) return;
  try {
    const value: StoredIntent = { code, savedAt: Date.now() };
    window.localStorage.setItem(ACCESS_INTENT_KEY, JSON.stringify(value));
  } catch {
    // Blocked or full. They tap the link again.
  }
}

export function readAccessIntent(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ACCESS_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredIntent>;
    const fresh =
      typeof parsed.savedAt === 'number' &&
      Date.now() - parsed.savedAt < ACCESS_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;
    if (!fresh || !looksLikeAccessCode(parsed.code)) {
      window.localStorage.removeItem(ACCESS_INTENT_KEY);
      return null;
    }
    return parsed.code;
  } catch {
    return null;
  }
}

export function clearAccessIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ACCESS_INTENT_KEY);
  } catch {
    // Already gone.
  }
}

// A friend link (/r/<code>, 2026-10-23): the waitlist share link. Same keeping
// rules as the invite code above. It does not let anyone in by itself: it only
// lets the sign-up start and credits the sharer once the account exists.
const FRIEND_INTENT_KEY = 'urganize.friend.code';

export function markFriendIntent(code: string): void {
  if (typeof window === 'undefined' || !looksLikeShareCode(code)) return;
  try {
    const value: StoredIntent = { code: normalizeShareCode(code), savedAt: Date.now() };
    window.localStorage.setItem(FRIEND_INTENT_KEY, JSON.stringify(value));
  } catch {
    // Blocked or full. They tap the link again.
  }
}

export function readFriendIntent(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(FRIEND_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredIntent>;
    const fresh =
      typeof parsed.savedAt === 'number' &&
      Date.now() - parsed.savedAt < ACCESS_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;
    if (!fresh || !looksLikeShareCode(parsed.code)) {
      window.localStorage.removeItem(FRIEND_INTENT_KEY);
      return null;
    }
    return parsed.code;
  } catch {
    return null;
  }
}

export function clearFriendIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(FRIEND_INTENT_KEY);
  } catch {
    // Already gone.
  }
}

/** True when this browser carries something that may let its next account in. */
export function hasPendingAccessIntent(): boolean {
  return Boolean(readAccessIntent() || readWelcomeIntent() || readFriendIntent());
}

/** `answered` is false when the server gave no verdict (offline, 5xx). */
export type RedeemAnswer = { approved: boolean; answered: boolean; outcome?: string };

/**
 * Posts whatever this browser holds (a /start code, a founder /welcome link)
 * and answers whether the signed-in account is let in. The code is dropped once
 * the server has given a final answer for it. Never throws: on a network
 * failure it answers approved=true so the caller carries on and the server's
 * own gate decides on the next request.
 */
/**
 * The codes an email sign-up carried in its user_metadata (URG-386), read
 * from the access token's claims. A confirmation link opened in another
 * browser (the Gmail app's, another device) has no localStorage copy, and
 * without this the account would be held as "not let in".
 */
export function accessIntentFromToken(accessToken: string): { code: string | null; welcomeToken: string | null } {
  try {
    const part = accessToken.split('.')[1] || '';
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary');
    const claims = JSON.parse(json) as { user_metadata?: Record<string, unknown> };
    const metadata = claims.user_metadata || {};
    const code = metadata.pending_access_code;
    const welcomeToken = metadata.pending_welcome_token;
    return {
      code: looksLikeAccessCode(code) ? code : null,
      welcomeToken: typeof welcomeToken === 'string' && welcomeToken.trim() ? welcomeToken.trim().slice(0, 200) : null,
    };
  } catch {
    return { code: null, welcomeToken: null };
  }
}

export async function redeemPendingAccess(accessToken: string): Promise<RedeemAnswer> {
  const fromToken = accessIntentFromToken(accessToken);
  const code = readAccessIntent() ?? fromToken.code;
  const welcomeToken = readWelcomeIntent() ?? fromToken.welcomeToken;
  const friendCode = readFriendIntent();
  try {
    const response = await fetch('/api/access/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        ...(code ? { code } : {}),
        ...(welcomeToken ? { welcomeToken } : {}),
        ...(friendCode ? { friendCode } : {}),
      }),
    });
    if (!response.ok) return { approved: true, answered: false };
    // The server has answered, and a friend code counts at most once per account.
    if (friendCode) clearFriendIntent();
    const payload = (await response.json().catch(() => ({}))) as Partial<RedeemAnswer>;
    if (code && payload.outcome && payload.outcome !== 'error') clearAccessIntent();
    return { approved: payload.approved !== false, answered: true, outcome: payload.outcome };
  } catch {
    return { approved: true, answered: false };
  }
}

/** Signed out: may this email start an account? Fails open. */
export async function checkEmailAccess(email: string): Promise<boolean> {
  if (hasPendingAccessIntent()) return true;
  try {
    const response = await fetch('/api/access/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) return true;
    const payload = (await response.json().catch(() => ({}))) as { allowed?: boolean };
    return payload.allowed !== false;
  } catch {
    return true;
  }
}
