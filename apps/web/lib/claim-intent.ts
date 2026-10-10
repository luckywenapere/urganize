import { isValidClaimToken } from './claim-token-shape';

/**
 * "This person came here to claim a page a team made for them."
 *
 * Signing up is a whole wizard, so the fact that they arrived from a claim
 * link has to survive it. Without this a new person finishes onboarding on a
 * generic dashboard and the page they came for is never claimed.
 *
 * Same design as lib/pitch-intent.ts, for the same reasons: sessionStorage (it
 * survives the Google round trip, and losing it costs one navigation, so it is
 * a destination and not worth a server record), re-validated on read because
 * the value comes out of a store the person can edit, and it fails toward NO
 * intent. The claim link itself still works, so the worst case is the person
 * taps it again.
 */

const CLAIM_INTENT_KEY = 'urganize.claim.token';

export function markClaimIntent(token: string): void {
  if (typeof window === 'undefined' || !isValidClaimToken(token)) return;
  try {
    window.sessionStorage.setItem(CLAIM_INTENT_KEY, token);
  } catch {
    // Storage blocked or full. They can open the link again.
  }
}

/** Read and clear in one step, so an intent never outlives being acted on. */
export function takeClaimIntent(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CLAIM_INTENT_KEY);
    window.sessionStorage.removeItem(CLAIM_INTENT_KEY);
    return raw && isValidClaimToken(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function claimPath(token: string): string {
  return `/claim/${token}`;
}
