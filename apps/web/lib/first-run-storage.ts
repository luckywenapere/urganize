/**
 * Browser-storage keys of the first-run records, and how sign-out clears them
 * (URG-314 batch 6, 2026-10-16).
 *
 * lib/first-session.ts (the record onboarding leaves) and
 * lib/social-share-offer.ts (the first-rollout share offer saved for the next
 * visit) own these records. auth-store only needs to delete them on
 * SIGNED_OUT, and importing those modules for that put them, and the
 * onboarding-readiness code behind first-session, into every route's first
 * load. The keys and the two clear functions live here instead; both owners
 * import them from this file and re-export the clear functions unchanged.
 *
 * Must stay tiny and import nothing: it is on the shared chain.
 */

export const FIRST_SESSION_KEY = 'urganize.first-session';
export const FIRST_SESSION_TAB_KEY = 'urganize.first-session.tab';
export const DEFERRED_FIRST_SHARE_KEY = 'urganize.share.deferred-first';

/** Forget the first-session record (sign-out). Best effort. */
export function clearFirstSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(FIRST_SESSION_KEY);
    window.sessionStorage.removeItem(FIRST_SESSION_TAB_KEY);
  } catch {
    // Best effort.
  }
}

/** The offer was made, or is moot (sign-out). Best effort. */
export function clearDeferredFirstShare(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DEFERRED_FIRST_SHARE_KEY);
  } catch {
    // Nothing to clear in a store that cannot be written.
  }
}
