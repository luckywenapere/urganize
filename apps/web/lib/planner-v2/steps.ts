/**
 * Which v2 questions are asked, in order, and what each still needs before
 * Continue works. Pure, so Back, Continue and "Question N of M" all read one
 * list and vitest holds the rules.
 */

import { daysBetween, type PlannerV2Answers } from './answers';

export const V2_STEPS = ['music', 'date', 'win', 'budget', 'channels', 'team'] as const;
export type V2Step = (typeof V2_STEPS)[number];

export const V2_STEP_TITLES: Record<V2Step, string> = {
  music: "Where's the music right now?",
  // Only asked for music already out (2026-10-26, Oyin: the planner never
  // depends on a release date; the "Set your release date" row is the anchor).
  date: 'When did it come out?',
  win: 'What would make this a win?',
  budget: 'How much can you spend on promo?',
  channels: 'Where do your fans listen and scroll?',
  team: "Who's doing the work?",
};

/** The date question's title (asked only when the song is already out). */
export const V2_OUT_DATE_TITLE = 'When did it come out?';

/**
 * The date question is asked ONLY for music already out, and skipped when the
 * rollout already has a past date. Everything else is four questions.
 */
export function visibleV2Steps(input: {
  stage: PlannerV2Answers['stage'];
  prefilledDate: string | null | undefined;
  todayYmd: string;
}): V2Step[] {
  const date = input.prefilledDate ?? '';
  const known = /^\d{4}-\d{2}-\d{2}$/.test(date) && daysBetween(date, input.todayYmd) >= 0;
  const ask = input.stage === 'out' && !known;
  return V2_STEPS.filter((step) => step !== 'date' || ask);
}

/** What the step still needs, as the short line under Continue, or null when ready. */
export function v2StepBlocker(step: V2Step, answers: PlannerV2Answers, todayYmd: string): string | null {
  switch (step) {
    case 'music':
      return null;
    case 'date':
      if (answers.stage !== 'out') return null;
      if (answers.release_date && daysBetween(answers.release_date, todayYmd) < 0) return 'Pick today or an earlier day.';
      return answers.out_when || answers.release_date ? null : 'Pick when it came out.';
    case 'win':
      return answers.wins.length || answers.win_text.trim() ? null : 'Pick at least one.';
    case 'budget':
      return null;
    case 'channels':
      return answers.channels.length ? null : 'Pick at least one.';
    case 'team':
      return null;
  }
}
