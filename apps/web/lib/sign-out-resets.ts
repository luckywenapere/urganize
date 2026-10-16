/**
 * Sign-out reset registry (URG-314, 2026-10-16).
 *
 * Every module-level store that holds one account's data must forget it on
 * SIGNED_OUT, or a same-tab sign-in as another account paints the previous
 * account's data (see lib/auth-store.ts). auth-store used to import each
 * store to call its reset, which put every one of those stores into the
 * shared bundle, /auth included.
 *
 * Instead each store registers its reset here when its module first loads.
 * A store that never loaded in this tab holds nothing in memory, so there is
 * nothing to reset. What a store keeps in BROWSER STORAGE is different: it
 * outlives the tab, so auth-store still clears those keys by name on every
 * sign-out, whether or not the store loaded (see SIGNED_OUT in auth-store).
 *
 * This module must stay tiny and import nothing: it is on the shared chain.
 */

export type SignOutResetId =
  | 'scene-data'
  | 'press-kits'
  | 'press-kit-detail'
  | 'events'
  | 'artist-roster'
  | 'relationships'
  | 'opportunities'
  | 'spend-access'
  | 'chappi-history'
  | 'chappi'
  | 'releases'
  | 'tasks'
  | 'activity'
  | 'home';

/**
 * The order resets run in. Order matters in one place: the chat history
 * store subscribes to the UrgAns transcript and would read the transcript's
 * reset as "leaving a chat" and save it again under the account that is
 * signing out, so 'chappi-history' must run before 'chappi'.
 */
export const SIGN_OUT_RESET_ORDER: readonly SignOutResetId[] = [
  'scene-data',
  'press-kits',
  'press-kit-detail',
  'events',
  'artist-roster',
  'relationships',
  'opportunities',
  'spend-access',
  'chappi-history',
  'chappi',
  'releases',
  'tasks',
  'activity',
  'home',
];

const resets = new Map<SignOutResetId, () => void>();

/** Called once at module scope by each store that holds per-account data. */
export function registerSignOutReset(id: SignOutResetId, reset: () => void): void {
  resets.set(id, reset);
}

/** Runs every registered reset in SIGN_OUT_RESET_ORDER. One that throws does
 *  not stop the rest: each is a separate account-data exposure. */
export function runSignOutResets(): void {
  for (const id of SIGN_OUT_RESET_ORDER) {
    const reset = resets.get(id);
    if (!reset) continue;
    try {
      reset();
    } catch (error) {
      console.error(`Sign-out reset "${id}" failed:`, error);
    }
  }
}

/** Tests only. */
export function registeredSignOutResets(): SignOutResetId[] {
  return SIGN_OUT_RESET_ORDER.filter((id) => resets.has(id));
}
