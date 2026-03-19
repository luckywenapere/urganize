import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { LISTENER_PROFILE_FIELDS, normalizeListenerProfileInputs, type ListenerProfileInputs } from '@/lib/listener-profile';

export const LISTENER_PROFILE_TABLE = 'listener_profile_inputs';

export const LISTENER_PROFILE_TABLE_SQL = [
  'create table if not exists public.listener_profile_inputs (',
  '  id uuid primary key default gen_random_uuid(),',
  '  user_id uuid not null unique references auth.users(id) on delete cascade,',
  '  workspace_id uuid null references public.releases(id) on delete set null,',
  '  artist_id uuid null references public.profiles(id) on delete set null,',
  '  artist_name text null,',
  '  primary_genre text null,',
  '  subgenre_influences text null,',
  '  music_mood text null,',
  '  lyric_themes text null,',
  '  music_languages text null,',
  '  similar_artists text null,',
  '  artist_aesthetic text null,',
  '  fashion_influence text null,',
  '  brand_message text null,',
  '  artist_personality text null,',
  '  artist_values text null,',
  '  listener_age_range text null,',
  '  listener_gender_tendency text null,',
  '  listener_countries text null,',
  '  listener_cities_regions text null,',
  '  listener_languages text null,',
  '  listener_lifestyle text null,',
  '  listener_interests text null,',
  '  listener_communities text null,',
  '  listener_platforms text null,',
  '  listener_activity_time text null,',
  '  music_discovery text null,',
  '  listener_emotions text null,',
  '  listener_problems text null,',
  '  listener_aspirations text null,',
  '  listener_share_triggers text null,',
  '  listener_loyalty_triggers text null,',
  '  campaign_visual_triggers text null,',
  '  campaign_message_style text null,',
  '  campaign_content_hooks text null,',
  '  generated_persona jsonb null,',
  '  generated_at timestamptz null,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  'create index if not exists listener_profile_inputs_user_id_idx on public.listener_profile_inputs(user_id);',
  '',
  'alter table public.listener_profile_inputs enable row level security;',
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

export const listenerProfileSelectColumns = [
  'id',
  'user_id',
  'workspace_id',
  'artist_id',
  ...LISTENER_PROFILE_FIELDS.map((field) => field.key),
  'generated_persona',
  'generated_at',
  'created_at',
  'updated_at',
].join(',');

export const mapRowToInputs = (row: Record<string, unknown> | null | undefined): ListenerProfileInputs => {
  if (!row) return normalizeListenerProfileInputs(null);
  return normalizeListenerProfileInputs(row);
};

export const mapInputsToDbPayload = (inputs: ListenerProfileInputs): Record<string, string | null> => {
  const payload: Record<string, string | null> = {};
  for (const field of LISTENER_PROFILE_FIELDS) {
    payload[field.key] = inputs[field.key];
  }
  return payload;
};
