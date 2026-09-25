/**
 * The two guided tours: what they say, when the catalog one starts itself, and
 * which of several candidate anchors is actually on screen.
 *
 * Founder ask (2026-09-09): a short walk-through the first time, Bitwarden's
 * shape — a spotlight, a card beside the thing it is pointing at, "1 of 3",
 * Next and Skip. TOUR A (catalog) starts itself once per user. TOUR B
 * (rollout) is OFFERED after a plan is approved, never auto-run, because that
 * is the moment the founder means by "they created one".
 *
 * WHY THIS IS A lib MODULE and not state inside the overlay: vitest runs
 * node-only in this repo with no jsdom and there are no component tests, so
 * logic left in a .tsx is logic nothing can hold. lib/help-copy.ts made the
 * same call for the same reason, and the copy below is subject to the same
 * fifth-grader bar.
 *
 * THREE THINGS THIS FILE DELIBERATELY DOES NOT DO.
 *
 *  - It does not place the card. `placeHelpTip` in lib/help-tip-position.ts
 *    already prefers a side, flips when there is no room, clamps to a viewport
 *    margin and never returns a negative offset, and it is unit-tested. Call
 *    it with `prefer: 'bottom'`. A second placer is the duplication this whole
 *    feature is written to avoid.
 *  - It does not restate what a HelpTip already says. The side menu's rows
 *    carry their own pullouts, so the two nav steps point and move on; read
 *    lib/help-copy.ts alongside this when editing them.
 *  - It does not decide WHERE the tour starts from. That is
 *    useCatalogTourAutoStart, mounted in WorkspaceView — see `onCatalog`.
 */

import { readPersistedState, writePersistedState } from './persisted-state';

export type TourId = 'catalog' | 'rollout';

/** The `data-tour` value a step points at. An anchor may exist more than once
 *  in the DOM (the topbar and the side menu both carry the nav ones, and this
 *  app splits mobile and desktop by CSS rather than by mounting), which is
 *  what `pickVisibleAnchor` is for. */
export type TourAnchor =
  | 'nav-catalog'
  | 'nav-urgans'
  | 'plan-rollout'
  | 'new-rollout'
  | 'release-card'
  | 'activities'
  | 'rollout-menu'
  | 'nav-settings';

export type TourStep = {
  id: string;
  anchor: TourAnchor;
  title: string;
  body: string;
  /** Overrides "Next" on the last step. */
  ctaLabel?: string;
};

export const CATALOG_TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'catalog',
    anchor: 'nav-catalog',
    title: 'Your rollouts live here.',
    body: 'Every rollout you are running shows up in this list. Tap one to open it.',
  },
  {
    id: 'urgans',
    anchor: 'nav-urgans',
    title: 'Ask UrgAns anything.',
    body: 'UrgAns knows your rollouts. Ask it to add work, move a date, or say what is due.',
  },
  // The third step is replaced at start time by resolveCatalogTourCta. This
  // entry is the fallback shape and the one a teammate sees.
  {
    id: 'finish',
    anchor: 'release-card',
    title: 'Open a rollout.',
    body: 'Tap one to see its activities and what is due.',
    ctaLabel: 'Done',
  },
];

export const ROLLOUT_TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'activities',
    anchor: 'activities',
    title: 'Your activities.',
    body: 'Each row is one piece of work with a date. Tick it off when it is done. Timeline shows the same work on a calendar.',
  },
  {
    id: 'menu',
    anchor: 'rollout-menu',
    title: 'Everything else about this rollout.',
    body: 'Metadata, content posts, the press kit and more live in this menu.',
  },
  {
    id: 'team',
    anchor: 'nav-settings',
    title: 'Bring your team in.',
    body: 'Invite people from Settings, then assign work to them.',
    ctaLabel: 'Go to Team',
  },
];

export function stepsForTour(tourId: TourId): readonly TourStep[] {
  return tourId === 'catalog' ? CATALOG_TOUR_STEPS : ROLLOUT_TOUR_STEPS;
}

/**
 * Whether the catalog tour may start itself right now.
 *
 * Every input is a reason NOT to, and the whole thing fails toward silence:
 * an unknown is an unmet condition, never an assumed one. Two are worth
 * naming because they are not obvious.
 *
 *  - `onCatalog` is NOT "this is the landing page". #568 made
 *    /dashboard/urgans the post-auth landing when the assistant is on, so a
 *    first-run user lands on UrgAns and reaches the catalog by tapping. The
 *    tour fires on the first visit to the catalog in the session, whenever
 *    that happens, which is why its hook lives in WorkspaceView.
 *  - `chappiMessageCount` keeps somebody who started by TALKING to UrgAns
 *    from being interrupted the moment they arrive. The assistant is itself
 *    an activation path; a tour talking over it is the worse of the two.
 */
export function decideCatalogTourAutoStart(input: {
  flag: boolean;
  seen: boolean;
  authResolved: boolean;
  isCurator: boolean;
  onCatalog: boolean;
  releasesLoaded: boolean;
  bodyLocked: boolean;
  chappiMessageCount: number;
}): boolean {
  if (!input.flag) return false;
  if (input.seen) return false;
  if (!input.authResolved) return false;
  if (input.isCurator) return false;
  if (!input.onCatalog) return false;
  // Anchors are read from the DOM at step time, and the catalog's own cards
  // are one of them; starting before the list has painted points step three
  // at nothing.
  if (!input.releasesLoaded) return false;
  if (input.bodyLocked) return false;
  if (input.chappiMessageCount > 0) return false;
  return true;
}

export type CatalogTourCtaAction = 'open-intake' | 'open-create' | 'done';

export type CatalogTourCta = {
  anchor: TourAnchor;
  title: string;
  body: string;
  ctaLabel: string;
  action: CatalogTourCtaAction;
};

/**
 * The last step of the catalog tour, which is the only one that has to know
 * anything about the account.
 *
 * PRECEDENCE IS PLANNING, THEN CREATING, THEN NEITHER — and that order is the
 * decision rather than an accident of the ifs. Somebody looking at an
 * unplanned rollout already has the thing in front of them; sending them off
 * to make a second one is the wrong next move even when they could.
 */
export function resolveCatalogTourCta(input: {
  plannerEnabled: boolean;
  scopedReleaseId: string | null;
  scopedTaskCount: number;
  releaseCount: number;
  canCreate: boolean;
}): CatalogTourCta {
  if (input.plannerEnabled && input.scopedReleaseId && input.scopedTaskCount === 0) {
    return {
      anchor: 'plan-rollout',
      title: 'Plan this rollout.',
      body: 'Answer a few questions and UrgAns lays out every step, shaped to your answers. Change anything after.',
      ctaLabel: 'Plan it',
      action: 'open-intake',
    };
  }

  if (input.canCreate && input.releaseCount === 0) {
    return {
      anchor: 'new-rollout',
      title: 'Start your first rollout.',
      body: 'Pick a format, add a date, and the plan builds itself.',
      ctaLabel: 'New rollout',
      action: 'open-create',
    };
  }

  return {
    anchor: 'release-card',
    title: 'Open a rollout.',
    body: 'Tap one to see its activities and what is due.',
    ctaLabel: 'Done',
    action: 'done',
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

/** Per user AND per tour: one machine can be two people, and finishing the
 *  catalog tour says nothing about having seen the rollout one. */
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
