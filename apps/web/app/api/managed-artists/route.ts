import { NextRequest, NextResponse } from 'next/server';
import {
  assertManagerRole,
  createAdminClient,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  MANAGED_ARTISTS_SQL,
  MANAGED_ARTISTS_TABLE,
  toClientArtist,
  type ManagedArtistRecord,
} from './_shared';

type SaveManagedArtistBody = {
  name?: string;
  genre?: string;
  notes?: string;
};

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const roleResult = await assertManagerRole(adminClient, auth.user.id);
  if ('error' in roleResult) return roleResult.error;

  const { data, error } = await adminClient
    .from(MANAGED_ARTISTS_TABLE)
    .select('id,manager_user_id,name,genre,primary_platform,notes,created_at,updated_at')
    .eq('manager_user_id', auth.user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({ error: 'Managed artists table is missing', sql: MANAGED_ARTISTS_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: error.message || 'Could not load managed artists' }, { status: 500 });
  }

  const artists = Array.isArray(data) ? (data as ManagedArtistRecord[]).map(toClientArtist) : [];
  return NextResponse.json({ artists });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const roleResult = await assertManagerRole(adminClient, auth.user.id);
  if ('error' in roleResult) return roleResult.error;

  const body = (await request.json().catch(() => ({}))) as SaveManagedArtistBody;
  const name = String(body.name || '').trim();
  if (!name) {
    return NextResponse.json({ error: 'Artist name is required' }, { status: 400 });
  }

  const payload = {
    manager_user_id: auth.user.id,
    name,
    genre: String(body.genre || '').trim() || null,
    notes: String(body.notes || '').trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminClient
    .from(MANAGED_ARTISTS_TABLE)
    .insert(payload)
    .select('id,manager_user_id,name,genre,primary_platform,notes,created_at,updated_at')
    .single();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({ error: 'Managed artists table is missing', sql: MANAGED_ARTISTS_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: error.message || 'Could not save managed artist' }, { status: 500 });
  }

  return NextResponse.json({ artist: toClientArtist(data as ManagedArtistRecord) });
}
