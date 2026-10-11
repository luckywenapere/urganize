/**
 * The planner intake's step machine, as data (2026-10-11, first-user flow).
 *
 * The intake asks at most seven questions. Some of them are already answered
 * by the time it opens, and asking again is the double-ask a brand-new
 * manager notices first: onboarding has just asked for the type, the artist
 * and the date, and the planner used to ask all three again.
 *
 * So the modal does not walk 0..6. It walks the list `visibleIntakeSteps`
 * returns, and Back, Continue and "Question N of M" all read that one list,
 * which is what keeps them agreeing with what is actually on screen.
 *
 * Pure and React-free so vitest (which reaches lib/ only) can hold the rules.
 * `components/planner/intake-steps.tsx` re-exports `StepIndex` from here.
 */

import { PLAN_SCOPES, type PlanScope } from './release-planning';

export type StepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const ALL_INTAKE_STEPS: readonly StepIndex[] = [0, 1, 2, 3, 4, 5, 6];

/** Indices of the questions that can be skipped, named so callers never pass a bare number. */
export const INTAKE_STEP = {
  releaseType: 0,
  artist: 1,
  date: 2,
  ready: 3,
  goal: 4,
  budget: 5,
  cover: 6,
} as const satisfies Record<string, StepIndex>;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD that is a real calendar day and is today or later. */
export function isUsableFutureYmd(value: string | null | undefined, todayYmd: string): boolean {
  if (!value || !YMD.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Round-trip refuses 2026-02-31, which Date would roll into March.
  if (parsed.toISOString().slice(0, 10) !== value) return false;
  return value >= todayYmd;
}

export type IntakeSkipInput = {
  /** The release type arrived as a prefill (the create picker or onboarding asked it). */
  prefilledReleaseType?: string | null;
  /** The release date arrived as a prefill. Only a usable future date skips. */
  prefilledReleaseDate?: string | null;
  /**
   * The artist name the CALLER vouches for: the scoped release's own artist,
   * or the one onboarding just typed. Deliberately not the identity card's or
   * the profile's name on its own — a team can have several artists, and an
   * entry point with no release (a note, a chip) keeps its confirm question.
   */
  prefilledArtistName?: string | null;
  todayYmd: string;
};

export type IntakeSkips = { releaseType: boolean; artist: boolean; date: boolean };

export function decideIntakeSkips(input: IntakeSkipInput): IntakeSkips {
  return {
    releaseType: Boolean(input.prefilledReleaseType),
    artist: Boolean(input.prefilledArtistName && input.prefilledArtistName.trim()),
    date: isUsableFutureYmd(input.prefilledReleaseDate, input.todayYmd),
  };
}

/** The questions this intake will actually ask, in order. Never empty. */
export function visibleIntakeSteps(skips: IntakeSkips): StepIndex[] {
  return ALL_INTAKE_STEPS.filter((step) => {
    if (step === INTAKE_STEP.releaseType) return !skips.releaseType;
    if (step === INTAKE_STEP.artist) return !skips.artist;
    if (step === INTAKE_STEP.date) return !skips.date;
    return true;
  });
}

/** The step after `current`, or null when `current` is the last one asked. */
export function nextIntakeStep(visible: readonly StepIndex[], current: StepIndex): StepIndex | null {
  const index = visible.indexOf(current);
  if (index === -1) {
    // Not a visible step (should not happen): move to the first visible one after it.
    return visible.find((step) => step > current) ?? null;
  }
  return visible[index + 1] ?? null;
}

/** The step before `current`, or null on the first one asked. Back never reaches a skipped question. */
export function previousIntakeStep(visible: readonly StepIndex[], current: StepIndex): StepIndex | null {
  const index = visible.indexOf(current);
  if (index <= 0) return null;
  return visible[index - 1] ?? null;
}

/** 1-based position of `current` among the questions asked. */
export function intakeStepPosition(visible: readonly StepIndex[], current: StepIndex): number {
  const index = visible.indexOf(current);
  return index === -1 ? 1 : index + 1;
}

/** "Question N of M", counted over what is asked, never over all seven. */
export function intakeStepKicker(visible: readonly StepIndex[], current: StepIndex): string {
  return `Question ${intakeStepPosition(visible, current)} of ${visible.length}`;
}

// ---------------------------------------------------------------------------
// "What should the plan cover?" — every scope ticked by default.
//
// The data model did not change: the intake still sends `exclusions`, the
// scopes to leave OUT. The question just asks it the other way round, because
// "Anything to leave out?" with nothing ticked read as a question to skip,
// and a first-time manager could not tell what the plan would contain. A
// ticked box is a scope the plan covers; unticking it adds it to exclusions.
// ---------------------------------------------------------------------------

/** The scopes the plan covers, in scope order: every scope not excluded. */
export function coveredScopes(exclusions: readonly PlanScope[]): PlanScope[] {
  const excluded = new Set(exclusions);
  return PLAN_SCOPES.filter((scope) => !excluded.has(scope));
}

/**
 * Toggling a COVER box: unticking a covered scope excludes it, ticking an
 * excluded one covers it again. Returns exclusions in scope order, deduplicated.
 */
export function toggleCoveredScope(exclusions: readonly PlanScope[], scope: PlanScope): PlanScope[] {
  const excluded = new Set(exclusions);
  if (excluded.has(scope)) excluded.delete(scope);
  else excluded.add(scope);
  return PLAN_SCOPES.filter((value) => excluded.has(value));
}

// ---------------------------------------------------------------------------
// The prefill a caller with a real rollout in hand passes to the intake.
// ---------------------------------------------------------------------------

const PLAN_RELEASE_TYPES = ['single', 'ep', 'album'] as const;
type PrefillReleaseType = (typeof PLAN_RELEASE_TYPES)[number];

/** Artist names that are placeholders, not answers: never vouched for. */
const PLACEHOLDER_ARTIST_NAMES = new Set(['', 'unknown artist']);

export type ScopedRolloutForIntake = {
  releaseType?: string | null;
  releaseDate?: string | null;
  artistName?: string | null;
};

export type ScopedIntakePrefill = {
  releaseType?: PrefillReleaseType;
  releaseDate?: string;
  artistName?: string;
};

/**
 * What the rollout already knows, shaped as an intake prefill. Only values the
 * planner can use go in: a type the planner plans (single, EP, album), a real
 * YYYY-MM-DD (whether it is still in the future is the skip rule's call, so a
 * past date is still shown as the starting answer), and a non-placeholder
 * artist name.
 */
export function scopedRolloutIntakePrefill(release: ScopedRolloutForIntake): ScopedIntakePrefill {
  const prefill: ScopedIntakePrefill = {};
  const type = release.releaseType ?? '';
  if ((PLAN_RELEASE_TYPES as readonly string[]).includes(type)) {
    prefill.releaseType = type as PrefillReleaseType;
  }
  const date = (release.releaseDate ?? '').slice(0, 10);
  if (YMD.test(date)) prefill.releaseDate = date;
  const artist = (release.artistName ?? '').trim();
  if (!PLACEHOLDER_ARTIST_NAMES.has(artist.toLowerCase())) prefill.artistName = artist.slice(0, 120);
  return prefill;
}
