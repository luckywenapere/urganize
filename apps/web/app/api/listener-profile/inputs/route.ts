import { NextRequest, NextResponse } from 'next/server';
import { normalizeListenerProfileInputs } from '@/lib/listener-profile';
import {
  createAdminClient,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  LISTENER_PROFILE_TABLE,
  LISTENER_PROFILE_TABLE_SQL,
  listenerProfileSelectColumns,
  mapInputsToDbPayload,
  mapRowToInputs,
} from '../_shared';

type SaveListenerInputsRequest = {
  workspaceId?: string | null;
  artistId?: string | null;
  inputs?: Record<string, unknown>;
};

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { data, error } = await adminClient
    .from(LISTENER_PROFILE_TABLE)
    .select(listenerProfileSelectColumns)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({ error: 'Listener profile table is missing', sql: LISTENER_PROFILE_TABLE_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: error.message || 'Could not load listener profile inputs' }, { status: 500 });
  }
  const row = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;

  return NextResponse.json({
    exists: Boolean(row),
    inputs: mapRowToInputs(row),
    workspaceId: String(row?.workspace_id || '').trim() || null,
    artistId: String(row?.artist_id || '').trim() || null,
    generatedAt: String(row?.generated_at || '').trim() || null,
    updatedAt: String(row?.updated_at || '').trim() || null,
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as SaveListenerInputsRequest;
  const inputs = normalizeListenerProfileInputs((body.inputs || null) as Record<string, unknown> | null);
  const workspaceId = String(body.workspaceId || '').trim() || null;
  const artistId = String(body.artistId || '').trim() || null;

  const payload = {
    user_id: auth.user.id,
    workspace_id: workspaceId,
    artist_id: artistId,
    ...mapInputsToDbPayload(inputs),
    updated_at: new Date().toISOString(),
  };

  const { error } = await adminClient.from(LISTENER_PROFILE_TABLE).upsert(payload, { onConflict: 'user_id' });
  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({ error: 'Listener profile table is missing', sql: LISTENER_PROFILE_TABLE_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: error.message || 'Could not save listener profile inputs' }, { status: 500 });
  }

  return NextResponse.json({ status: 'saved', inputs });
}
