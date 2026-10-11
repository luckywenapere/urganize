// Anonymous onboarding draft state. Lives in sessionStorage so that step
// navigation and a mid-flow refresh don't lose progress. Every field here is
// consumed by the completion hand-off: releaseType, title, releaseDate and
// artistName create the release (artistName since 2026-10-11, so the planner
// that opens right after never asks who the artist is); planningPreference, whereStuck and stage are PATCHed
// onto the profile (whereStuck + stage since URG-192 — before that they were
// collected and then discarded).

import {
  isOnboardingPlanningPreference,
  isOnboardingStage,
  isOnboardingWhereStuck,
  type OnboardingPlanningPreference,
  type OnboardingStage,
  type OnboardingWhereStuck,
} from './onboarding';
import { deriveOnboardingStage, normalizeReadyToday } from './onboarding-readiness';
import type { ReadyItem } from './release-planning';

// Re-exported so existing importers (OnboardingPageClient, onboarding-ai-
// moment) keep their import site. Canonical declarations live in
// ./onboarding alongside the other onboarding answer types.
export type { OnboardingStage, OnboardingWhereStuck };

export type OnboardingReleaseType = 'single' | 'ep' | 'album' | 'music_video';

export const ONBOARDING_RELEASE_TYPES: Array<{ value: OnboardingReleaseType; label: string }> = [
  { value: 'single', label: 'Single' },
  { value: 'ep', label: 'EP' },
  { value: 'album', label: 'Album' },
  { value: 'music_video', label: 'Music Video' },
];

export const ONBOARDING_WHERE_STUCK_OPTIONS: Array<{ value: OnboardingWhereStuck; label: string }> = [
  { value: 'keeping_team_aligned', label: 'Keeping the team aligned' },
  { value: 'tracking_progress', label: "Tracking what's done and what's next" },
  { value: 'collecting_credits', label: 'Collecting credits and metadata' },
  { value: 'managing_multiple_releases', label: 'Managing multiple rollouts at once' },
  { value: 'marketing_promo', label: 'Marketing and promo' },
  { value: 'distribution', label: 'Distribution and platforms' },
];

// Six stages, each mapping to a different entry-task in the single template.
// See apps/web/lib/onboarding-ai-moment.ts for the stage → entry-task mapping.
// The labels are written so a user can pick the one that matches their
// reality without overthinking — short, in their voice.
export const ONBOARDING_STAGE_OPTIONS: Array<{ value: OnboardingStage; label: string }> = [
  { value: 'just_starting', label: "Just starting: still writing or recording" },
  { value: 'recorded', label: 'Tracks recorded, working on mix and master' },
  { value: 'preparing', label: 'Preparing the rollout: assets, splits, distribution' },
  { value: 'date_set', label: 'Release date is set, working on promo' },
  { value: 'promoting', label: 'Actively promoting: teasers and curator outreach' },
  { value: 'post_release', label: "Already out: running the post-release plan" },
];

export interface OnboardingDraft {
  releaseType: OnboardingReleaseType | null;
  whereStuck: OnboardingWhereStuck[];
  // "What's already done?" (2026-10-11): the planner's readiness checklist,
  // asked once here and handed to the planner, which then skips its own copy.
  // Same values as the planner's ReadyItem, so the pre-completion of playbook
  // steps (isTaskPreCompletedByReady) works on it unchanged.
  readyToday: ReadyItem[];
  // DERIVED from readyToday (lib/onboarding-readiness.ts), no longer asked.
  // Still stored on the profile (admin tallies) and read by "Your first move".
  stage: OnboardingStage | null;
  title: string;
  releaseDate: string;
  // Who the rollout is for. Asked on the rollout step beside the title and
  // date (2026-10-11), sent with the release, and handed to the planner so
  // its "Who's the artist?" question is skipped.
  artistName: string;
  // URG-158: which way the user wants releases planned going forward.
  // Defaults to 'ai_recommendations' — the "Your first move" step (4)
  // already demonstrates a tailored suggestion, so that's the path of
  // least friction; the user can switch to 'start_from_scratch' there.
  planningPreference: OnboardingPlanningPreference;
}

export const EMPTY_ONBOARDING_DRAFT: OnboardingDraft = {
  releaseType: null,
  whereStuck: [],
  readyToday: [],
  stage: null,
  title: '',
  releaseDate: '',
  artistName: '',
  planningPreference: 'ai_recommendations',
};

const STORAGE_KEY = 'urganize.onboarding.draft';

/** Same ceiling as every other artist name field (the planner, /api/releases, Settings). */
export const MAX_ONBOARDING_ARTIST_NAME_LENGTH = 120;

const isReleaseType = (value: unknown): value is OnboardingReleaseType =>
  value === 'single' || value === 'ep' || value === 'album' || value === 'music_video';

export function loadOnboardingDraft(): OnboardingDraft {
  if (typeof window === 'undefined') {
    return EMPTY_ONBOARDING_DRAFT;
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_ONBOARDING_DRAFT;
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft> | null;
    if (!parsed || typeof parsed !== 'object') return EMPTY_ONBOARDING_DRAFT;

    return {
      releaseType: isReleaseType(parsed.releaseType) ? parsed.releaseType : null,
      whereStuck: Array.isArray(parsed.whereStuck)
        ? parsed.whereStuck.filter(isOnboardingWhereStuck)
        : [],
      ...(() => {
        // A draft saved before 2026-10-11 has a stage and no readiness: it
        // keeps its stage, and the readiness question is simply unanswered.
        const readyToday = Array.isArray(parsed.readyToday) ? normalizeReadyToday(parsed.readyToday) : [];
        return {
          readyToday,
          stage: readyToday.length
            ? deriveOnboardingStage(readyToday)
            : isOnboardingStage(parsed.stage)
              ? parsed.stage
              : null,
        };
      })(),
      title: typeof parsed.title === 'string' ? parsed.title : '',
      releaseDate: typeof parsed.releaseDate === 'string' ? parsed.releaseDate : '',
      artistName:
        typeof parsed.artistName === 'string'
          ? parsed.artistName.slice(0, MAX_ONBOARDING_ARTIST_NAME_LENGTH)
          : '',
      planningPreference: isOnboardingPlanningPreference(parsed.planningPreference)
        ? parsed.planningPreference
        : EMPTY_ONBOARDING_DRAFT.planningPreference,
    };
  } catch {
    return EMPTY_ONBOARDING_DRAFT;
  }
}

export function saveOnboardingDraft(draft: OnboardingDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage might be unavailable (private mode, quota); the draft just
    // won't survive a refresh, but the user can still complete the flow.
  }
}

export function clearOnboardingDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — best-effort clear.
  }
}
