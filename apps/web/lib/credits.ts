export const CREDIT_COLLECTION_LINKS_TABLE = 'credit_collection_links';
export const CONTRIBUTOR_SUBMISSIONS_TABLE = 'contributor_submissions';
export const CREDIT_FINALIZATIONS_TABLE = 'credit_finalizations';

export const CREDIT_ROLE_OPTIONS = [
  'primary artist',
  'featured artist',
  'songwriter',
  'composer',
  'producer',
  'mixing engineer',
  'mastering engineer',
  'instrumentalist',
  'background vocalist',
  'other',
] as const;

export type CreditRoleType = (typeof CREDIT_ROLE_OPTIONS)[number];

export type CreditCollectionLink = {
  id: string;
  releaseId: string;
  token: string;
  isActive: boolean;
  createdAt: string;
  expiresAt: string | null;
};

export type ContributorSubmission = {
  id: string;
  releaseId: string;
  collectionLinkId: string;
  legalFullName: string;
  creditedName: string;
  email: string;
  phoneNumber: string;
  roleType: CreditRoleType;
  contributionNotes: string;
  performingNameIfDifferent: string;
  proAffiliation: string;
  ipiCaeNumber: string;
  publisherName: string;
  splitPercentage: string;
  isSplitConfirmed: boolean;
  country: string;
  socialHandle: string;
  additionalNotes: string;
  submissionStatus: 'submitted';
  submittedAt: string;
  updatedAt: string;
};

export type CreditFinalization = {
  releaseId: string;
  isFinalized: boolean;
  finalizedAt: string | null;
  finalizedByUserId: string | null;
};

export type ContributorSubmissionInput = Omit<
  ContributorSubmission,
  'id' | 'releaseId' | 'collectionLinkId' | 'submissionStatus' | 'submittedAt' | 'updatedAt'
>;

export type ReleaseCreditsSummary = {
  link: CreditCollectionLink | null;
  submissions: ContributorSubmission[];
  finalization: CreditFinalization | null;
};

export const CREDITS_COLLECTION_SQL = [
  'create extension if not exists pgcrypto;',
  '',
  'create table if not exists public.credit_collection_links (',
  '  id uuid primary key default gen_random_uuid(),',
  '  release_id uuid not null references public.releases(id) on delete cascade,',
  '  token text not null unique,',
  '  is_active boolean not null default true,',
  '  created_at timestamptz not null default now(),',
  '  expires_at timestamptz null',
  ');',
  '',
  'create index if not exists credit_collection_links_release_id_idx',
  '  on public.credit_collection_links(release_id);',
  '',
  'create table if not exists public.contributor_submissions (',
  '  id uuid primary key default gen_random_uuid(),',
  '  release_id uuid not null references public.releases(id) on delete cascade,',
  '  collection_link_id uuid not null references public.credit_collection_links(id) on delete cascade,',
  '  legal_full_name text not null default \'\',',
  '  credited_name text not null default \'\',',
  '  email text not null default \'\',',
  '  phone_number text not null default \'\',',
  '  role_type text not null default \'other\',',
  '  contribution_notes text not null default \'\',',
  '  performing_name_if_different text not null default \'\',',
  '  pro_affiliation text not null default \'\',',
  '  ipi_cae_number text not null default \'\',',
  '  publisher_name text not null default \'\',',
  '  split_percentage numeric(5,2) null,',
  '  is_split_confirmed boolean not null default false,',
  '  country text not null default \'\',',
  '  social_handle text not null default \'\',',
  '  additional_notes text not null default \'\',',
  '  submission_status text not null default \'submitted\',',
  '  submitted_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  'create index if not exists contributor_submissions_release_id_idx',
  '  on public.contributor_submissions(release_id);',
  'create index if not exists contributor_submissions_link_id_idx',
  '  on public.contributor_submissions(collection_link_id);',
  '',
  'create table if not exists public.credit_finalizations (',
  '  release_id uuid primary key references public.releases(id) on delete cascade,',
  '  is_finalized boolean not null default false,',
  '  finalized_at timestamptz null,',
  '  finalized_by_user_id uuid null references auth.users(id) on delete set null',
  ');',
  '',
  'alter table public.credit_collection_links enable row level security;',
  'alter table public.contributor_submissions enable row level security;',
  'alter table public.credit_finalizations enable row level security;',
].join('\n');

export const roleNeedsPublishingDetails = (roleType: string): boolean => {
  const normalized = String(roleType || '').trim().toLowerCase();
  return normalized === 'songwriter' || normalized === 'composer';
};

export const roleEmphasis = (roleType: string) => {
  const normalized = String(roleType || '').trim().toLowerCase();
  if (normalized === 'songwriter' || normalized === 'composer') {
    return 'Publishing, PRO details, and split percentages matter most for this role.';
  }
  if (normalized === 'producer') {
    return 'Confirm the producer credit name and add publishing details if they apply.';
  }
  if (normalized === 'mixing engineer' || normalized === 'mastering engineer') {
    return 'Engineering credits are usually straightforward. Publishing details can stay optional.';
  }
  if (normalized === 'featured artist') {
    return 'Make sure the credited name is exactly how it should appear on the release.';
  }
  return 'Add the credit details that best describe your contribution to the song.';
};

