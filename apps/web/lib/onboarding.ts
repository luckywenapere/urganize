export type UserRole = 'artist' | 'manager' | 'label' | 'other';
export type OnboardingStep = 1 | 2 | 3 | 4 | 5;
export type OnboardingPersona =
  | 'independent_artist'
  | 'music_manager'
  | 'label_ar'
  | 'producer_beatmaker'
  | 'other';
export type OnboardingReleaseProcess =
  | 'spreadsheets_or_notes'
  | 'group_chats_and_dms'
  | 'nothing_structured_yet'
  | 'another_tool';
export type OnboardingBiggestHeadache =
  | 'keeping_team_aligned'
  | 'tracking_whats_done_and_whats_next'
  | 'collecting_credits_and_metadata'
  | 'managing_multiple_releases_at_once';
export type OnboardingPlanningPreference = 'ai_recommendations' | 'start_from_scratch';
// URG-192: the signup wizard's two qualitative answers. Declared here (the
// API-contract module) rather than in onboarding-draft.ts so the route
// handler can validate them without importing a sessionStorage module;
// onboarding-draft.ts re-exports both, so its own importers are unaffected.
export type OnboardingWhereStuck =
  | 'keeping_team_aligned'
  | 'tracking_progress'
  | 'collecting_credits'
  | 'managing_multiple_releases'
  | 'marketing_promo'
  | 'distribution';
export type OnboardingStage =
  | 'just_starting'
  | 'recorded'
  | 'preparing'
  | 'date_set'
  | 'promoting'
  | 'post_release';

export const ONBOARDING_TASK_CREATED_EVENT = 'urganize:onboarding-task-created';
export const ONBOARDING_INVITE_SENT_EVENT = 'urganize:onboarding-invite-sent';

export interface OnboardingState {
  onboardingCompleted: boolean;
  onboardingStep: OnboardingStep;
  onboardingCompletedAt: string | null;
  onboardingRole: UserRole | null;
  onboardingPersona: OnboardingPersona | null;
  onboardingReleaseProcess: OnboardingReleaseProcess | null;
  onboardingBiggestHeadache: OnboardingBiggestHeadache | null;
  onboardingPlanningPreference: OnboardingPlanningPreference | null;
  // Null means "never asked" (a pre-URG-192 signup); an empty array means
  // asked and nothing picked. Worth telling apart, so the column is
  // nullable rather than defaulting to '{}'.
  onboardingWhereStuck: OnboardingWhereStuck[] | null;
  onboardingStage: OnboardingStage | null;
  releaseId: string | null;
  taskId: string | null;
}

export interface OnboardingApiResponse {
  onboarding: OnboardingState;
}

export interface OnboardingApiError {
  error: string;
  details?: string;
  sql?: string;
}

export interface UpdateOnboardingBody {
  onboardingCompleted?: boolean;
  onboardingStep?: number;
  onboardingRole?: UserRole | null;
  onboardingPersona?: OnboardingPersona | null;
  onboardingReleaseProcess?: OnboardingReleaseProcess | null;
  onboardingBiggestHeadache?: OnboardingBiggestHeadache | null;
  onboardingPlanningPreference?: OnboardingPlanningPreference | null;
  onboardingWhereStuck?: OnboardingWhereStuck[] | null;
  onboardingStage?: OnboardingStage | null;
  releaseId?: string | null;
  taskId?: string | null;
}

// DEPRECATED schema-missing-fallback payload (see CLAUDE.md → "Patterns being
// deprecated in v1"). Deliberately NOT extended with URG-192's
// onboarding_where_stuck / onboarding_stage columns: those live only in
// supabase/migrations/20260729120000_profiles_onboarding_where_stuck_stage.sql,
// which is the source of truth per principle 9. Letting this string mint
// columns is exactly how the earlier onboarding_* drift happened — the
// 20260720100000 migration had to heal columns this fallback had created in
// production and never backfilled. Run the migration instead.
export const PROFILE_ONBOARDING_SQL = [
  'alter table public.profiles add column if not exists onboarding_completed boolean not null default false;',
  'alter table public.profiles add column if not exists onboarding_step integer not null default 1;',
  'alter table public.profiles add column if not exists onboarding_completed_at timestamptz null;',
  'alter table public.profiles add column if not exists onboarding_role text null;',
  'alter table public.profiles add column if not exists onboarding_persona text null;',
  'alter table public.profiles add column if not exists onboarding_release_process text null;',
  'alter table public.profiles add column if not exists onboarding_biggest_headache text null;',
  'alter table public.profiles add column if not exists onboarding_planning_preference text null;',
  'alter table public.profiles add column if not exists onboarding_release_id uuid null references public.releases(id) on delete set null;',
  'alter table public.profiles add column if not exists onboarding_task_id uuid null references public.tasks(id) on delete set null;',
  '',
  'update public.profiles',
  'set onboarding_completed = false',
  'where onboarding_completed is null;',
  '',
  'update public.profiles',
  'set onboarding_step = 1',
  'where onboarding_step is null or onboarding_step < 1;',
].join('\n');

