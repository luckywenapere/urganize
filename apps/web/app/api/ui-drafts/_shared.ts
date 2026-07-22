// Canonical auth helpers live in app/api/_shared/auth.ts; re-exported here
// so the ui-drafts route import sites stay stable.
export {
  getAuthenticatedUser,
  requireActiveAuthenticatedUser,
  requireAuthenticatedAdmin,
  getAuthenticatedAdmin,
  createAdminClient,
} from '@/app/api/_shared/auth';

export const UI_DRAFTS_TABLE = 'ui_state_drafts';

export const UI_DRAFTS_TABLE_SQL = [
  'create extension if not exists pgcrypto;',
  '',
  'create table if not exists public.ui_state_drafts (',
  '  id uuid primary key default gen_random_uuid(),',
  '  user_id uuid not null references auth.users(id) on delete cascade,',
  '  draft_key text not null,',
  '  scope text not null,',
  '  payload_json jsonb not null default \'{}\'::jsonb,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now(),',
  '  unique (user_id, draft_key)',
  ');',
  '',
  'create index if not exists ui_state_drafts_user_scope_idx on public.ui_state_drafts(user_id, scope);',
  '',
  'alter table public.ui_state_drafts enable row level security;',
].join('\n');

export const isOptionalTableMissingError = (error: unknown): boolean => {
  const code = String((error as { code?: string } | null)?.code || '').toUpperCase();
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    (message.includes('relation') && message.includes('does not exist'))
  );
};
