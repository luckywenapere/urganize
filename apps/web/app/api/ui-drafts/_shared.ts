import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

// Combined auth + global access gate. Returns 401 on bad auth, 402 on no
// active paid/trial access. See apps/web/app/api/_shared/paywall.ts.
export const requireActiveAuthenticatedUser = async (request: NextRequest) => {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth;
  const { requireActiveAccount } = await import('@/app/api/_shared/paywall');
  const block = await requireActiveAccount(auth.user.id, auth.user.email);
  if (block) return { error: block };
  return auth;
};

export const getAuthenticatedUser = async (request: NextRequest) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);
  if (userError || !user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { user, supabaseUrl };
};

export const createAdminClient = (supabaseUrl: string) => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
};
