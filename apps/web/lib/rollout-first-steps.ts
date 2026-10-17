/**
 * The first steps on a new rollout (URG-293, 2026-10-15).
 *
 * In the founder's Oct 14 demo a manager made a rollout and then sat looking at
 * it, not knowing what to do next. So a new rollout now opens with ONE obvious
 * next action and a short checklist under it: add the cover art, invite your
 * team. ("Add the song" was the first step until song upload was removed
 * everywhere, Oct 17, 2026.) Each item ticks itself off from what the rollout and the
 * team actually hold (never from a click), and the whole card goes away once
 * every item is done, when it is dismissed, or once the rollout is no longer new.
 *
 * Pure: no React, no storage, no environment reads. The caller says which
 * steps exist for this person (feature switches, who can invite) and what is
 * done; this decides what shows.
 */

export type FirstStepKey = 'cover' | 'team';

export const FIRST_STEP_ORDER: readonly FirstStepKey[] = ['cover', 'team'];

export const FIRST_STEPS_COPY = {
  label: 'Your first steps',
  next: 'Next step',
  progress: (done: number, total: number) => `${done} of ${total} done`,
  dismiss: 'Hide first steps',
  steps: {
    cover: {
      title: 'Add the cover art',
      detail: 'Put the artwork in one place for promo and distribution.',
      action: 'Add cover art',
    },
    team: {
      title: 'Invite your team',
      detail: 'Bring in the artist and the people doing the work.',
      action: 'Invite your team',
    },
  },
} as const;

/** How long a rollout counts as new. Past this the card never shows, so an old
 *  rollout is not suddenly told to do its homework. */
export const FIRST_STEPS_WINDOW_DAYS = 14;

/** Which steps exist for this person right now. */
export type FirstStepsAvailability = {
  /** The Cover art scene is switched on. */
  cover: boolean;
  /** This person can invite (a manager account; Settings → Team only renders for them). */
  team: boolean;
};

/** What is already done. Null means not read yet. */
export type FirstStepsFacts = {
  hasCoverArt: boolean | null;
  hasTeam: boolean | null;
};

export type FirstStep = {
  key: FirstStepKey;
  title: string;
  detail: string;
  action: string;
  done: boolean;
};

export function buildFirstSteps(
  facts: FirstStepsFacts,
  available: FirstStepsAvailability
): FirstStep[] {
  const doneFor: Record<FirstStepKey, boolean> = {
    cover: facts.hasCoverArt === true,
    team: facts.hasTeam === true,
  };
  return FIRST_STEP_ORDER.filter((key) => available[key]).map((key) => ({
    key,
    ...FIRST_STEPS_COPY.steps[key],
    done: doneFor[key],
  }));
}

/** The one action to put front and centre: the first step not done yet. */
export function nextFirstStep(steps: readonly FirstStep[]): FirstStep | null {
  return steps.find((step) => !step.done) ?? null;
}

export function isRolloutNew(createdAt: string | null | undefined, now: Date): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  const age = now.getTime() - created;
  // A clock a little behind the server's still counts as new.
  return age < FIRST_STEPS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

export type ShowFirstStepsInput = {
  isOwner: boolean;
  isTest: boolean;
  createdAt: string | null | undefined;
  now: Date;
  dismissed: boolean;
  /** False until the facts have been read, so a finished rollout never flashes
   *  an empty checklist. */
  factsKnown: boolean;
  steps: readonly FirstStep[];
};

export function shouldShowFirstSteps(input: ShowFirstStepsInput): boolean {
  if (!input.isOwner || input.isTest || input.dismissed || !input.factsKnown) return false;
  if (!isRolloutNew(input.createdAt, input.now)) return false;
  if (input.steps.length === 0) return false;
  return nextFirstStep(input.steps) !== null;
}

/** Rollout ids whose first steps were hidden in this browser. */
export const FIRST_STEPS_DISMISSED_KEY = 'urganize.rollout-first-steps.dismissed';
export const FIRST_STEPS_DISMISSED_VERSION = 1;

export const isDismissedList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** Add a rollout to the dismissed list, keeping the newest 100. */
export function withDismissed(list: readonly string[] | null, releaseId: string): string[] {
  const rest = (list ?? []).filter((id) => id !== releaseId);
  return [...rest, releaseId].slice(-100);
}