export const ONBOARDING_ROLE_LABELS: Record<UserRole, string> = {
  artist: 'Artist',
  manager: 'Manager',
  label: 'Label',
  other: 'Other',
};

export const ONBOARDING_PERSONA_LABELS: Record<OnboardingPersona, string> = {
  independent_artist: 'Independent Artist',
  music_manager: 'Music Manager',
  label_ar: 'Label / A&R',
  producer_beatmaker: 'Producer / Beatmaker',
  other: 'Other',
};

export const ONBOARDING_RELEASE_PROCESS_LABELS: Record<OnboardingReleaseProcess, string> = {
  spreadsheets_or_notes: 'Spreadsheets or notes',
  group_chats_and_dms: 'Group chats and DMs',
  nothing_structured_yet: 'Nothing structured yet',
  another_tool: 'Another tool',
};

export const ONBOARDING_BIGGEST_HEADACHE_LABELS: Record<OnboardingBiggestHeadache, string> = {
  keeping_team_aligned: 'Keeping the team aligned',
  tracking_whats_done_and_whats_next: "Tracking what's done and what's next",
  collecting_credits_and_metadata: 'Collecting credits and metadata',
  managing_multiple_releases_at_once: 'Managing multiple releases at once',
};

export const ONBOARDING_PLANNING_PREFERENCE_LABELS: Record<OnboardingPlanningPreference, string> = {
  ai_recommendations: 'Give me AI recommendations',
  start_from_scratch: 'I prefer to start from scratch',
};

export const isUserRole = (value: unknown): value is UserRole =>
  value === 'artist' || value === 'manager' || value === 'label' || value === 'other';

export const isOnboardingPersona = (value: unknown): value is OnboardingPersona =>
  value === 'independent_artist' ||
  value === 'music_manager' ||
  value === 'label_ar' ||
  value === 'producer_beatmaker' ||
  value === 'other';

export const isOnboardingReleaseProcess = (value: unknown): value is OnboardingReleaseProcess =>
  value === 'spreadsheets_or_notes' ||
  value === 'group_chats_and_dms' ||
  value === 'nothing_structured_yet' ||
  value === 'another_tool';

export const isOnboardingBiggestHeadache = (value: unknown): value is OnboardingBiggestHeadache =>
  value === 'keeping_team_aligned' ||
  value === 'tracking_whats_done_and_whats_next' ||
  value === 'collecting_credits_and_metadata' ||
  value === 'managing_multiple_releases_at_once';

export const isOnboardingPlanningPreference = (value: unknown): value is OnboardingPlanningPreference =>
  value === 'ai_recommendations' || value === 'start_from_scratch';

export const isOnboardingWhereStuck = (value: unknown): value is OnboardingWhereStuck =>
  value === 'keeping_team_aligned' ||
  value === 'tracking_progress' ||
  value === 'collecting_credits' ||
  value === 'managing_multiple_releases' ||
  value === 'marketing_promo' ||
  value === 'distribution';

// Multi-select: every entry must be valid and the list must be unique, so a
// crafted body can't smuggle in a 500-item array or repeat one value to skew
// future aggregate counts.
export const isOnboardingWhereStuckList = (value: unknown): value is OnboardingWhereStuck[] =>
  Array.isArray(value) &&
  value.every(isOnboardingWhereStuck) &&
  new Set(value).size === value.length;

export const isOnboardingStage = (value: unknown): value is OnboardingStage =>
  value === 'just_starting' ||
  value === 'recorded' ||
  value === 'preparing' ||
  value === 'date_set' ||
  value === 'promoting' ||
  value === 'post_release';

