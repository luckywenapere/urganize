/**
 * What each planner question still needs before Continue can move on, as the
 * sentence the intake shows under the button (2026-10-11).
 *
 * WHY. A new user's replay showed taps on the step after the third Continue
 * doing nothing: the button was disabled by validation, but a 50%-opacity brand
 * pill reads as enabled on a phone, and nothing said what was missing. So the
 * rule and the words live together here: null means the step is ready, a string
 * is what to tell the person. PlannerIntakeModal draws the button disabled and
 * the sentence under it from this one answer, so the two cannot disagree.
 *
 * Pure so vitest (node only) can hold it. `today` is passed in as YYYY-MM-DD so
 * a test pins the clock.
 */

import type { PlannerIntakeDraft } from './planner-intake-draft';

export type IntakeStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function intakeStepBlocker(
  step: IntakeStep,
  draft: Pick<PlannerIntakeDraft, 'releaseType' | 'artistName' | 'releaseDate' | 'goal' | 'goalText' | 'budget'>,
  today: string
): string | null {
  switch (step) {
    case 0:
      return draft.releaseType ? null : 'Pick what you are releasing to continue.';
    case 1:
      return draft.artistName.trim() ? null : 'Type the artist name to continue.';
    case 2:
      if (!draft.releaseDate) return 'Pick a release date, or tap Help me pick.';
      if (draft.releaseDate < today) return 'That date has passed. Pick today or a later date.';
      return null;
    case 3:
      // Nothing selected is a real answer: none of it is ready.
      return null;
    case 4:
      return draft.goal || draft.goalText.trim()
        ? null
        : 'Pick what matters most, or say it in your own words.';
    case 5:
      return draft.budget ? null : 'Pick a budget to continue. "No budget" is fine.';
    default:
      return null;
  }
}
