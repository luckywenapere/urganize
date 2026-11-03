/**
 * Rollout offers (2026-10-24, founder-approved mock lighter-rollout-v1).
 *
 * Replaces the first-rollout focus of 2026-10-10, which locked every area of
 * the app, dimmed the nav, showed a standing bar and opened a dialog by itself
 * until a new team made a rollout. That forced rollouts nobody needed yet, so
 * rollout numbers stopped meaning real releases. Now nothing is locked, and a
 * rollout is offered only:
 *
 *  - once, quietly, on Home for a team with no rollouts ("Got a release
 *    coming?"), until they tap Not now (remembered per user, on this device);
 *  - when there is a sign: a page that needs a rollout shows its own empty
 *    state with "Plan a rollout", and UrgAns offers when the person mentions an
 *    upcoming release (lib/chappi/system-prompt.ts). Those show whether or not
 *    the Home card was dismissed.
 *
 * Every offer opens the same plan choice (UrgAns plans it, or plan it myself)
 * and the rollout it makes is tagged origin 'hint' (lib/rollout-origin.ts).
 *
 * Pure so vitest (node only) can hold it; the UI lives in
 * components/home/RolloutOfferCard.tsx, components/releases/PlanChoiceDialog.tsx
 * and components/releases/NeedsRolloutEmpty.tsx.
 */

/**
 * NEXT_PUBLIC_FEATURE_ROLLOUT_OFFER: the Home card. ON unless set to 'false'
 * (new flags ship on; the onboarding v2 kill-switch pattern). Off hides the
 * card only; the lock does not come back.
 */
export const isRolloutOfferEnabled = (): boolean => process.env.NEXT_PUBLIC_FEATURE_ROLLOUT_OFFER !== 'false';

/** HOW the manager wants to plan it. Maps onto the server's `plan` field
 *  (app/api/releases/route.ts): 'template' is the UrgAns-planned rollout (with
 *  the planner on, the intake opens straight after creation) and 'blank' is an
 *  empty rollout the manager plans on their own, no AI involved. */
export type RolloutPlanMode = 'urgans' | 'self';

export function planChoiceForMode(mode: RolloutPlanMode): 'template' | 'blank' {
  return mode === 'urgans' ? 'template' : 'blank';
}

/** Whether Home shows "Got a release coming?". */
export function decideHomeRolloutCard(input: {
  enabled: boolean;
  /** `isFirstReleaseRequired`: signed in, onboarded, loaded without error, and
   *  genuinely zero rollouts. Fails toward false. */
  noRollouts: boolean;
  isCurator: boolean;
  dismissed: boolean;
}): boolean {
  if (!input.enabled) return false;
  if (input.isCurator) return false;
  if (!input.noRollouts) return false;
  return !input.dismissed;
}

/** localStorage, per user: Not now on the Home card. */
export function homeOfferDismissedKey(userId: string): string {
  return `urganize.rollout-offer.home-dismissed.${userId}`;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function readHomeOfferDismissed(userId: string, storage: StorageLike | null): boolean {
  if (!userId || !storage) return false;
  try {
    return storage.getItem(homeOfferDismissedKey(userId)) === '1';
  } catch {
    // Unreadable storage shows the card; it is quiet and has its own Not now.
    return false;
  }
}

export function writeHomeOfferDismissed(userId: string, storage: StorageLike | null): void {
  if (!userId || !storage) return;
  try {
    storage.setItem(homeOfferDismissedKey(userId), '1');
  } catch {
    /* ignore: the card simply comes back next visit */
  }
}

export const ROLLOUT_OFFER_COPY = {
  homeTitle: 'Got a release coming?',
  homeBody: 'Plan it here when you are ready.',
  planCta: 'Plan a rollout',
  notNow: 'Not now',
  choiceTitle: 'Plan a rollout',
  choiceBody: 'See what each way gives you. You can change anything after.',
  urgansTitle: 'Plan it with AI',
  // Short lines: each option's preview (PlanOptionPreview.tsx) carries the detail.
  urgansBody: 'A few questions, then AI drafts every step. Edit before anything is scheduled.',
  // With the planner flag off there is no UrgAns intake, so the first choice is
  // the proven rollout plan and must not promise questions it will not ask.
  urgansBodyNoPlanner: 'Start from the proven rollout plan, first prep to release day.',
  selfTitle: 'I will plan it myself',
  selfBody: 'You add each activity and date. No AI involved.',
  recommended: 'Recommended',
} as const;
