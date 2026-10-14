import { isOnboardingPersona } from './onboarding';

// The one-time "Who are you?" ask on Home (URG-262, 2026-10-14), for accounts
// made before onboarding asked it, or that skipped onboarding (a Google
// sign-in from /auth lands with no answer). Every outside account had none on
// the day it shipped, which is why the founder could not tell whether artists
// were overtaking managers.
//
// Asked once, lightly: a small card on Home, one tap to answer, one tap to
// close. Either is final on this device. It saves onboarding_persona only and
// never the account's role (see applyPersonaToRole in lib/onboarding.ts).
//
// PURE apart from the two storage helpers, which fail closed: storage that
// cannot be read means the card is not shown, rather than shown every visit.

const STORAGE_PREFIX = 'urganize.persona-ask.v1:';

export type PersonaAskViewer = {
  id?: string | null;
  role?: string | null;
  onboarding_persona?: string | null;
};

/** Whether this account still owes an answer. Curator-only accounts are never asked. */
export function needsPersonaAnswer(viewer: PersonaAskViewer | null | undefined): boolean {
  if (!viewer?.id) return false;
  if (String(viewer.role || '').trim() === 'curator') return false;
  return !isOnboardingPersona(viewer.onboarding_persona);
}

/** True once this device has answered or closed the card for this account (or cannot tell). */
export function readPersonaAskSettled(userId: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + userId) !== null;
  } catch {
    return true;
  }
}

export function markPersonaAskSettled(userId: string, outcome: 'answered' | 'closed'): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + userId, outcome);
  } catch {
    // Nothing to remember in a store that cannot be written; the read above
    // fails closed, so the card cannot nag either.
  }
}
