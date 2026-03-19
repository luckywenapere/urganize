export const RELEASE_NOTES_TABLE = 'release_notes';

export const RELEASE_NOTES_SQL = [
  `create table if not exists public.${RELEASE_NOTES_TABLE} (`,
  '  id uuid primary key default gen_random_uuid(),',
  '  user_id uuid not null references auth.users(id) on delete cascade,',
  '  release_id uuid null references public.releases(id) on delete set null,',
  '  title text not null default \'\',',
  '  content text not null default \'\',',
  '  note_type text null,',
  '  is_pinned boolean not null default false,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  `create index if not exists ${RELEASE_NOTES_TABLE}_user_updated_idx on public.${RELEASE_NOTES_TABLE}(user_id, is_pinned desc, updated_at desc);`,
  `create index if not exists ${RELEASE_NOTES_TABLE}_release_idx on public.${RELEASE_NOTES_TABLE}(release_id, is_pinned desc, updated_at desc);`,
  '',
  `alter table public.${RELEASE_NOTES_TABLE} enable row level security;`,
].join('\n');

export const NOTE_TYPE_OPTIONS = [
  'general',
  'reminder',
  'idea',
  'task note',
  'meeting note',
  'lyric note',
  'rollout note',
] as const;

export type NoteType = (typeof NOTE_TYPE_OPTIONS)[number];

export type ReleaseNote = {
  id: string;
  userId: string;
  releaseId: string;
  title: string;
  content: string;
  noteType: NoteType | '';
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  releaseTitle: string;
  releaseArtistName: string;
};

export type ReleaseNoteInput = {
  title: string;
  content: string;
  releaseId: string;
  noteType: NoteType | '';
  isPinned: boolean;
};

export type ReleaseOption = {
  id: string;
  title: string;
  artistName: string;
  label: string;
};

export const emptyReleaseNoteInput: ReleaseNoteInput = {
  title: '',
  content: '',
  releaseId: '',
  noteType: '',
  isPinned: false,
};

const trimString = (value: unknown): string => String(value || '').trim();

export const normalizeNoteType = (value: unknown): NoteType | '' => {
  const candidate = trimString(value).toLowerCase();
  return NOTE_TYPE_OPTIONS.find((option) => option === candidate) || '';
};

export const normalizeReleaseNoteInput = (value: unknown): ReleaseNoteInput => {
  const raw = (value || {}) as Partial<ReleaseNoteInput>;
  return {
    title: trimString(raw.title),
    content: trimString(raw.content),
    releaseId: trimString(raw.releaseId),
    noteType: normalizeNoteType(raw.noteType),
    isPinned: Boolean(raw.isPinned),
  };
};

export const validateReleaseNoteInput = (value: ReleaseNoteInput): string => {
  if (!value.title && !value.content) {
    return 'Add a title or note content before saving.';
  }
  return '';
};

export const getReleaseNotePreview = (value: string, maxLength = 140): string => {
  const normalized = trimString(value).replace(/\s+/g, ' ');
  if (!normalized) return 'No note content yet.';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
};

export const sortReleaseNotes = <T extends { isPinned: boolean; updatedAt: string }>(notes: T[]): T[] =>
  [...notes].sort((left, right) => {
    if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
