export const ARTISTS_TABLE = 'artists';
export const COLLABORATORS_TABLE = 'collaborators';
export const RELEASE_COLLABORATORS_TABLE = 'release_collaborators';
export const RELEASE_METADATA_TABLE = 'release_metadata';
export const RELEASE_EVENTS_TABLE = 'release_events';

export const RELEASE_OPS_SQL = [
  'create extension if not exists pgcrypto;',
  '',
  `create table if not exists public.${ARTISTS_TABLE} (`,
  '  id uuid primary key default gen_random_uuid(),',
  '  owner_user_id uuid not null references auth.users(id) on delete cascade,',
  '  name text not null,',
  '  slug text not null,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  `create unique index if not exists ${ARTISTS_TABLE}_owner_slug_idx on public.${ARTISTS_TABLE}(owner_user_id, slug);`,
  '',
  'alter table public.releases add column if not exists owner_user_id uuid null references auth.users(id) on delete cascade;',
  'alter table public.releases add column if not exists artist_id uuid null references public.artists(id) on delete set null;',
  'alter table public.releases add column if not exists slug text null;',
  'alter table public.releases add column if not exists description text null;',
  'update public.releases set owner_user_id = coalesce(owner_user_id, user_id) where owner_user_id is null;',
  'update public.releases set slug = coalesce(slug, regexp_replace(lower(title), \'[^a-z0-9]+\', \'-\', \'g\')) where slug is null and title is not null;',
  '',
  `create table if not exists public.${COLLABORATORS_TABLE} (`,
  '  id uuid primary key default gen_random_uuid(),',
  '  full_name text not null,',
  '  stage_name text null,',
  '  email text null,',
  '  phone text null,',
  '  default_role text null,',
  '  claimed_user_id uuid null references auth.users(id) on delete set null,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  `create index if not exists ${COLLABORATORS_TABLE}_email_idx on public.${COLLABORATORS_TABLE}(email);`,
  `create index if not exists ${COLLABORATORS_TABLE}_phone_idx on public.${COLLABORATORS_TABLE}(phone);`,
  '',
  `create table if not exists public.${RELEASE_COLLABORATORS_TABLE} (`,
  '  id uuid primary key default gen_random_uuid(),',
  '  release_id uuid not null references public.releases(id) on delete cascade,',
  `  collaborator_id uuid null references public.${COLLABORATORS_TABLE}(id) on delete set null,`,
  '  invite_name text not null default \'\',',
  '  invite_contact text not null default \'\',',
  '  role text not null default \'other\',',
  '  status text not null default \'pending\',',
  '  submission_token text not null unique,',
  '  submission_sent_at timestamptz null,',
  '  submitted_at timestamptz null,',
  '  last_reminded_at timestamptz null,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  `create index if not exists ${RELEASE_COLLABORATORS_TABLE}_release_idx on public.${RELEASE_COLLABORATORS_TABLE}(release_id, status, created_at);`,
  '',
  `create table if not exists public.${RELEASE_METADATA_TABLE} (`,
  '  id uuid primary key default gen_random_uuid(),',
  '  release_id uuid not null unique references public.releases(id) on delete cascade,',
  '  isrc text null,',
  '  upc text null,',
  '  primary_artist_name text not null default \'\',',
  '  release_title text not null default \'\',',
  '  genre text null,',
  '  subgenre text null,',
  '  label_name text null,',
  '  language text null,',
  '  explicit boolean null,',
  '  artwork_url text null,',
  '  producer_credits_json jsonb null,',
  '  writer_credits_json jsonb null,',
  '  featured_artist_credits_json jsonb null,',
  '  mixing_credits_json jsonb null,',
  '  mastering_credits_json jsonb null,',
  '  all_credits_json jsonb null,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  `create table if not exists public.${RELEASE_EVENTS_TABLE} (`,
  '  id uuid primary key default gen_random_uuid(),',
  '  release_id uuid not null references public.releases(id) on delete cascade,',
  '  type text not null,',
  '  payload_json jsonb not null default \'{}\'::jsonb,',
  '  created_at timestamptz not null default now()',
  ');',
  `create index if not exists ${RELEASE_EVENTS_TABLE}_release_idx on public.${RELEASE_EVENTS_TABLE}(release_id, created_at desc);`,
  '',
  `alter table public.${ARTISTS_TABLE} enable row level security;`,
  `alter table public.${COLLABORATORS_TABLE} enable row level security;`,
  `alter table public.${RELEASE_COLLABORATORS_TABLE} enable row level security;`,
  `alter table public.${RELEASE_METADATA_TABLE} enable row level security;`,
  `alter table public.${RELEASE_EVENTS_TABLE} enable row level security;`,
].join('\n');

export type ReleaseStatus = 'draft' | 'in_progress' | 'ready';
export type CollaboratorStatus = 'pending' | 'submitted';
export type ReleaseEventType =
  | 'release_created'
  | 'collaborator_added'
  | 'reminder_sent'
  | 'metadata_updated'
  | 'metadata_viewed'
  | 'playbook_state_saved'
  | 'playbook_steps_initialized';

export type ReadinessChecklistStatus = 'complete' | 'in_progress' | 'pending' | 'locked';
export type ReadinessChecklistItem = {
  id: 'review_metadata' | 'ready_for_distribution';
  label: string;
  status: ReadinessChecklistStatus;
  detail: string;
};

