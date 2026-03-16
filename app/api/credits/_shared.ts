import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  CREDIT_COLLECTION_LINKS_TABLE,
  CONTRIBUTOR_SUBMISSIONS_TABLE,
  CREDIT_FINALIZATIONS_TABLE,
  CREDITS_COLLECTION_SQL,
} from '@/lib/credits';

export {
  CREDIT_COLLECTION_LINKS_TABLE,
  CONTRIBUTOR_SUBMISSIONS_TABLE,
  CREDIT_FINALIZATIONS_TABLE,
  CREDITS_COLLECTION_SQL,
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

export async function ensureReleaseOwnership(
  adminClient: ReturnType<typeof createAdminClient>,
  planId: string,
  userId: string
) {
  if (!adminClient) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }

  const { data: release, error } = await adminClient
    .from('releases')
    .select('id,user_id,title,artist_name,release_date')
    .eq('id', planId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message || 'Could not load release.' }, { status: 500 }) };
  }

  if (!release || release.user_id !== userId) {
    return { error: NextResponse.json({ error: 'Release not found.' }, { status: 404 }) };
  }

  return { release };
}

export async function findActiveCollectionLinkByToken(
  adminClient: ReturnType<typeof createAdminClient>,
  token: string
) {
  if (!adminClient) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }

  const { data: link, error } = await adminClient
    .from(CREDIT_COLLECTION_LINKS_TABLE)
    .select('id,release_id,token,is_active,created_at,expires_at')
    .eq('token', token)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return {
        error: NextResponse.json(
          { error: 'Credits collection tables are missing.', sql: CREDITS_COLLECTION_SQL },
          { status: 501 }
        ),
      };
    }
    return { error: NextResponse.json({ error: error.message || 'Could not load collection link.' }, { status: 500 }) };
  }

  if (!link) {
    return { error: NextResponse.json({ error: 'This credit collection link is unavailable.' }, { status: 404 }) };
  }

  return { link };
}
