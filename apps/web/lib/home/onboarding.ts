import type { HomeReleaseSummary } from './types';
import { settingsDeepLink } from '@/lib/settings-nav';

/**
 * The getting-started bar on Home (design overhaul, 2026-10-04), Deel's
 * "Complete your onboarding" with our steps. Worked out from what Home already
 * holds, so there is nothing new to store: a step is done when the thing it asks
 * for exists. The bar disappears at 100%, and a person can close it earlier.
 *
 * "Bring in a teammate" leaves the bar once it is done (founder, Oct 17, 2026)
 * instead of showing ticked and struck through, and leaves the total with it
 * ("X of 4" becomes "X of 3"). Hide only: nothing is stored. When the team
 * can't be read, teamSize is not above 1, so the step shows as before.
 */
export type OnboardingStep = {
  key: 'rollout' | 'date' | 'work' | 'team';
  label: string;
  done: boolean;
  href: string;
};

export type OnboardingProgress = {
  steps: OnboardingStep[];
  doneCount: number;
  percent: number;
  complete: boolean;
};

export function buildOnboardingProgress(releases: readonly HomeReleaseSummary[]): OnboardingProgress {
  const allSteps: OnboardingStep[] = [
    { key: 'rollout', label: 'Start a rollout', done: releases.length > 0, href: '/dashboard' },
    { key: 'date', label: 'Set a release date', done: releases.some((release) => release.releaseDate !== null), href: '/dashboard' },
    { key: 'work', label: 'Finish your first activity', done: releases.some((release) => release.progress.done > 0), href: '/dashboard' },
    { key: 'team', label: 'Bring in a teammate', done: releases.some((release) => release.teamSize > 1), href: settingsDeepLink({ segment: 'team' }) },
  ];
  const steps = allSteps.filter((step) => !(step.key === 'team' && step.done));
  const doneCount = steps.filter((step) => step.done).length;
  return {
    steps,
    doneCount,
    percent: Math.round((doneCount / steps.length) * 100),
    complete: doneCount === steps.length,
  };
}
