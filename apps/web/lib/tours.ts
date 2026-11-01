/**
 * The guided tour: what it says, and which of several candidate anchors is
 * actually on screen.
 *
 * Founder ask (2026-09-09): a short walk-through, Bitwarden's shape — a
 * spotlight, a card beside the thing it is pointing at, "1 of 3", Next and
 * Skip. The ROLLOUT tour is OFFERED after a plan is approved ("Take the tour"),
 * never auto-run, because that is the moment the founder means by "they
 * created one".
 *
 * THE WELCOME TOUR IS GONE (2026-10-11, founder call). There used to be a
 * second, "catalog" tour that started itself the first time a person landed on
 * Home, before they had made anything. A new user's replay showed it in the way
 * of the one thing a first visit is for: Next tapped twice with nothing
 * visibly changing (on a phone two of its three steps pointed at the same
 * Catalogue tab), then Done to get out, then Create rollout. The rollout tour
 * covers the same ground once there is a rollout to point at, so the welcome
 * one was removed outright, with its replay rows, its seen-flag readers and
 * the first-rollout focus's wait for it. A new account now lands straight in the
 * create-first-rollout flow. Its old localStorage key
 * (`urganize.tour.seen.catalog.<user>`) is simply never read again.
 *
 * WHY THIS IS A lib MODULE and not state inside the overlay: vitest runs
 * node-only in this repo with no jsdom and there are no component tests, so
 * logic left in a .tsx is logic nothing can hold. lib/help-copy.ts made the
 * same call for the same reason, and the copy below is subject to the same
 * fifth-grader bar.
 *
 * It does not place the card. `placeHelpTip` in lib/help-tip-position.ts
 * already prefers a side, flips when there is no room, clamps to a viewport
 * margin and never returns a negative offset, and it is unit-tested. Call it
 * with `prefer: 'bottom'`.
 */

import { readPersistedState, writePersistedState } from './persisted-state';

export type TourId = 'rollout';

/** The `data-tour` value a step points at. An anchor may exist more than once
 *  in the DOM (the topbar and the side menu both carry the nav ones, and this
 *  app splits mobile and desktop by CSS rather than by mounting), which is
 *  what `pickVisibleAnchor` is for. */
export type TourAnchor = 'activities' | 'rollout-menu' | 'nav-settings' | 'nav-team';

/** Which short loop a step shows (components/tours/loops, #971). */
export type TourLoopId = 'activities' | 'menu' | 'team';

export type TourStep = {
  id: string;
  anchor: TourAnchor;
  /** Pointed at when `anchor` is not on screen. The account button that
   *  carries 'nav-settings' lives in the side menu, which a phone never
   *  shows, so the team step used to be skipped there; on a phone it points
   *  at the Team tab instead, in whichever phone bar is on screen (#971). */
  fallbackAnchor?: TourAnchor;
  title: string;
  /** One short line under the loop. The loop shows the action; this names it. */
  body: string;
  loop: TourLoopId;
  /** Overrides "Next" on the last step. */
  ctaLabel?: string;
  /** What the last step's button does besides ending the tour. 'open-team'
   *  opens Settings on the Team segment, so "Go to Team" goes to Team. */
  action?: 'open-team';
};

export const ROLLOUT_TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'activities',
    anchor: 'activities',
    title: 'Your activities.',
    body: 'Tick work off as it gets done.',
    loop: 'activities',
  },
  {
    id: 'menu',
    anchor: 'rollout-menu',
    title: 'Everything else about this rollout.',
    body: 'Cover art, details, pitching and more.',
    loop: 'menu',
  },
  {
    id: 'team',
    anchor: 'nav-settings',
    fallbackAnchor: 'nav-team',
    title: 'Bring your team in.',
    body: 'Invite them, then give them work.',
    loop: 'team',
    ctaLabel: 'Go to Team',
    action: 'open-team',
  },
];

/**
 * The card's step indicator: "Step 2 of 3" and how far along the bar is.
 *
 * It reads the way every other stepped flow in the app does (the team brief's
 * guided mode says "Step 2 of 6" in the same uppercase mono eyebrow, and its
 * bar is the same `bg-stroke-strong` track with a `bg-brand` fill). The card
 * said a bare "2 of 3" in 11px tertiary type before, which a live review
 * flagged as easy to miss and unlike the rest of the app. Clamped so a stale
 * index can never draw "Step 4 of 3" or a bar past its end.
 */
export function tourStepProgress(
  stepIndex: number,
  total: number
): { label: string; percent: number } {
  const count = Math.max(1, Math.floor(total));
  const index = Math.min(Math.max(0, Math.floor(stepIndex)), count - 1);
  const current = index + 1;
  return {
    label: `Step ${current} of ${count}`,
    percent: Math.round((current / count) * 100),
  };
}

/** A candidate anchor, reduced to the two facts that decide whether it is on
 *  screen. Kept as plain data so this stays testable without a DOM. */
export type AnchorCandidate = {
  rect: { width: number; height: number };
  /** `false` for a `display: none` element — the cheap test for the CSS-hidden
   *  half of every duplicated anchor in this app. A zero rect alone does not
   *  catch `visibility: hidden`, but that is not a pattern used here. */
  hasOffsetParent: boolean;
};

export function pickVisibleAnchor(candidates: readonly AnchorCandidate[]): number | null {
  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i];
    if (!c.hasOffsetParent) continue;
    if (c.rect.width <= 0 || c.rect.height <= 0) continue;
    return i;
  }
  return null;
}

const SEEN_VERSION = 1;

/** Per user AND per tour: one machine can be two people. */
export function tourSeenKey(userId: string, tourId: TourId): string {
  return `urganize.tour.seen.${tourId}.${userId}`;
}

function isSeen(value: unknown): value is true {
  return value === true;
}

export function readTourSeen(userId: string, tourId: TourId): boolean {
  if (!userId) return false;
  try {
    return readPersistedState(tourSeenKey(userId, tourId), SEEN_VERSION, isSeen) === true;
  } catch {
    return false;
  }
}

/** Wrapped, because `writePersistedState` does not guard `setItem` and it
 *  throws on a full quota and in Safari's private mode. Losing the mark costs
 *  one repeat of a 60-second tour; throwing here would take down whatever was
 *  finishing it. */
export function markTourSeen(userId: string, tourId: TourId): void {
  if (!userId) return;
  try {
    writePersistedState(tourSeenKey(userId, tourId), SEEN_VERSION, true);
  } catch {
    /* ignore */
  }
}
