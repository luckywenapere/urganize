export const SONGS_TABLE = 'song_library_songs';
export const SONG_CONTRIBUTORS_TABLE = 'song_library_contributors';
export const SONG_PUBLISHING_TABLE = 'song_library_publishing';
export const SONG_PRODUCTION_TABLE = 'song_library_production';
export const SONG_ADMINISTRATIVE_TABLE = 'song_library_administrative';
export const SONG_NOTES_TABLE = 'song_library_notes';

export const SONG_LIBRARY_SQL = [
  `create table if not exists public.${SONGS_TABLE} (`,
  '  id uuid primary key default gen_random_uuid(),',
  '  user_id uuid not null references auth.users(id) on delete cascade,',
  '  song_title text not null,',
  '  primary_artist text not null,',
  '  project_or_release text null,',
  '  release_id uuid null references public.releases(id) on delete set null,',
  '  featured_artists text[] not null default array[]::text[],',
  '  isrc text null,',
  '  duration text null,',
  '  genre text null,',
  '  language text null,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  `create table if not exists public.${SONG_CONTRIBUTORS_TABLE} (`,
  '  id uuid primary key default gen_random_uuid(),',
  `  song_id uuid not null references public.${SONGS_TABLE}(id) on delete cascade,`,
  '  legal_name text not null,',
  '  credited_name text null,',
  '  role text not null,',
  '  email text null,',
  '  pro_affiliation text null,',
  '  ipi_number text null,',
  '  split_percentage numeric(5,2) null,',
  '  notes text null,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  `create table if not exists public.${SONG_PUBLISHING_TABLE} (`,
  `  song_id uuid primary key references public.${SONGS_TABLE}(id) on delete cascade,`,
  '  songwriter text null,',
  '  composer text null,',
  '  publisher text null,',
  '  pro_affiliation text null,',
  '  ipi_number text null,',
  '  ownership_split text null,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  `create table if not exists public.${SONG_PRODUCTION_TABLE} (`,
  `  song_id uuid primary key references public.${SONGS_TABLE}(id) on delete cascade,`,
  '  producer text null,',
  '  mixing_engineer text null,',
  '  mastering_engineer text null,',
  '  recording_studio text null,',
  '  recording_date date null,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  `create table if not exists public.${SONG_ADMINISTRATIVE_TABLE} (`,
  `  song_id uuid primary key references public.${SONGS_TABLE}(id) on delete cascade,`,
  '  copyright_owner text null,',
  '  label text null,',
  '  distributor text null,',
  '  upc text null,',
  '  territory_restrictions text null,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  `create table if not exists public.${SONG_NOTES_TABLE} (`,
  `  song_id uuid primary key references public.${SONGS_TABLE}(id) on delete cascade,`,
  '  internal_notes text null,',
  '  additional_metadata text null,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  `create index if not exists ${SONGS_TABLE}_user_updated_idx on public.${SONGS_TABLE}(user_id, updated_at desc);`,
  `create index if not exists ${SONGS_TABLE}_release_idx on public.${SONGS_TABLE}(release_id);`,
  `create index if not exists ${SONG_CONTRIBUTORS_TABLE}_song_idx on public.${SONG_CONTRIBUTORS_TABLE}(song_id);`,
  '',
  `alter table public.${SONGS_TABLE} enable row level security;`,
  `alter table public.${SONG_CONTRIBUTORS_TABLE} enable row level security;`,
  `alter table public.${SONG_PUBLISHING_TABLE} enable row level security;`,
  `alter table public.${SONG_PRODUCTION_TABLE} enable row level security;`,
  `alter table public.${SONG_ADMINISTRATIVE_TABLE} enable row level security;`,
  `alter table public.${SONG_NOTES_TABLE} enable row level security;`,
].join('\n');

export const SONG_ROLE_OPTIONS = [
  'Primary Artist',
  'Featured Artist',
  'Songwriter',
  'Composer',
  'Producer',
  'Mixing Engineer',
  'Mastering Engineer',
  'Instrumentalist',
  'Background Vocalist',
  'Other',
] as const;

