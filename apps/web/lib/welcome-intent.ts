import { isPlausibleClaimToken } from './seeding';

/**
 * "This person came from a seeding link and still has to finish it."
 *
 * An invited manager who has no account must sign up before they can claim the
 * profile, and signing up is a wizard that ends on the ordinary landing. This
 * remembers the link for the length of that trip so the wizard can hand them
 * back to it. The same shape and the same reasoning as lib/pitch-intent.ts:
 * sessionStorage, re-validated on the way out, and it FAILS TOWARD NO INTENT,
 * because losing it costs one navigation (the link in their chat still works).
 *
 * Read WITHOUT clearing: the card trial, when it is on, takes them somewhere
 * else first, and an intent consumed there would be gone when they came back.
 * The welcome page clears it once the claim succeeds.
 */

const WELCOME_INTENT_KEY = 'urganize.welcome.token';

export function markWelcomeIntent(token: string): void {
  if (typeof window === 'undefined') return;
  if (!isPlausibleClaimToken(token)) return;
  try {
    window.sessionStorage.setItem(WELCOME_INTENT_KEY, token);
  } catch {
    // Blocked or full. They reopen the link from their chat.
  }
}

export function readWelcomeIntent(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(WELCOME_INTENT_KEY);
    return isPlausibleClaimToken(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function clearWelcomeIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(WELCOME_INTENT_KEY);
  } catch {
    // Already gone.
  }
}

export function welcomePath(token: string): string {
  return `/welcome/${token}`;
}
