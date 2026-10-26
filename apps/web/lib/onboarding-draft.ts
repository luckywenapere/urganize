// Anonymous onboarding draft state. Lives in sessionStorage so that step
// navigation and a mid-flow refresh don't lose progress. Every field here is
// consumed by the completion hand-off: releaseType, title, releaseDate and
// artistName create the release (artistName since 2026-10-11, so the planner
// that opens right after never asks who the artist is); planningPreference, whereStuck and stage are PATCHed
// onto the profile (whereStuck + stage since URG-192 — before that they were
// collected and then discarded).

import {
  isOnboardingPersona,
  isOnboardingPlanningPreference,
  isOnboardingStage,
  isOnboardingWhereStuck,
  type OnboardingPersona,
  type OnboardingPlanningPreference,
  type OnboardingStage,
  type OnboardingWhereStuck,
} from './onboarding';
import { isHeardFromSource, type HeardFromSource } from './heard-from';
import { deriveOnboardingStage, normalizeReadyToday } from './onboarding-readiness';
import type { ReadyItem } from './ready-today';

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
  // URG-262: "Who are you?", the first screen. Kept in the draft so it
  // survives the Google round trip; PATCHed as onboarding_persona and, for the
  // new account, turned into profiles.role (lib/onboarding.ts).
  persona: OnboardingPersona | null;
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
  // "Nothing planned yet" on step 0 (2026-10-24, lighter rollouts): the person
  // wants to look around first. When true, releaseType stays null, the
  // rollout steps are skipped (lib/onboarding-steps.ts), no rollout is made
  // and the wizard lands on Home. Picking a release type turns it off.
  nothingPlanned: boolean;
  // "How did you hear about Urganize?" (2026-10-25), optional, on the account
  // step. Kept in the draft so it survives the Google round trip.
  heardFrom: HeardFromSource | null;
}

/** Step 0 is answered: a release type that has a playbook, or "Nothing planned yet". */
export function hasWorkingOnAnswer(
  draft: Pick<OnboardingDraft, 'releaseType' | 'nothingPlanned'>,
  isTypeAvailable: (type: OnboardingReleaseType | null) => boolean
): boolean {
  return draft.nothingPlanned || isTypeAvailable(draft.releaseType);
}

export const EMPTY_ONBOARDING_DRAFT: OnboardingDraft = {
  persona: null,
  releaseType: null,
  whereStuck: [],
  readyToday: [],
  stage: null,
  title: '',
  releaseDate: '',
  artistName: '',
  planningPreference: 'ai_recommendations',
  nothingPlanned: false,
  heardFrom: null,
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
      persona: isOnboardingPersona(parsed.persona) ? parsed.persona : null,
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
      // A release type wins over a stale flag, so the two can never both be on.
      nothingPlanned: parsed.nothingPlanned === true && !isReleaseType(parsed.releaseType),
      heardFrom: isHeardFromSource(parsed.heardFrom) ? parsed.heardFrom : null,
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
