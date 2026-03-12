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
} from '../_shared';

type UpdateManagedArtistBody = {
  name?: string;
  genre?: string;
  notes?: string;
};

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ artistId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const roleResult = await assertManagerRole(adminClient, auth.user.id);
  if ('error' in roleResult) return roleResult.error;

  const { artistId } = await context.params;
  if (!artistId) {
    return NextResponse.json({ error: 'artistId is required' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as UpdateManagedArtistBody;
  const name = String(body.name || '').trim();
  if (!name) {
    return NextResponse.json({ error: 'Artist name is required' }, { status: 400 });
  }

  const { data, error } = await adminClient
    .from(MANAGED_ARTISTS_TABLE)
    .update({
      name,
      genre: String(body.genre || '').trim() || null,
      notes: String(body.notes || '').trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', artistId)
    .eq('manager_user_id', auth.user.id)
    .select('id,manager_user_id,name,genre,primary_platform,notes,created_at,updated_at')
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({ error: 'Managed artists table is missing', sql: MANAGED_ARTISTS_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: error.message || 'Could not update managed artist' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
  }

  return NextResponse.json({ artist: toClientArtist(data as ManagedArtistRecord) });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ artistId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const roleResult = await assertManagerRole(adminClient, auth.user.id);
  if ('error' in roleResult) return roleResult.error;

  const { artistId } = await context.params;
  if (!artistId) {
    return NextResponse.json({ error: 'artistId is required' }, { status: 400 });
  }

  const { error } = await adminClient
    .from(MANAGED_ARTISTS_TABLE)
    .delete()
    .eq('id', artistId)
    .eq('manager_user_id', auth.user.id);

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({ error: 'Managed artists table is missing', sql: MANAGED_ARTISTS_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: error.message || 'Could not remove managed artist' }, { status: 500 });
  }

  return NextResponse.json({ status: 'deleted' });
}