export type SongRole = (typeof SONG_ROLE_OPTIONS)[number];

export type SongRecord = {
  id: string;
  userId: string;
  songTitle: string;
  primaryArtist: string;
  projectOrRelease: string;
  releaseId: string;
  featuredArtists: string[];
  isrc: string;
  duration: string;
  genre: string;
  language: string;
  createdAt: string;
  updatedAt: string;
};

export type SongContributor = {
  id: string;
  songId: string;
  legalName: string;
  creditedName: string;
  role: SongRole;
  email: string;
  proAffiliation: string;
  ipiNumber: string;
  splitPercentage: string;
  notes: string;
};

export type SongPublishing = {
  songwriter: string;
  composer: string;
  publisher: string;
  proAffiliation: string;
  ipiNumber: string;
  ownershipSplit: string;
};

export type SongProduction = {
  producer: string;
  mixingEngineer: string;
  masteringEngineer: string;
  recordingStudio: string;
  recordingDate: string;
};

export type SongAdministrative = {
  copyrightOwner: string;
  label: string;
  distributor: string;
  upc: string;
  territoryRestrictions: string;
};

export type SongNotes = {
  internalNotes: string;
  additionalMetadata: string;
};

export type SongDetail = {
  song: SongRecord;
  contributors: SongContributor[];
  publishing: SongPublishing;
  production: SongProduction;
  administrative: SongAdministrative;
  notes: SongNotes;
};

export type SongListItem = {
  id: string;
  songTitle: string;
  primaryArtist: string;
  isrc: string;
  contributorCount: number;
  associatedRelease: string;
  updatedAt: string;
};

export type SongFormInput = {
  songTitle: string;
  primaryArtist: string;
  projectOrRelease: string;
  releaseId: string;
  featuredArtistsText: string;
  isrc: string;
  duration: string;
  genre: string;
  language: string;
};

export const emptySongFormInput: SongFormInput = {
  songTitle: '',
  primaryArtist: '',
  projectOrRelease: '',
  releaseId: '',
  featuredArtistsText: '',
  isrc: '',
  duration: '',
  genre: '',
  language: '',
};

export const emptySongContributor = (): SongContributor => ({
  id: '',
  songId: '',
  legalName: '',
  creditedName: '',
  role: 'Songwriter',
  email: '',
  proAffiliation: '',
  ipiNumber: '',
  splitPercentage: '',
  notes: '',
});

export const emptySongPublishing: SongPublishing = {
  songwriter: '',
  composer: '',
  publisher: '',
  proAffiliation: '',
  ipiNumber: '',
  ownershipSplit: '',
};

export const emptySongProduction: SongProduction = {
  producer: '',
  mixingEngineer: '',
  masteringEngineer: '',
  recordingStudio: '',
  recordingDate: '',
};

export const emptySongAdministrative: SongAdministrative = {
  copyrightOwner: '',
  label: '',
  distributor: '',
  upc: '',
  territoryRestrictions: '',
};

export const emptySongNotes: SongNotes = {
  internalNotes: '',
  additionalMetadata: '',
};

const trimString = (value: unknown): string => String(value || '').trim();

const normalizeRole = (value: unknown): SongRole => {
  const candidate = SONG_ROLE_OPTIONS.find((role) => role.toLowerCase() === trimString(value).toLowerCase());
  return candidate || 'Other';
};

