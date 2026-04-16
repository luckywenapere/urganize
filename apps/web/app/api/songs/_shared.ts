import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  SONGS_TABLE,
  SONG_CONTRIBUTORS_TABLE,
  SONG_PUBLISHING_TABLE,
  SONG_PRODUCTION_TABLE,
  SONG_ADMINISTRATIVE_TABLE,
  SONG_NOTES_TABLE,
  SONG_LIBRARY_SQL,
} from '@/lib/song-library';

export {
  SONGS_TABLE,
  SONG_CONTRIBUTORS_TABLE,
  SONG_PUBLISHING_TABLE,
  SONG_PRODUCTION_TABLE,
  SONG_ADMINISTRATIVE_TABLE,
  SONG_NOTES_TABLE,
  SONG_LIBRARY_SQL,
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

export async function ensureSongOwnership(
  adminClient: ReturnType<typeof createAdminClient>,
  songId: string,
  userId: string
) {
  if (!adminClient) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }

  const { data: song, error } = await adminClient
    .from(SONGS_TABLE)
    .select('id,user_id')
    .eq('id', songId)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return {
        error: NextResponse.json(
          { error: 'Song library tables are missing.', sql: SONG_LIBRARY_SQL },
          { status: 501 }
        ),
      };
    }
    return { error: NextResponse.json({ error: error.message || 'Could not load song.' }, { status: 500 }) };
  }

  if (!song || song.user_id !== userId) {
    return { error: NextResponse.json({ error: 'Song not found.' }, { status: 404 }) };
  }

  return { song };
}