export type ReadinessNextAction = {
  type: 'send_reminder' | 'view_metadata' | 'none';
  label: string;
};

export type ReleaseSummary = {
  id: string;
  ownerUserId: string;
  artistId: string;
  artistName: string;
  title: string;
  slug: string;
  status: ReleaseStatus;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type ReleaseCollaborator = {
  id: string;
  releaseId: string;
  collaboratorId: string;
  inviteName: string;
  inviteContact: string;
  role: string;
  status: CollaboratorStatus;
  submissionToken: string;
  submissionSentAt: string | null;
  submittedAt: string | null;
  lastRemindedAt: string | null;
  createdAt: string;
  updatedAt: string;
  collaboratorName: string;
  stageName: string;
  email: string;
  phone: string;
};

export type ReleaseMetadataSnapshot = {
  id: string;
  releaseId: string;
  isrc: string;
  upc: string;
  primaryArtistName: string;
  releaseTitle: string;
  genre: string;
  subgenre: string;
  labelName: string;
  language: string;
  explicit: boolean | null;
  artworkUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type ReadinessState = {
  basicsComplete: boolean;
  collaboratorsAdded: boolean;
  metadataComplete: boolean;
  metadataSnapshotBuilt: boolean;
  metadataReviewed: boolean;
  readyForDistribution: boolean;
  completionPercent: number;
  pendingCollaborators: number;
  submittedCollaborators: number;
  nextStep: string;
  checklist: ReadinessChecklistItem[];
  nextAction: ReadinessNextAction;
};

export type ReleaseCollaboratorInput = {
  inviteName: string;
  inviteContact: string;
  role: string;
};

const trimString = (value: unknown): string => String(value || '').trim();
export const normalizeReleaseSlug = (value: string): string =>
  trimString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

export const normalizeReleaseCollaboratorInput = (value: unknown): ReleaseCollaboratorInput => {
  const raw = (value || {}) as Partial<ReleaseCollaboratorInput>;
  return {
    inviteName: trimString(raw.inviteName),
    inviteContact: trimString(raw.inviteContact),
    role: trimString(raw.role) || 'other',
  };
};

export const normalizeCollaboratorInputs = (value: unknown): ReleaseCollaboratorInput[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeReleaseCollaboratorInput(item))
    .filter((item) => item.inviteName || item.inviteContact || item.role);
};

export const validateCollaboratorInput = (value: ReleaseCollaboratorInput): string => {
  if (!value.inviteName) return 'Collaborator name is required.';
  if (!value.inviteContact) return 'Invite contact is required.';
  if (!value.role) return 'Collaborator role is required.';
  return '';
};

export const calculateReleaseReadiness = (input: {
  title: string;
  artistName: string;
  collaboratorCount: number;
  submittedCount: number;
  metadata: ReleaseMetadataSnapshot | null;
  metadataViewed: boolean;
}): ReadinessState => {
  const basicsComplete = Boolean(trimString(input.title) && trimString(input.artistName));
  const collaboratorsAdded = input.collaboratorCount > 0;
  const metadataSnapshotBuilt = Boolean(input.metadata);
  const metadataReviewed = metadataSnapshotBuilt && input.metadataViewed;
  const metadataComplete = metadataSnapshotBuilt && metadataReviewed;
  const readyForDistribution = collaboratorsAdded && metadataComplete;
  const pendingCollaborators = Math.max(input.collaboratorCount - input.submittedCount, 0);

  const reviewMetadataStatus: ReadinessChecklistStatus = !metadataSnapshotBuilt
    ? 'locked'
    : metadataReviewed
      ? 'complete'
      : 'pending';
  const readyForDistributionStatus: ReadinessChecklistStatus = readyForDistribution ? 'complete' : 'pending';

  const checklist: ReadinessChecklistItem[] = [
    {
      id: 'review_metadata',
      label: 'Review metadata',
      status: reviewMetadataStatus,
      detail: !metadataSnapshotBuilt
        ? 'No metadata available yet'
        : metadataReviewed
          ? 'Metadata reviewed in the full metadata view'
          : 'Open the metadata page to review',
    },
    {
      id: 'ready_for_distribution',
      label: 'Ready for distribution',
      status: readyForDistributionStatus,
      detail: readyForDistribution
        ? 'This release is ready for distribution'
        : 'Waiting for metadata review',
    },
  ];

  const statusWeight: Record<ReadinessChecklistStatus, number> = {
    complete: 1,
    in_progress: 0.5,
    pending: 0,
    locked: 0,
  };
  const completionPercent = Math.round(
    (checklist.reduce((sum, item) => sum + statusWeight[item.status], 0) / checklist.length) * 100
  );

  let nextStep = 'Your release is ready for distribution';
  let nextAction: ReadinessNextAction = {
    type: 'none',
    label: '',
  };
  if (!collaboratorsAdded) {
    nextStep = 'Add collaborators to your release';
    nextAction = { type: 'send_reminder', label: 'Send Reminder' };
  } else if (!metadataComplete) {
    nextStep = 'Review your metadata before distribution';
    nextAction = { type: 'view_metadata', label: 'View Metadata' };
  }

  return {
    basicsComplete,
    collaboratorsAdded,
    metadataComplete,
    metadataSnapshotBuilt,
    metadataReviewed,
    readyForDistribution,
    completionPercent,
    pendingCollaborators,
    submittedCollaborators: input.submittedCount,
    nextStep,
    checklist,
    nextAction,
  };
};