export const deriveOnboardingRoleFromPersona = (persona: OnboardingPersona | null): UserRole | null => {
  if (persona === 'independent_artist') {
    return 'artist';
  }

  if (persona === 'music_manager') {
    return 'manager';
  }

  if (persona === 'label_ar') {
    return 'label';
  }

  if (persona === 'producer_beatmaker' || persona === 'other') {
    return 'other';
  }

  return null;
};

export const derivePersonaFromRole = (role: UserRole | null): OnboardingPersona | null => {
  if (role === 'artist') {
    return 'independent_artist';
  }

  if (role === 'manager') {
    return 'music_manager';
  }

  if (role === 'label') {
    return 'label_ar';
  }

  if (role === 'other') {
    return 'other';
  }

  return null;
};

export const normalizeOnboardingStep = (value: unknown): OnboardingStep => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 1;
  }

  if (numericValue <= 1) {
    return 1;
  }

  if (numericValue >= 5) {
    return 5;
  }

  if (numericValue === 4) {
    return 4;
  }

  if (numericValue === 3) {
    return 3;
  }

  return 2;
};

export const normalizeOnboardingState = (value: unknown): OnboardingState => {
  const row = (value || {}) as Record<string, unknown>;
  const onboardingRole = isUserRole(row.onboarding_role) ? row.onboarding_role : null;
  const onboardingPersona = isOnboardingPersona(row.onboarding_persona)
    ? row.onboarding_persona
    : derivePersonaFromRole(onboardingRole);
  const completedAt = typeof row.onboarding_completed_at === 'string' ? row.onboarding_completed_at : null;
  const onboardingReleaseProcess = isOnboardingReleaseProcess(row.onboarding_release_process)
    ? row.onboarding_release_process
    : null;
  const onboardingBiggestHeadache = isOnboardingBiggestHeadache(row.onboarding_biggest_headache)
    ? row.onboarding_biggest_headache
    : null;
  const onboardingPlanningPreference = isOnboardingPlanningPreference(row.onboarding_planning_preference)
    ? row.onboarding_planning_preference
    : null;
  const releaseId = typeof row.onboarding_release_id === 'string' ? row.onboarding_release_id : null;
  const taskId = typeof row.onboarding_task_id === 'string' ? row.onboarding_task_id : null;
  // Preserve the null/empty distinction on the way out: an array (even an
  // empty one) means the question was asked. Anything unrecognized —
  // including a pre-migration undefined — reads as null. Unknown members are
  // filtered rather than nulling the whole answer, so one stale value from an
  // older option set doesn't discard the valid picks alongside it.
  const onboardingWhereStuck = Array.isArray(row.onboarding_where_stuck)
    ? row.onboarding_where_stuck.filter(isOnboardingWhereStuck)
    : null;
  const onboardingStage = isOnboardingStage(row.onboarding_stage) ? row.onboarding_stage : null;

  return {
    onboardingCompleted: row.onboarding_completed === true,
    onboardingStep: normalizeOnboardingStep(row.onboarding_step),
    onboardingCompletedAt: completedAt,
    onboardingRole: onboardingRole || deriveOnboardingRoleFromPersona(onboardingPersona),
    onboardingPersona,
    onboardingReleaseProcess,
    onboardingBiggestHeadache,
    onboardingPlanningPreference,
    onboardingWhereStuck,
    onboardingStage,
    releaseId,
    taskId,
  };
};

// shouldShowOnboardingModal was removed 2026-07-29 (URG-191) along with
// FirstTimeOnboardingGate, its only caller. /onboarding is the sole
// onboarding surface; nothing gates a dashboard overlay on this flag now.

export const getDashboardEmptyStateCopy = (role: UserRole | null) => {
  if (role === 'manager') {
    return {
      title: 'No releases yet.',
      description: 'Create your first release so your team has one place for tracks, credits and launch work.',
    };
  }

  if (role === 'label') {
    return {
      title: 'No releases yet.',
      description: 'Start a release to organize metadata, private listening links and pre-save momentum before launch.',
    };
  }

  if (role === 'other') {
    return {
      title: 'No releases yet.',
      description: 'Create a release to start organizing tasks, assets, and collaborators.',
    };
  }

  return {
    title: 'No releases yet.',
    description: 'Start with a release. Once it exists, the playbook, tracks, credits, and launch workflow all snap into place.',
  };
};
