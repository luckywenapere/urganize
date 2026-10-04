import type { HomeReleaseSummary } from './types';
import { settingsDeepLink } from '@/lib/settings-nav';

/**
 * The getting-started bar on Home (design overhaul, 2026-10-04), Deel's
 * "Complete your onboarding" with our steps. Worked out from what Home already
 * holds, so there is nothing new to store: a step is done when the thing it asks
 * for exists. The bar disappears at 100%, and a person can close it earlier.
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
  const steps: OnboardingStep[] = [
    { key: 'rollout', label: 'Start a rollout', done: releases.length > 0, href: '/dashboard' },
    { key: 'date', label: 'Set a release date', done: releases.some((release) => release.releaseDate !== null), href: '/dashboard' },
    { key: 'work', label: 'Finish your first activity', done: releases.some((release) => release.progress.done > 0), href: '/dashboard' },
    { key: 'team', label: 'Bring in a teammate', done: releases.some((release) => release.teamSize > 1), href: settingsDeepLink({ segment: 'team' }) },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  return {
    steps,
    doneCount,
    percent: Math.round((doneCount / steps.length) * 100),
    complete: doneCount === steps.length,
  };
}