export const emptyContributorSubmissionInput = (): ContributorSubmissionInput => ({
  legalFullName: '',
  creditedName: '',
  email: '',
  phoneNumber: '',
  roleType: 'other',
  contributionNotes: '',
  performingNameIfDifferent: '',
  proAffiliation: '',
  ipiCaeNumber: '',
  publisherName: '',
  splitPercentage: '',
  isSplitConfirmed: false,
  country: '',
  socialHandle: '',
  additionalNotes: '',
});

export const normalizeSubmissionInput = (value: unknown): ContributorSubmissionInput => {
  const source = (value || {}) as Partial<Record<keyof ContributorSubmissionInput, unknown>>;
  const roleCandidate = String(source.roleType || 'other').trim().toLowerCase();
  const roleType = (CREDIT_ROLE_OPTIONS.find((item) => item === roleCandidate) || 'other') as CreditRoleType;

  return {
    legalFullName: String(source.legalFullName || '').trim(),
    creditedName: String(source.creditedName || '').trim(),
    email: String(source.email || '').trim().toLowerCase(),
    phoneNumber: String(source.phoneNumber || '').trim(),
    roleType,
    contributionNotes: String(source.contributionNotes || '').trim(),
    performingNameIfDifferent: String(source.performingNameIfDifferent || '').trim(),
    proAffiliation: String(source.proAffiliation || '').trim(),
    ipiCaeNumber: String(source.ipiCaeNumber || '').trim(),
    publisherName: String(source.publisherName || '').trim(),
    splitPercentage: String(source.splitPercentage || '').trim(),
    isSplitConfirmed: Boolean(source.isSplitConfirmed),
    country: String(source.country || '').trim(),
    socialHandle: String(source.socialHandle || '').trim(),
    additionalNotes: String(source.additionalNotes || '').trim(),
  };
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const splitPattern = /^\d+(\.\d{1,2})?$/;

export const validateContributorSubmissionInput = (
  input: ContributorSubmissionInput
): { valid: true } | { valid: false; error: string } => {
  if (!input.legalFullName && !input.creditedName) {
    return { valid: false, error: 'Add your legal name or credited name before submitting.' };
  }

  if (!input.roleType) {
    return { valid: false, error: 'Choose the role that best matches your contribution.' };
  }

  if (!input.email || !emailPattern.test(input.email)) {
    return { valid: false, error: 'Enter a valid email address.' };
  }

  if (input.splitPercentage && !splitPattern.test(input.splitPercentage)) {
    return { valid: false, error: 'Split percentage must be numeric.' };
  }

  if (roleNeedsPublishingDetails(input.roleType) && !input.splitPercentage) {
    return { valid: false, error: 'Split percentage is required for songwriter and composer credits.' };
  }

  return { valid: true };
};

const readNullableString = (value: unknown): string => String(value || '').trim();

export const toClientCollectionLink = (row: Record<string, unknown>): CreditCollectionLink => ({
  id: String(row.id || ''),
  releaseId: String(row.release_id || ''),
  token: String(row.token || ''),
  isActive: Boolean(row.is_active),
  createdAt: String(row.created_at || ''),
  expiresAt: row.expires_at ? String(row.expires_at) : null,
});

export const toClientContributorSubmission = (row: Record<string, unknown>): ContributorSubmission => ({
  id: String(row.id || ''),
  releaseId: String(row.release_id || ''),
  collectionLinkId: String(row.collection_link_id || ''),
  legalFullName: readNullableString(row.legal_full_name),
  creditedName: readNullableString(row.credited_name),
  email: readNullableString(row.email),
  phoneNumber: readNullableString(row.phone_number),
  roleType: (CREDIT_ROLE_OPTIONS.find((item) => item === String(row.role_type || '').trim().toLowerCase()) || 'other') as CreditRoleType,
  contributionNotes: readNullableString(row.contribution_notes),
  performingNameIfDifferent: readNullableString(row.performing_name_if_different),
  proAffiliation: readNullableString(row.pro_affiliation),
  ipiCaeNumber: readNullableString(row.ipi_cae_number),
  publisherName: readNullableString(row.publisher_name),
  splitPercentage: row.split_percentage === null || row.split_percentage === undefined ? '' : String(row.split_percentage),
  isSplitConfirmed: Boolean(row.is_split_confirmed),
  country: readNullableString(row.country),
  socialHandle: readNullableString(row.social_handle),
  additionalNotes: readNullableString(row.additional_notes),
  submissionStatus: 'submitted',
  submittedAt: String(row.submitted_at || ''),
  updatedAt: String(row.updated_at || ''),
});

export const toClientCreditFinalization = (row: Record<string, unknown>): CreditFinalization => ({
  releaseId: String(row.release_id || ''),
  isFinalized: Boolean(row.is_finalized),
  finalizedAt: row.finalized_at ? String(row.finalized_at) : null,
  finalizedByUserId: row.finalized_by_user_id ? String(row.finalized_by_user_id) : null,
});
