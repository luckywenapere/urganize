// Anonymous onboarding draft state. Lives in sessionStorage so that step
// navigation and a mid-flow refresh don't lose progress. Every field here is
// consumed by the completion hand-off: releaseType, title and releaseDate
// create the release; planningPreference, whereStuck and stage are PATCHed
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
  { value: 'managing_multiple_releases', label: 'Managing multiple releases at once' },
  { value: 'marketing_promo', label: 'Marketing and promo' },
  { value: 'distribution', label: 'Distribution and platforms' },
];

// Six stages, each mapping to a different entry-task in the single template.
// See apps/web/lib/onboarding-ai-moment.ts for the stage → entry-task mapping.
// The labels are written so a user can pick the one that matches their
// reality without overthinking — short, in their voice.
export const ONBOARDING_STAGE_OPTIONS: Array<{ value: OnboardingStage; label: string }> = [
  { value: 'just_starting', label: "Just starting — still writing or recording" },
  { value: 'recorded', label: 'Tracks recorded, working on mix and master' },
  { value: 'preparing', label: 'Preparing the rollout — assets, splits, distribution' },
  { value: 'date_set', label: 'Release date is set, working on promo' },
  { value: 'promoting', label: 'Actively promoting — teasers and curator outreach' },
  { value: 'post_release', label: "Already out — running the post-release plan" },
];

export interface OnboardingDraft {
  releaseType: OnboardingReleaseType | null;
  whereStuck: OnboardingWhereStuck[];
  stage: OnboardingStage | null;
  title: string;
  releaseDate: string;
  // URG-158: which way the user wants releases planned going forward.
  // Defaults to 'ai_recommendations' — the "Your first move" step (4)
  // already demonstrates a tailored suggestion, so that's the path of
  // least friction; the user can switch to 'start_from_scratch' there.
  planningPreference: OnboardingPlanningPreference;
}

export const EMPTY_ONBOARDING_DRAFT: OnboardingDraft = {
  releaseType: null,
  whereStuck: [],
  stage: null,
  title: '',
  releaseDate: '',
  planningPreference: 'ai_recommendations',
};

const STORAGE_KEY = 'urganize.onboarding.draft';

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
      stage: isOnboardingStage(parsed.stage) ? parsed.stage : null,
      title: typeof parsed.title === 'string' ? parsed.title : '',
      releaseDate: typeof parsed.releaseDate === 'string' ? parsed.releaseDate : '',
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