export const normalizeFeaturedArtists = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => trimString(item)).filter(Boolean);
  }

  return trimString(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export const normalizeSongFormInput = (value: unknown): SongFormInput => {
  const raw = (value || {}) as Partial<SongFormInput>;
  return {
    songTitle: trimString(raw.songTitle),
    primaryArtist: trimString(raw.primaryArtist),
    projectOrRelease: trimString(raw.projectOrRelease),
    releaseId: trimString(raw.releaseId),
    featuredArtistsText: Array.isArray(raw.featuredArtistsText)
      ? normalizeFeaturedArtists(raw.featuredArtistsText).join(', ')
      : trimString(raw.featuredArtistsText),
    isrc: trimString(raw.isrc),
    duration: trimString(raw.duration),
    genre: trimString(raw.genre),
    language: trimString(raw.language),
  };
};

export const normalizeSongContributor = (value: unknown): SongContributor => {
  const raw = (value || {}) as Partial<SongContributor>;
  const splitPercentage = trimString(raw.splitPercentage);
  return {
    id: trimString(raw.id),
    songId: trimString(raw.songId),
    legalName: trimString(raw.legalName),
    creditedName: trimString(raw.creditedName),
    role: normalizeRole(raw.role),
    email: trimString(raw.email),
    proAffiliation: trimString(raw.proAffiliation),
    ipiNumber: trimString(raw.ipiNumber),
    splitPercentage,
    notes: trimString(raw.notes),
  };
};

export const normalizeSongContributors = (value: unknown): SongContributor[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeSongContributor(item))
    .filter((item) => item.legalName || item.creditedName || item.email || item.notes);
};

export const normalizeSongPublishing = (value: unknown): SongPublishing => {
  const raw = (value || {}) as Partial<SongPublishing>;
  return {
    songwriter: trimString(raw.songwriter),
    composer: trimString(raw.composer),
    publisher: trimString(raw.publisher),
    proAffiliation: trimString(raw.proAffiliation),
    ipiNumber: trimString(raw.ipiNumber),
    ownershipSplit: trimString(raw.ownershipSplit),
  };
};

export const normalizeSongProduction = (value: unknown): SongProduction => {
  const raw = (value || {}) as Partial<SongProduction>;
  return {
    producer: trimString(raw.producer),
    mixingEngineer: trimString(raw.mixingEngineer),
    masteringEngineer: trimString(raw.masteringEngineer),
    recordingStudio: trimString(raw.recordingStudio),
    recordingDate: trimString(raw.recordingDate),
  };
};

export const normalizeSongAdministrative = (value: unknown): SongAdministrative => {
  const raw = (value || {}) as Partial<SongAdministrative>;
  return {
    copyrightOwner: trimString(raw.copyrightOwner),
    label: trimString(raw.label),
    distributor: trimString(raw.distributor),
    upc: trimString(raw.upc),
    territoryRestrictions: trimString(raw.territoryRestrictions),
  };
};

export const normalizeSongNotes = (value: unknown): SongNotes => {
  const raw = (value || {}) as Partial<SongNotes>;
  return {
    internalNotes: trimString(raw.internalNotes),
    additionalMetadata: trimString(raw.additionalMetadata),
  };
};

export const toSongFormInput = (song: SongRecord | null | undefined): SongFormInput => {
  if (!song) return emptySongFormInput;
  return {
    songTitle: song.songTitle,
    primaryArtist: song.primaryArtist,
    projectOrRelease: song.projectOrRelease,
    releaseId: song.releaseId,
    featuredArtistsText: song.featuredArtists.join(', '),
    isrc: song.isrc,
    duration: song.duration,
    genre: song.genre,
    language: song.language,
  };
};

export const validateSongFormInput = (value: SongFormInput): string => {
  if (!trimString(value.songTitle)) return 'Song title is required.';
  if (!trimString(value.primaryArtist)) return 'Primary artist is required.';
  return '';
};

export const validateSongContributor = (value: SongContributor): string => {
  if (!value.legalName && !value.creditedName) return 'Contributor needs a legal name or credited name.';
  if (!value.role) return 'Contributor role is required.';
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) return 'Contributor email is invalid.';
  if (value.splitPercentage && !/^\d+(\.\d+)?$/.test(value.splitPercentage)) {
    return 'Split percentage must be numeric.';
  }
  return '';
};

export const contributorDisplayName = (contributor: SongContributor): string =>
  contributor.creditedName || contributor.legalName || 'Unnamed contributor';

export const buildSongSearchValue = (song: SongListItem, contributorNames: string[]): string =>
  [song.songTitle, song.primaryArtist, song.isrc, song.associatedRelease, ...contributorNames]
    .join(' ')
    .toLowerCase();
