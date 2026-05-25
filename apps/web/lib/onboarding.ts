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
  releaseId?: string | null;
  taskId?: string | null;
}

export const PROFILE_ONBOARDING_SQL = [
  'alter table public.profiles add column if not exists onboarding_completed boolean not null default false;',
  'alter table public.profiles add column if not exists onboarding_step integer not null default 1;',
  'alter table public.profiles add column if not exists onboarding_completed_at timestamptz null;',
  'alter table public.profiles add column if not exists onboarding_role text null;',
  'alter table public.profiles add column if not exists onboarding_persona text null;',
  'alter table public.profiles add column if not exists onboarding_release_process text null;',
  'alter table public.profiles add column if not exists onboarding_biggest_headache text null;',
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
  const releaseId = typeof row.onboarding_release_id === 'string' ? row.onboarding_release_id : null;
  const taskId = typeof row.onboarding_task_id === 'string' ? row.onboarding_task_id : null;

  return {
    onboardingCompleted: row.onboarding_completed === true,
    onboardingStep: normalizeOnboardingStep(row.onboarding_step),
    onboardingCompletedAt: completedAt,
    onboardingRole: onboardingRole || deriveOnboardingRoleFromPersona(onboardingPersona),
    onboardingPersona,
    onboardingReleaseProcess,
    onboardingBiggestHeadache,
    releaseId,
    taskId,
  };
};

export const shouldShowOnboardingModal = (state: OnboardingState | null): boolean => {
  if (!state) {
    return false;
  }

  return state.onboardingCompleted !== true;
};

export const getDashboardEmptyStateCopy = (role: UserRole | null) => {
  if (role === 'manager') {
    return {
      title: 'No releases yet.',
      description: 'Create the first release workspace so your team has one place to manage tracks, credits, and launch work.',
    };
  }

  if (role === 'label') {
    return {
      title: 'No releases yet.',
      description: 'Start a release workspace to organize metadata, private listening links, and pre-save momentum before launch.',
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
