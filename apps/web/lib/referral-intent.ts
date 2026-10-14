import { isReferralsEnabled, normalizeReferralCode } from './referrals';

/**
 * "This person came in through a partner's link."
 *
 * A partner shares `/onboarding?ref=CODE`. Signing up is a whole wizard with an
 * account, a Google round trip and a first rollout in the middle, so the code
 * has to be remembered across all of it and handed to the server once the
 * person's team exists (POST /api/referrals/attach).
 *
 * LOCALSTORAGE, NOT SESSIONSTORAGE. The pitch-page intent next door lives in
 * sessionStorage because it is only a destination. A referral decides who is
 * paid, and people click a link, close the tab and sign up from the homepage the
 * next day. Thirty days is the window; after that the code is forgotten.
 *
 * LAST LINK WINS. Somebody who followed two partners' links gets the more
 * recent one, which is the one they came in on.
 *
 * Everything here is best-effort and never throws: a blocked store means the
 * person is simply not attributed, which costs a partner a commission and costs
 * the person nothing. The server is the authority on whether the code counts
 * (new team, not an invitee, once only), so nothing here is trusted.
 */

const REFERRAL_KEY = 'urganize.referral';
export const REFERRAL_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The code in a query string, normalised, or null. Pure. */
export function parseReferralParam(search: string): string | null {
  try {
    return normalizeReferralCode(new URLSearchParams(search).get('ref'));
  } catch {
    return null;
  }
}

/** Whether a remembered code is still inside its window. Pure. An unreadable or
 *  future timestamp is treated as stale: attribution fails toward not paying. */
export function isReferralFresh(atMs: unknown, now: number): boolean {
  if (typeof atMs !== 'number' || !Number.isFinite(atMs)) return false;
  const age = now - atMs;
  return age >= 0 && age <= REFERRAL_WINDOW_DAYS * DAY_MS;
}

/** Remember the code carried by this page's query string, if there is one. */
export function captureReferralFromSearch(search: string, now: number = Date.now()): void {
  if (typeof window === 'undefined' || !isReferralsEnabled()) return;
  const code = parseReferralParam(search);
  if (!code) return;
  try {
    window.localStorage.setItem(REFERRAL_KEY, JSON.stringify({ code, at: now }));
  } catch {
    // Storage blocked or full: they are not attributed, and nothing else changes.
  }
}

/** The remembered code, re-validated rather than trusted (the store is editable
 *  by hand and the value goes to the server), or null. */
export function readReferralCode(now: number = Date.now()): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(REFERRAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { code?: unknown; at?: unknown };
    const code = normalizeReferralCode(parsed.code);
    if (!code || !isReferralFresh(parsed.at, now)) return null;
    return code;
  } catch {
    return null;
  }
}

/**
 * The optional "Referral code" field on onboarding's account step (URG-251
 * Part 1): somebody who heard about Urganize by word of mouth has no `?ref=`
 * link, so they type the code. It feeds the SAME store the link does, so the
 * same POST /api/referrals/attach hands it to the server once the team exists;
 * the server stays the authority (new team, not an invitee, once only).
 *
 * Pure in its decision: an empty field is fine, a malformed one is 'invalid'
 * (shown as one calm line, never a block), and a good one is normalised.
 */
export type TypedReferralVerdict =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'valid'; code: string };

export function judgeTypedReferralCode(raw: unknown): TypedReferralVerdict {
  if (typeof raw !== 'string' || !raw.trim()) return { kind: 'empty' };
  const code = normalizeReferralCode(raw);
  return code ? { kind: 'valid', code } : { kind: 'invalid' };
}

/**
 * Remember what the person typed, as the code to attach. Last code wins, the
 * same rule as two links. An emptied field forgets a remembered code (they
 * cleared the prefill on purpose); a malformed one changes nothing and is
 * reported back so the field can say so.
 */
export function rememberTypedReferralCode(raw: unknown, now: number = Date.now()): TypedReferralVerdict {
  const verdict = judgeTypedReferralCode(raw);
  if (typeof window === 'undefined' || !isReferralsEnabled()) return verdict;
  try {
    if (verdict.kind === 'valid') {
      window.localStorage.setItem(REFERRAL_KEY, JSON.stringify({ code: verdict.code, at: now }));
    } else if (verdict.kind === 'empty') {
      window.localStorage.removeItem(REFERRAL_KEY);
    }
  } catch {
    // Storage blocked: they are not attributed, and sign-up carries on.
  }
  return verdict;
}

export function clearReferralCode(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(REFERRAL_KEY);
  } catch {
    // Already gone or blocked.
  }
}

/**
 * Hand the remembered code to the server, once. Called at the end of signup,
 * after the person's team exists. Clears the code on any definite answer (tagged
 * or refused) and keeps it only when the server says the team was not there yet.
 * Never throws and never delays the signup for more than a few seconds.
 */
export async function reportReferralCode(token: string): Promise<void> {
  if (!isReferralsEnabled()) return;
  const code = readReferralCode();
  if (!code) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch('/api/referrals/attach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!response.ok) return;
    const body = (await response.json().catch(() => null)) as { retry?: boolean } | null;
    if (!body?.retry) clearReferralCode();
  } catch {
    // Offline or slow: keep the code and let a later signup step try again.
  }
}
