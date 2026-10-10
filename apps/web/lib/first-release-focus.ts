/**
 * First-release focus (2026-10-10, founder request): once a new team has been
 * through the guided tour and still has no rollout, the rest of the app is
 * LOCKED and the one thing on offer is making the first rollout — either
 * planned by UrgAns or planned by the manager themselves.
 *
 * This is deliberately NOT the URG-217 wall that was removed 2026-08-28. That
 * wall covered the whole screen, had no way out, and trapped people it should
 * not have. This one:
 *  - only locks navigation INTO other areas (a click on an in-app link is
 *    caught and explained); Home, Settings, billing and sign-out always work;
 *  - only starts after the tour has been seen, so it never talks over it;
 *  - fails toward NOT locking on every uncertainty (unknown user,
 *    release store not loaded), the same direction as lib/first-release-required;
 *  - lifts the instant a rollout exists, from any path (UrgAns, MCP, another
 *    tab), because it is derived from the release count and stores nothing.
 *
 * Pure so vitest (node only, no jsdom) can hold it. The behaviour lives in
 * components/releases/FirstReleaseFocus.tsx.
 */

/** HOW the manager wants to plan it. Maps onto the server's existing `plan`
 *  field (app/api/releases/route.ts): 'template' is the UrgAns-planned rollout
 *  (with the planner on, the intake opens straight after creation) and 'blank'
 *  is an empty rollout the manager plans on their own, no AI involved. */
export type FirstReleasePlanMode = 'urgans' | 'self';

export function planChoiceForMode(mode: FirstReleasePlanMode): 'template' | 'blank' {
  return mode === 'urgans' ? 'template' : 'blank';
}

export function decideFirstReleaseFocus(input: {
  /** `isFirstReleaseRequired`: signed in, onboarded, loaded without error, and
   *  genuinely zero rollouts. Already fails open. */
  firstReleaseRequired: boolean;
  isCurator: boolean;
  /** Guided tours are on. When they are off there is no tour to wait for. */
  toursEnabled: boolean;
  tourSeen: boolean;
  /** A tour is running, or one has been asked for and not yet reached. */
  tourBlocking: boolean;
}): boolean {
  if (input.isCurator) return false;
  if (!input.firstReleaseRequired) return false;
  if (input.tourBlocking) return false;
  if (input.toursEnabled && !input.tourSeen) return false;
  return true;
}

/** Areas that stay open while focus is on. Home is where the focus card
 *  lives; the rest are the places nobody may be walled out of (an account
 *  that cannot reach billing or sign out is a trap). */
const OPEN_PREFIXES = [
  '/dashboard/home',
  '/settings',
  '/auth',
  '/locked',
  '/payment',
  '/start-trial',
  '/onboarding',
  '/redeem',
  '/oauth',
];

/**
 * Whether following this link is locked right now. `href` is whatever the
 * anchor carries; anything that is not an in-app /dashboard path (external
 * links, mailto:, hash-only, other origins) is never locked.
 */
export function isLockedHref(href: string | null | undefined, origin: string): boolean {
  if (!href) return false;
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false;
  const path = url.pathname;
  if (path !== '/dashboard' && !path.startsWith('/dashboard/')) return false;
  return !OPEN_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export const FIRST_RELEASE_FOCUS_COPY = {
  lockedTitle: 'Locked until your first rollout.',
  lockedBody:
    'Everything in Urganize hangs off a rollout, so make your first one and this opens up.',
  lockedCta: 'Create your first rollout',
  barLabel: 'Create your first rollout to unlock the rest.',
  barCta: 'Create rollout',
  choiceTitle: 'Create your first rollout',
  choiceBody: 'Choose how you want to plan it. You can change anything after.',
  urgansTitle: 'Plan it with UrgAns',
  urgansBody:
    'Answer a few questions and UrgAns drafts every step, shaped to your answers. Edit anything before it is scheduled.',
  // With the planner flag off there is no UrgAns intake, so the first choice is
  // the proven rollout plan and must not promise questions it will not ask.
  urgansBodyNoPlanner:
    'Start from the proven rollout plan. Every step from first prep to release day is laid out and ready to edit.',
  selfTitle: 'I will plan it myself',
  selfBody:
    'Start with an empty rollout and add your own activities and dates. No AI involved.',
  recommended: 'Recommended',
} as const;
