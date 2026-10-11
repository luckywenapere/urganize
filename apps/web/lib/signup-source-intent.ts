import {
  isSignupAttributionFresh,
  normalizeSignupAttribution,
  parseSignupAttribution,
  type SignupAttribution,
} from './profile-growth';

/**
 * "This person signed up because of a public profile or a claim link."
 *
 * The profile page's call to action lands on /onboarding?from=profile&slug=&cta=
 * and the claim page's "Sign up to claim" marks `claim` directly. Sign-up is a
 * whole wizard with a Google round trip in the middle, so this is remembered
 * until the account exists and then handed to the server once
 * (POST /api/signup-source), which records `signup_from_profile`.
 *
 * LOCALSTORAGE FOR 30 DAYS, like the partner referral next door
 * (lib/referral-intent.ts) and for the same reason: people tap a link, close
 * the tab and sign up the next day. Its own key, so the two never clash, and
 * a sign-up can carry both (a partner's link and a profile).
 *
 * LAST LINK WINS. Re-validated on read, because the store is editable by hand
 * and the value goes to the server. Never throws: a blocked store means the
 * sign-up is not attributed, and nothing else changes.
 */

const SIGNUP_SOURCE_KEY = 'urganize.signup-source';

export function markSignupSource(attribution: SignupAttribution, now: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  const clean = normalizeSignupAttribution(attribution);
  if (!clean) return;
  try {
    window.localStorage.setItem(SIGNUP_SOURCE_KEY, JSON.stringify({ ...clean, at: now }));
  } catch {
    // Storage blocked or full: not attributed.
  }
}

/** Remember the attribution this page's query string carries, if any. */
export function captureSignupSourceFromSearch(search: string, now: number = Date.now()): void {
  const parsed = parseSignupAttribution(search);
  if (parsed) markSignupSource(parsed, now);
}

export function readSignupSource(now: number = Date.now()): SignupAttribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SIGNUP_SOURCE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!isSignupAttributionFresh(parsed.at, now)) return null;
    return normalizeSignupAttribution(parsed);
  } catch {
    return null;
  }
}

export function clearSignupSource(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SIGNUP_SOURCE_KEY);
  } catch {
    // Already gone or blocked.
  }
}

/**
 * Hand the remembered source to the server, once, at the end of sign-up.
 * Cleared on any answer from the server, kept when offline so a later step can
 * try again. Never throws and never holds the sign-up for more than 4 seconds.
 */
export async function reportSignupSource(token: string | null): Promise<void> {
  if (!token) return;
  const source = readSignupSource();
  if (!source) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch('/api/signup-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(source),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (response.status < 500) clearSignupSource();
  } catch {
    // Offline or slow: keep it for a later try.
  }
}
