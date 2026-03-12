import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const MANAGED_ARTISTS_TABLE = 'managed_artists';

export const MANAGED_ARTISTS_SQL = [
  'create extension if not exists pgcrypto;',
  '',
  'create table if not exists public.managed_artists (',
  '  id uuid primary key default gen_random_uuid(),',
  '  manager_user_id uuid not null references auth.users(id) on delete cascade,',
  '  name text not null,',
  '  genre text null,',
  '  primary_platform text null,',
  '  notes text null,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  'create index if not exists managed_artists_manager_user_id_idx on public.managed_artists(manager_user_id);',
  '',
  'alter table public.managed_artists enable row level security;',
].join('\n');

export type ManagedArtistRecord = {
  id: string;
  manager_user_id: string;
  name: string;
  genre: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

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

export const assertManagerRole = async (adminClient: ReturnType<typeof createAdminClient>, userId: string) => {
  const { data: profile, error } = await adminClient!
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message || 'Could not verify role' }, { status: 500 }) };
  }

  const role = String(profile?.role || '')
    .trim()
    .toLowerCase();
  if (role !== 'manager' && role !== 'artist-manager') {
    return { error: NextResponse.json({ error: 'Only manager accounts can manage artists' }, { status: 403 }) };
  }

  return { ok: true as const };
};

export const toClientArtist = (row: ManagedArtistRecord) => ({
  id: row.id,
  name: row.name || '',
  genre: row.genre || '',
  notes: row.notes || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
