/**
 * The welcome screen after the trial starts (URG-251 Part 5, 2026-10-14).
 *
 * Shown once, inside onboarding, between the paywall and the team step:
 * the Urganize mark, "Welcome to Urganize", one line, two rows (UrgAns and
 * Talk to us) with the app's real icons, and a "Let's go" button.
 *
 * "Seen" lives in localStorage for v1 (a profile column would need a
 * migration). It is keyed per user (the account exists by the time the screen
 * shows), so a second account on the same browser still gets its own welcome.
 *
 * It must not reopen anything lib/first-session.ts keeps quiet (the share
 * sheet's onboarding offer, tours, the install card): it renders inside the
 * onboarding page, before the first session starts, and opens nothing itself.
 */

export const WELCOME_TITLE = 'Welcome to Urganize';
export const WELCOME_LINE = 'Your rollouts, your team and what’s next, in one place.';
export const WELCOME_ROWS = {
  urgans: {
    title: 'UrgAns',
    line: 'Ask it anything or tell it what to do. It plans, drafts and updates for you.',
  },
  talk: {
    title: 'Talk to us',
    line: 'Prefer a person? Tap here and we’ll answer.',
  },
} as const;
export const WELCOME_CTA = 'Let’s go';

export const welcomeSeenKey = (userId: string): string => `urganize.welcome-seen.${userId}`;

/** Pure: a stored value means seen; anything unreadable means not seen. */
export function isWelcomeSeenValue(raw: string | null): boolean {
  return typeof raw === 'string' && raw.length > 0;
}

export function hasSeenWelcome(userId: string | null | undefined): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  try {
    return isWelcomeSeenValue(window.localStorage.getItem(welcomeSeenKey(userId)));
  } catch {
    return false;
  }
}

export function markWelcomeSeen(userId: string | null | undefined, now: number = Date.now()): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(welcomeSeenKey(userId), String(now));
  } catch {
    // Blocked storage: at worst it shows once more on a later sign-up here.
  }
}
